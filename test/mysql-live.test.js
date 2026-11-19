import test from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { openPool, migrate, health, transaction } from "../src/db/database.js";
import { Repository } from "../src/db/repository.js";
test(
  "MySQL 8.4 durable state and atomic rollback",
  { skip: process.env.GHOSTCLANS_MYSQL_TEST !== "yes" },
  async () => {
    const db = openPool(process.env),
      id = crypto.randomUUID(),
      repo = new Repository(db);
    try {
      await health(db);
      await migrate(db);
      await migrate(db);
      await repo.profile({ id, username: id, clanId: null });
      await repo.record({
        id: crypto.randomUUID(),
        agentId: id,
        type: "BOT_STATE_CHANGED",
        payload: { status: "CONNECTED" },
      });
      const [[r]] = await db.execute(
        "SELECT snapshot FROM agent_states WHERE agent_id=?",
        [id],
      );
      assert.equal(r.snapshot.status, "CONNECTED");
      await assert.rejects(
        transaction(db, async (conn) => {
          await conn.execute("DELETE FROM agent_states WHERE agent_id=?", [id]);
          throw Error("rollback");
        }),
      );
      const [rows] = await db.execute(
        "SELECT agent_id FROM agent_states WHERE agent_id=?",
        [id],
      );
      assert.equal(rows.length, 1);
    } finally {
      await db.end();
    }
  },
);
