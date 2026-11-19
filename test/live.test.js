import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";
import { boot } from "../src/core/orchestrator.js";
import { openPool } from "../src/db/database.js";
import { setTimeout as sleep } from "node:timers/promises";
// Full opt-in acceptance test: uses actual profile, server, database, and paid endpoint.
test(
  "authorized live spawn, validated NIM decision and durable event",
  { skip: process.env.GHOSTCLANS_LIVE !== "yes" },
  async () => {
    const c = loadConfig();
    assert.equal(c.INITIAL_BOT_LIMIT, 1);
    const pool = openPool(c);
    let app;
    try {
      const [[{ since }]] = await pool.query("SELECT NOW(3) AS since");
      app = await boot(c);
      const id = [...app.manager.active.keys()][0];
      assert.ok(id);
      for (let n = 0; n < 120; n++) {
        const [rows] = await pool.execute(
          "SELECT decision FROM ai_decisions WHERE agent_id=? AND created_at>=?",
          [id, since],
        );
        if (rows.length) {
          assert.equal(rows[0].decision.agentId, id);
          return;
        }
        await sleep(1000);
      }
      assert.fail("No persisted live decision within 120 seconds");
    } finally {
      await app?.close();
      await pool.end();
    }
  },
);
