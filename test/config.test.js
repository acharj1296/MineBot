import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/index.js";
const env = {
  DB_USER: "test",
  DB_PASSWORD: "test",
  AI_API_KEY: "test",
  AI_BASE_URL: "https://example.org/v1",
};
test("valid minimal configuration", () =>
  assert.equal(loadConfig(env).INITIAL_BOT_LIMIT, 1));
for (const patch of [
  { DB_USER: "" },
  { PORT: 65536 },
  { MAX_BOTS: 51 },
  { MAX_BOTS: 1, INITIAL_BOT_LIMIT: 2 },
])
  test("reject " + Object.keys(patch), () =>
    assert.throws(() => loadConfig({ ...env, ...patch })),
  );
