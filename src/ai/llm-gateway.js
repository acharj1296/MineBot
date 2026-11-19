import { setTimeout as sleep } from "node:timers/promises";
import { buildPrompt } from "./prompt-builder.js";
import { parseDecision } from "./decision-parser.js";
export class LlmGateway {
  times = [];
  pending = new Set();
  cache = new Map();
  constructor(c, provider, contexts, bus, metrics) {
    Object.assign(this, { c, provider, contexts, bus, metrics });
  }
  async decide(id) {
    const messages = buildPrompt(this.contexts.get(id)),
      key = JSON.stringify(messages),
      hit = this.cache.get(id);
    if (hit?.key === key && hit.until > Date.now())
      return structuredClone(hit.d);
    if (this.pending.size >= 4 || this.pending.has(id)) throw Error("AI busy");
    this.pending.add(id);
    const correlation = crypto.randomUUID(),
      start = Date.now();
    try {
      this.bus.publish("AI_REQUESTED", id, {}, correlation);
      for (let i = 0; ; i++) {
        this.times = this.times.filter((t) => t > Date.now() - 60000);
        if (this.times.length >= this.c.AI_REQUESTS_PER_MINUTE)
          throw Error("Local AI rate limit");
        this.times.push(Date.now());
        this.metrics.values.llmRequests++;
        let text;
        try {
          text = await this.provider.complete(messages, correlation);
        } catch (e) {
          if (
            i >= this.c.AI_MAX_RETRIES ||
            !(e.retryable || ["TimeoutError", "TypeError"].includes(e.name))
          )
            throw e;
          await sleep(200 * 2 ** i);
          continue;
        }
        const d = parseDecision(text, id);
        this.cache.set(id, { key, until: Date.now() + 3000, d });
        this.bus.publish("AI_DECISION_RECEIVED", id, d, correlation);
        return structuredClone(d);
      }
    } catch (e) {
      this.metrics.values.llmFailures++;
      this.bus.publish("AI_DECISION_REJECTED", id, {}, correlation);
      throw e;
    } finally {
      this.metrics.values.llmLatencyMs = Date.now() - start;
      this.pending.delete(id);
    }
  }
}
