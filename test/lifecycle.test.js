import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { AgentRegistry, loadProfiles } from "../src/agents/agent-registry.js";
import { BotManager } from "../src/core/bot-manager.js";
import { BotSession } from "../src/core/bot-session.js";
import { MessageBus } from "../src/coordination/message-bus.js";
import { detectVersion } from "../src/minecraft/version.js";
const profiles = await loadProfiles(),
  p = profiles[0];
const logger = { error() {}, warn() {} };
test("registry profile and state isolation; duplicate identity rejection", () => {
  const r = new AgentRegistry();
  for (const p of profiles) r.register(p);
  const s = r.get(p.id);
  s.role = "other";
  assert.notEqual(r.get(p.id).role, s.role);
  r.update(p.id, { health: 20 });
  assert.equal(r.state(p.id).health, 20);
  assert.throws(() => r.register({ ...p, id: "other" }));
  assert.throws(() => r.register(p));
  assert.throws(() => new BotSession(p).transition("CONNECTED"));
});
function setup(limit, adapter) {
  return new BotManager(
    {
      INITIAL_BOT_LIMIT: limit,
      MAX_BOTS: limit,
      BOT_CONNECTION_STAGGER_MS: 1,
      MIN_FREE_RAM_MB: 1,
      BOT_RECONNECT_ENABLED: true,
      BOT_RECONNECT_MAX_ATTEMPTS: 1,
    },
    new AgentRegistry(),
    new MessageBus(logger),
    adapter,
    { values: { failedConnections: 0, reconnections: 0 } },
    () => 1e9,
  );
}
function mock(c, s, signal, h) {
  h.login();
  h.spawn();
  signal.addEventListener("abort", h.end, { once: true });
}
test("two sessions, duplicate and limit admission, stop/restart/shutdown", async () => {
  const m = setup(2, mock);
  const [a, b, d] = profiles
    .slice(0, 3)
    .map((p) => m.register({ ...p, enabled: true }));
  const s = m.start(a.id);
  assert.throws(() => m.start(a.id));
  m.start(b.id);
  assert.throws(() => m.start(d.id));
  await sleep(20);
  assert.equal(m.stats().connected, 2);
  await m.restart(a.id);
  assert.equal(s.status, "STOPPED");
  await m.close();
  assert.equal(m.active.size, 0);
  m.closing = false;
  m.free = () => 0;
  assert.throws(() => m.start(a.id));
});
test("failed connection retries, spawn, disconnect and retry cap", async () => {
  let attempts = 0;
  const events = [];
  const m = setup(1, (c, s, signal, h) => {
    if (++attempts === 1) throw Error("test");
    h.login();
    h.spawn();
    h.end();
  });
  m.bus.on("*", (e) => events.push(e.type));
  m.register({ ...p, enabled: true });
  const s = m.start(p.id);
  await m.active.get(p.id).done;
  await m.bus.queue.drain();
  assert.equal(attempts, 2);
  assert.equal(s.status, "STOPPED");
  for (const name of [
    "BOT_ERROR",
    "BOT_RECONNECTED",
    "BOT_SPAWNED",
    "BOT_DISCONNECTED",
  ])
    assert.ok(events.includes(name));
});
test("status protocol and tested release must match", async () => {
  const verify = (name, protocol, version = "auto") =>
    detectVersion({ MC_VERSION: version }, async () => ({
      version: { name, protocol },
    }));
  assert.equal(await verify("Paper 1.20.4", 765), "1.20.4");
  await assert.rejects(verify("1.20.4", 1));
  await assert.rejects(verify("1.20.4", 765, "1.20.2"));
  await assert.rejects(verify("future", 999));
});
test("bus isolates subscribers, bounds queue and deduplicates across agents", async () => {
  const b = new MessageBus(logger, 2),
    ids = [];
  b.on("BOT_CREATED", () => {
    throw Error();
  });
  b.on("*", (e) => ids.push(e.agentId));
  const id = crypto.randomUUID();
  assert.ok(b.publish("BOT_CREATED", "a", {}, id, id));
  assert.equal(b.publish("BOT_CREATED", "a", {}, id, id), false);
  b.publish("BOT_CREATED", "b");
  assert.equal(b.publish("BOT_CREATED", "c"), false);
  await b.queue.drain();
  assert.deepEqual(ids, ["a", "b"]);
  assert.throws(() => b.publish("FAKE", "x"));
});
