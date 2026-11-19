import { z } from "zod";
import { position } from "./decision-parser.js";
const text = z.string().max(256),
  list = z.array(text).max(16);
const schema = z.strictObject({
  agentId: text,
  role: text,
  position: position.nullable(),
  health: z.number().nullable(),
  hunger: z.number().nullable(),
  inventorySummary: list,
  nearbyEntities: list,
  nearbyPlayers: list,
  currentTask: text,
  relevantMemory: list,
  clanContext: text.nullable(),
});
export class ContextManager {
  #contexts = new Map();
  set(s, observations = {}) {
    const c = schema.parse({
      inventorySummary: [],
      nearbyEntities: [],
      nearbyPlayers: [],
      relevantMemory: [],
      ...observations,
      agentId: s.id,
      role: s.role,
      health: s.health,
      hunger: s.hunger,
      position: s.position,
      currentTask: s.currentActivity,
      clanContext: s.clanId,
    });
    this.#contexts.set(s.id, c);
  }
  get(id) {
    if (!this.#contexts.has(id)) throw Error("Missing context");
    return structuredClone(this.#contexts.get(id));
  }
}
