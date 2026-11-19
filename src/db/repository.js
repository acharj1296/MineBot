import { transaction } from "./database.js";
export class Repository {
  constructor(pool) {
    this.pool = pool;
  }
  profile(p) {
    return transaction(this.pool, async (db) => {
      if (p.clanId)
        await db.execute(
          "INSERT INTO clans(id) VALUES (?) ON DUPLICATE KEY UPDATE id=id",
          [p.clanId],
        );
      const [rows] = await db.execute(
        "SELECT id FROM agents WHERE id=? FOR UPDATE",
        [p.id],
      );
      if (rows.length)
        await db.execute(
          "UPDATE agents SET username=?,clan_id=?,profile=? WHERE id=?",
          [p.username, p.clanId, JSON.stringify(p), p.id],
        );
      else
        await db.execute(
          "INSERT INTO agents(id,username,clan_id,profile) VALUES (?,?,?,?)",
          [p.id, p.username, p.clanId, JSON.stringify(p)],
        );
    });
  }
  record(e) {
    return transaction(this.pool, async (db) => {
      await db.execute(
        "INSERT INTO system_events(id,agent_id,event_type,envelope) VALUES (?,?,?,?)",
        [e.id, e.agentId, e.type, JSON.stringify(e)],
      );
      if (e.type === "BOT_STATE_CHANGED")
        await db.execute(
          "INSERT INTO agent_states(agent_id,snapshot) VALUES (?,?) ON DUPLICATE KEY UPDATE snapshot=?",
          [e.agentId, ...Array(2).fill(JSON.stringify(e.payload))],
        );
      if (e.type === "AI_DECISION_RECEIVED")
        await db.execute(
          "INSERT INTO ai_decisions(id,agent_id,decision) VALUES (?,?,?)",
          [e.id, e.agentId, JSON.stringify(e.payload)],
        );
    });
  }
}
