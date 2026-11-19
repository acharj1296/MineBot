import test from "node:test";
import assert from "node:assert/strict";
import { migrate, health, transaction } from "../src/db/database.js";
import { Repository } from "../src/db/repository.js";
function fixture() {
  const queries = [],
    done = new Set();
  const db = {
    query: async (q) => {
      queries.push(q);
      return [[{ locked: 1, version: "8.4.3" }]];
    },
    execute: async (q, params) => {
      queries.push([q, params]);
      if (q.startsWith("INSERT INTO schema_migrations")) done.add(params[0]);
      return [q.startsWith("SELECT name") && done.has(params[0]) ? [{}] : []];
    },
    beginTransaction: async () => queries.push("begin"),
    rollback: async () => queries.push("rollback"),
    commit: async () => queries.push("commit"),
    release: () => queries.push("release"),
  };
  return { pool: { getConnection: async () => db }, db, queries };
}
test("mysql contract: health, migration ledger and idempotent rerun", async () => {
  const { pool, db, queries } = fixture();
  assert.ok(await health(db));
  await assert.rejects(health({ query: async () => [[{ version: "5.7" }]] }));
  await migrate(pool);
  const count = () =>
    queries.filter((q) => typeof q === "string" && q.endsWith("ENGINE=InnoDB"))
      .length;
  assert.equal(count(), 7);
  await migrate(pool);
  assert.equal(count(), 7);
});
test("repository binds profile/state/decision data and rollback releases connections", async () => {
  const { pool, queries } = fixture(),
    r = new Repository(pool);
  await r.profile({ id: "a", username: "Test", clanId: "clan" });
  for (const type of ["AI_DECISION_RECEIVED", "BOT_STATE_CHANGED"])
    await r.record({
      id: crypto.randomUUID(),
      type,
      agentId: "a",
      payload: {},
    });
  for (const table of [
    "agents",
    "ai_decisions",
    "agent_states",
    "system_events",
  ])
    assert.ok(
      queries.some(
        (q) =>
          Array.isArray(q) &&
          q[0].startsWith("INSERT INTO " + table) &&
          q[1].length,
      ),
    );
  await assert.rejects(
    transaction(pool, () => {
      throw Error();
    }),
  );
  assert.deepEqual(queries.slice(-2), ["rollback", "release"]);
});
