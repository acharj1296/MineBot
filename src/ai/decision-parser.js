import { z } from "zod";
export const position = z.strictObject({
  x: z.number().min(-3e7).max(3e7),
  y: z.number().min(-2048).max(2048),
  z: z.number().min(-3e7).max(3e7),
});
const action = z.enum(["observe", "wait", "explore"]);
const goal = z.strictObject({ type: action, target: position.nullable() });
export const decisionSchema = z.strictObject({
  agentId: z.string().max(64),
  decision: action,
  reasoning: z.string().min(1).max(1024),
  priority: z.number().int().min(0).max(10),
  goal,
  actions: z.array(goal).max(8),
  requiresTeamAssistance: z.boolean(),
});
export function parseDecision(text, id) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 16384)
    throw Error("Invalid decision size");
  const d = decisionSchema.parse(JSON.parse(text));
  if (d.agentId !== id) throw Error("Agent mismatch");
  return d;
}
