import { z } from "zod";
import { readFile, readdir } from "node:fs/promises";
const id = z.string().regex(/^[a-z0-9_-]{1,64}$/),
  text = z.string().min(1).max(160);
export const profileSchema = z.strictObject({
  id,
  username: z.string().regex(/^[\w@.+-]{1,64}$/),
  role: text,
  clanId: id.nullable(),
  personality: text,
  priorities: z.array(text).max(10),
  responsibilities: z.array(text).max(10),
  aiEnabled: z.boolean(),
  enabled: z.boolean(),
});
export class AgentRegistry {
  #agents = new Map();
  #states = new Map();
  register(input) {
    const p = profileSchema.parse(input);
    if (
      this.#agents.has(p.id) ||
      this.all().some(
        (a) => a.username.toLowerCase() === p.username.toLowerCase(),
      )
    )
      throw Error("Duplicate identity");
    this.#agents.set(p.id, p);
    return this.get(p.id);
  }
  get(id) {
    const p = this.#agents.get(id);
    if (!p) throw Error("Unknown agent");
    return structuredClone(p);
  }
  all() {
    return Array.from(this.#agents.values(), (p) => structuredClone(p));
  }
  update(id, state) {
    this.get(id);
    this.#states.set(id, structuredClone(state));
  }
  state(id) {
    return structuredClone(this.#states.get(id));
  }
}
export async function loadProfiles() {
  const dir = new URL("../../profiles/", import.meta.url);
  return Promise.all(
    (await readdir(dir))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map(async (n) => JSON.parse(await readFile(new URL(n, dir), "utf8"))),
  );
}
