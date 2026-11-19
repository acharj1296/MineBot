import "dotenv/config";
import { z } from "zod";
const text = z.string().trim().min(1).max(512),
  num = (min, max, d) => z.coerce.number().int().min(min).max(max).default(d);
const flag = (d) =>
  z
    .enum(["true", "false"])
    .default(d)
    .transform((v) => v === "true");
const path = z.string().regex(/^[\w-]+(?:\/[\w-]+)*$/);
const schema = z
  .object({
    APP_NAME: text.default("GhostClans AI"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: num(1, 65535, 3000),
    MAX_BOTS: num(1, 50, 50),
    INITIAL_BOT_LIMIT: num(1, 50, 1),
    BOT_CONNECTION_STAGGER_MS: num(0, 60000, 3000),
    BOT_RECONNECT_ENABLED: flag("true"),
    BOT_RECONNECT_MAX_ATTEMPTS: num(0, 20, 5),
    MIN_FREE_RAM_MB: num(1, 65536, 256),
    MC_HOST: text.default("127.0.0.1"),
    MC_PORT: num(1, 65535, 25565),
    MC_VERSION: text.default("auto"),
    MC_AUTH: z.enum(["offline", "microsoft"]).default("offline"),
    MC_AUTHORIZED: flag("false"),
    MC_OFFLINE_AUTHORIZED: flag("false"),
    DB_HOST: text.default("127.0.0.1"),
    DB_PORT: num(1, 65535, 3306),
    DB_NAME: text.default("ghostclans"),
    DB_USER: text,
    DB_PASSWORD: z.string().min(1),
    AI_PROVIDER: z.literal("nvidia").default("nvidia"),
    AI_BASE_URL: z.url().refine((s) => {
      if (!URL.canParse(s)) return false;
      const u = new URL(s);
      return (
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(u.hostname)))
      );
    }),
    AI_API_KEY: text,
    AI_CHAT_PATH: path.default("chat/completions"),
    AI_MODELS_PATH: path.default("models"),
    AI_MODEL: text.default("nvidia/nemotron-3-ultra-550b-a55b"),
    AI_TIMEOUT_MS: num(1, 120000, 30000),
    AI_MAX_RETRIES: num(0, 5, 2),
    AI_MAX_TOKENS: num(1, 4096, 1000),
    AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
    AI_REQUESTS_PER_MINUTE: num(1, 600, 30),
  })
  .refine((c) => c.INITIAL_BOT_LIMIT <= c.MAX_BOTS, {
    path: ["INITIAL_BOT_LIMIT"],
  });
export function loadConfig(env = process.env) {
  const r = schema.safeParse(env);
  if (!r.success)
    throw Error(
      "Invalid settings: " +
        r.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  return Object.freeze(r.data);
}
