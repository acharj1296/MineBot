import { boot } from "./core/orchestrator.js";
import { createLogger } from "./monitoring/logger.js";
const log = createLogger("startup");
const app = boot();
for (const sig of ["SIGINT", "SIGTERM"])
  process.once(sig, () =>
    app
      .then((a) => a.close())
      .catch(() => {
        process.exitCode = 1;
      }),
  );
try {
  await app;
} catch (e) {
  log.error(
    {
      code: e.code,
      reason:
        /^(Invalid settings:|Set explicit|MySQL 8.4 required|Configured model not advertised|NIM HTTP \d+$)/.test(
          e.message,
        )
          ? e.message
          : "Dependency initialization failed",
    },
    "Startup failed",
  );
  process.exitCode = 1;
}
