import { z } from "zod";
import { EventQueue } from "./event-queue.js";
import { decisionSchema } from "../ai/decision-parser.js";
const names =
  "BOT_CREATED BOT_CONNECTING BOT_CONNECTED BOT_SPAWNED BOT_DISCONNECTED BOT_RECONNECTED BOT_ERROR BOT_STATE_CHANGED AI_REQUESTED AI_DECISION_RECEIVED AI_DECISION_REJECTED CLAN_MESSAGE_RECEIVED TASK_CREATED TASK_ASSIGNED TASK_COMPLETED".split(
    " ",
  );
const base = z.strictObject({
  type: z.enum(names),
  id: z.uuid(),
  correlationId: z.uuid(),
  timestamp: z.iso.datetime(),
  agentId: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
});
const text = z.string().min(1).max(1024);
const payloads = {
  BOT_ERROR: z.object({ message: text }),
  BOT_STATE_CHANGED: z.object({ status: text }),
  AI_DECISION_RECEIVED: decisionSchema,
  CLAN_MESSAGE_RECEIVED: z.object({ message: text }),
  ...Object.fromEntries(
    names
      .filter((n) => n.startsWith("TASK_"))
      .map((n) => [n, z.object({ taskId: text })]),
  ),
};
export class MessageBus {
  listeners = new Map();
  seen = new Set();
  dropped = 0;
  constructor(logger, limit = 512) {
    this.logger = logger;
    this.queue = new EventQueue(limit, async (e) => {
      for (const cb of [
        ...(this.listeners.get(e.type) ?? []),
        ...(this.listeners.get("*") ?? []),
      ])
        try {
          await cb(structuredClone(e));
        } catch {
          logger.error(
            { agentId: e.agentId, type: e.type },
            "Event consumer failed",
          );
        }
    });
  }
  on(type, cb) {
    if (type !== "*" && !names.includes(type)) throw Error("Unknown event");
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(cb);
    return () => this.listeners.get(type).delete(cb);
  }
  publish(
    type,
    agentId,
    payload = {},
    correlationId = crypto.randomUUID(),
    id = crypto.randomUUID(),
  ) {
    const e = base.parse({
      type,
      agentId,
      payload,
      correlationId,
      id,
      timestamp: new Date().toISOString(),
    });
    payloads[type]?.parse(payload);
    if (Buffer.byteLength(JSON.stringify(e)) > 32768)
      throw Error("Event too large");
    if (this.seen.has(id)) return false;
    if (!this.queue.push(structuredClone(e))) {
      this.dropped++;
      this.logger.warn({ agentId, type }, "Event queue full");
      return false;
    }
    this.seen.add(id);
    if (this.seen.size > 2048)
      this.seen.delete(this.seen.values().next().value);
    return true;
  }
}
