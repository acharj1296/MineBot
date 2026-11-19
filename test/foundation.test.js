import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/config/index.js";
// Real orchestrator/registry/manager/gateway/bus/repository, doubles only at external boundaries.
test("one spawn produces a correlated validated decision and transactional writes before shutdown", async () => {
  const writes = [];
  let finish,
    closed = false;
  const persisted = new Promise((r) => (finish = r));
  const conn = {
    query: async () => [[{ locked: 1 }]],
    execute: async (q, args) => {
      writes.push([q, args]);
      if (q.startsWith("INSERT INTO ai_decisions")) finish(args);
      return [[]];
    },
    release() {},
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
  };
  const pool = {
    query: async () => [[{ version: "8.4.0" }]],
    getConnection: async () => conn,
    end: async () => {
      closed = true;
    },
  };
  const c = loadConfig({
    DB_USER: "test",
    DB_PASSWORD: "test",
    AI_API_KEY: "test",
    AI_BASE_URL: "https://example.org",
    MC_AUTHORIZED: "true",
    MC_OFFLINE_AUTHORIZED: "true",
  });
  const provider = {
    async verify() {},
    async complete(messages) {
      const context = JSON.parse(messages[1].content);
      assert.deepEqual(context.inventorySummary, ["torch: 1"]);
      return JSON.stringify({
        agentId: context.agentId,
        decision: "wait",
        reasoning: "Observe first",
        priority: 1,
        goal: { type: "wait", target: null },
        actions: [],
        requiresTeamAssistance: false,
      });
    },
  };
  const app = await boot(
    { ...c, PORT: 0 },
    {
      logger: { warn() {}, info() {}, error() {} },
      pool,
      provider,
      connect: async (c, p, signal, h) => {
        h.login();
        h.update({ health: 20, hunger: 20, position: { x: 0, y: 64, z: 0 } });
        h.spawn({ inventorySummary: ["torch: 1"] });
        signal.addEventListener("abort", h.end, { once: true });
      },
    },
  );
  let timer;
  try {
    const args = await Promise.race([
      persisted,
      new Promise(
        (_, j) =>
          (timer = setTimeout(() => j(Error("Decision not persisted")), 2000)),
      ),
    ]);
    assert.equal(JSON.parse(args[2]).agentId, "ghost-001");
    assert.equal(app.manager.stats().connected, 1);
  } finally {
    clearTimeout(timer);
    await app.close();
  }
  assert.ok(closed);
  assert.equal(app.manager.active.size, 0);
  const events = writes
    .filter(([q]) => q.startsWith("INSERT INTO system_events"))
    .map(([, args]) => JSON.parse(args[3]));
  assert.equal(events.at(-1).payload.status, "STOPPED");
  assert.equal(
    events.find((e) => e.type === "AI_REQUESTED").correlationId,
    events.find((e) => e.type === "AI_DECISION_RECEIVED").correlationId,
  );
});
