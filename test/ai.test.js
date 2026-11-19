import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { NvidiaNim } from "../src/ai/providers/nvidia-nim.js";
import { ContextManager } from "../src/ai/context-manager.js";
import { parseDecision } from "../src/ai/decision-parser.js";
import { LlmGateway } from "../src/ai/llm-gateway.js";
import { MessageBus } from "../src/coordination/message-bus.js";
const d = {
  agentId: "a",
  decision: "observe",
  reasoning: "Look around",
  priority: 5,
  goal: { type: "explore", target: null },
  actions: [],
  requiresTeamAssistance: false,
};
test("strict decision validation", () => {
  assert.deepEqual(parseDecision(JSON.stringify(d), "a"), d);
  for (const text of [
    "{",
    ...Array.from(
      [
        {},
        { ...d, shell: "bad" },
        { ...d, actions: [{ type: "shell", target: null }] },
        { ...d, actions: Array(9).fill(d.goal) },
        { ...d, goal: { type: "explore", target: { x: 4e7, y: 0, z: 0 } } },
        { ...d, agentId: "b" },
      ],
      (v) => JSON.stringify(v),
    ),
  ])
    assert.throws(() => parseDecision(text, "a"));
});
const config = {
  AI_TIMEOUT_MS: 1000,
  AI_MODELS_PATH: "models",
  AI_CHAT_PATH: "chat/completions",
  AI_MODEL: "test",
  AI_MAX_TOKENS: 100,
  AI_TEMPERATURE: 0.1,
  AI_API_KEY: "dummy",
  AI_MAX_RETRIES: 1,
  AI_REQUESTS_PER_MINUTE: 4,
};
test("loopback NIM contract, model discovery, retries, isolation, cache, correlated events", async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/models") {
      res.end(JSON.stringify({ data: [{ id: "test" }] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ body: JSON.parse(body), id: req.headers["x-request-id"] });
    if (requests.length === 1) {
      res.writeHead(429).end();
      return;
    }
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(d) } }],
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const provider = new NvidiaNim({
    ...config,
    AI_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  });
  await provider.verify();
  const ctx = new ContextManager();
  for (const id of ["a", "b"])
    ctx.set(
      {
        id,
        role: "miner",
        health: 20,
        hunger: 20,
        position: null,
        currentActivity: "idle",
        clanId: null,
      },
      { relevantMemory: [id + " private"] },
    );
  const bus = new MessageBus(console),
    events = [];
  bus.on("*", (e) => events.push(e));
  const gw = new LlmGateway(config, provider, ctx, bus, {
    values: { llmRequests: 0, llmFailures: 0 },
  });
  assert.deepEqual(await gw.decide("a"), d);
  await gw.decide("a");
  await bus.queue.drain();
  assert.equal(requests.length, 2);
  assert.equal(events[1].correlationId, requests[1].id);
  assert.ok(!JSON.stringify(requests).includes("b private"));
  assert.deepEqual(ctx.get("b").relevantMemory, ["b private"]);
  assert.equal(events[1].type, "AI_DECISION_RECEIVED");
});
test("HTTP failures, timeout and malformed provider envelopes", async () => {
  const c = {
    ...config,
    AI_BASE_URL: "https://example.org",
    AI_TIMEOUT_MS: 10,
  };
  for (const code of [401, 429, 503])
    await assert.rejects(
      new NvidiaNim(c, async () => new Response("", { status: code })).complete(
        [],
        crypto.randomUUID(),
      ),
      (e) => e.retryable === (code !== 401),
    );
  const timeout = new NvidiaNim(
    c,
    (_, { signal }) =>
      new Promise((r, j) => {
        const timer = setTimeout(r, 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          j(signal.reason);
        });
      }),
  );
  await assert.rejects(timeout.complete([], "test"), { name: "TimeoutError" });
  await assert.rejects(
    new NvidiaNim(c, async () => new Response("{")).verify(),
  );
});
