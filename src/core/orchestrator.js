import http from "node:http";
import { loadConfig } from "../config/index.js";
import { createLogger } from "../monitoring/logger.js";
import { Metrics } from "../monitoring/metrics.js";
import { openPool, health, migrate } from "../db/database.js";
import { Repository } from "../db/repository.js";
import { AgentRegistry, loadProfiles } from "../agents/agent-registry.js";
import { MessageBus } from "../coordination/message-bus.js";
import { BotManager } from "./bot-manager.js";
import { connect } from "../minecraft/connection.js";
import { NvidiaNim } from "../ai/providers/nvidia-nim.js";
import { ContextManager } from "../ai/context-manager.js";
import { LlmGateway } from "../ai/llm-gateway.js";
export async function boot(c = loadConfig(), services = {}) {
  if (!c.MC_AUTHORIZED || (c.MC_AUTH === "offline" && !c.MC_OFFLINE_AUTHORIZED))
    throw Error("Set explicit server and authentication authorizations first");
  const log = services.logger ?? createLogger(c.APP_NAME),
    metrics = new Metrics(),
    bus = new MessageBus(log),
    pool = services.pool ?? openPool(c),
    repo = new Repository(pool),
    contexts = new ContextManager(),
    provider = services.provider ?? new NvidiaNim(c),
    gateway = new LlmGateway(c, provider, contexts, bus, metrics),
    manager = new BotManager(
      c,
      new AgentRegistry(),
      bus,
      services.connect ?? connect,
      metrics,
    );
  let server, closing;
  const jobs = new Set();
  function close() {
    return (closing ??= (async () => {
      if (server?.listening) await new Promise((r) => server.close(r));
      await manager.close();
      await Promise.allSettled([...jobs]);
      await bus.queue.drain();
      await pool.end();
      metrics.close();
    })());
  }
  try {
    metrics.values.databaseConnected = await health(pool);
    await migrate(pool);
    await provider.verify();
    for (const p of await loadProfiles()) {
      manager.register(p);
      await repo.profile(p);
    }
    bus.on("*", (e) => repo.record(e));
    bus.on("*", (e) =>
      log.info(
        {
          agentId: e.agentId,
          type: e.type,
          correlationId: e.correlationId,
          reason: e.type === "BOT_ERROR" ? e.payload.message : undefined,
        },
        "Agent event",
      ),
    );
    bus.on("BOT_SPAWNED", ({ agentId }) => {
      const s = manager.active.get(agentId)?.s;
      if (!closing && s?.aiEnabled && s.status === "CONNECTED") {
        contexts.set(s, s.aiContext);
        const job = gateway
          .decide(agentId)
          .catch(() => log.warn({ agentId }, "Decision unavailable"))
          .finally(() => jobs.delete(job));
        jobs.add(job);
      }
    });
    server = http.createServer(async (req, res) => {
      if (req.url !== "/metrics" || req.method !== "GET") {
        res.writeHead(404).end();
        return;
      }
      try {
        metrics.values.databaseConnected = await health(pool);
      } catch {
        metrics.values.databaseConnected = false;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          ...metrics.snapshot(),
          ...manager.stats(),
          eventQueueSize: bus.queue.items.length,
          droppedEvents: bus.dropped,
        }),
      );
    });
    await new Promise((r, j) =>
      server.once("error", j).listen(c.PORT, "127.0.0.1", r),
    );
    for (const p of manager.registry
      .all()
      .filter((p) => p.enabled)
      .slice(0, c.INITIAL_BOT_LIMIT))
      manager.start(p.id);
    return { manager, gateway, close };
  } catch (e) {
    await close();
    throw e;
  }
}
