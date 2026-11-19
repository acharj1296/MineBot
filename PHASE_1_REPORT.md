# GhostClans AI — Phase 1 implementation report

**Status: local foundation implemented and tested; external acceptance pending.** The initial checkout contained only `README.md` (`# MineBot`); no existing executable functionality or dependencies were removed.

| Area | Implemented and tested here | Not verified here |
|---|---|---|
| Configuration/operations | Valid and invalid config, defaults, orchestrated startup/teardown with injected dependencies | Production configuration, OS-level signal handling with live services |
| Agents | Ten independent profile files; registry identity/state isolation; lifecycle, duplicate/limit/low-memory admission, stop/restart, failure, disconnect and bounded reconnect | Long-lived account sessions, 50-bot capacity |
| Minecraft | Installed version-data cross-check and negative cases. Real Mineflayer status/login/spawn/end over TCP with a loopback 1.8.8 protocol test peer | Actual Java server, Microsoft authentication and `india-01.pingless.org:25670`. Sandbox outbound access excludes this host; no target version inferred |
| AI | Bounded per-agent context; model discovery and chat contract over loopback HTTP; timeout, API failure, HTTP 429 retry, malformed/invalid decisions, cache and correlation | NVIDIA deployment, credentials, model availability and real response quality |
| Events and storage | Queue saturation, duplicate suppression, isolated subscribers, multiple agents; SQL contract, migration ledger/idempotence, parameter binding and rollback using test doubles. Orchestrator integration traces spawn → decision → transactional write calls → shutdown | Actual MySQL 8.4 DDL, durable writes and rollback. This environment has neither a database service nor Docker |

## Files and dependencies

- Modified: `README.md` (setup and operator runbook). Created: `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `compose.yaml`, `ARCHITECTURE.md`, this report.
- `src/index.js`, `src/core/{orchestrator,bot-manager,bot-session}.js`: entrypoint, resource ownership, admission, scheduling and lifecycle.
- `src/config/index.js`, `src/monitoring/{logger,metrics}.js`: validated environment, redacted JSON logs, counters and read-only local metrics.
- `src/db/{database,repository}.js`, `src/db/migrations/001-foundation.sql`: pool, health check, migration lock, transactions, repository. **Tables defined, not claimed created on a live service:** `clans`, `agents`, `agent_states`, `agent_memories`, `ai_decisions`, `system_events`, `tasks`, plus `schema_migrations`.
- `src/minecraft/{connection,version,observations}.js`: checked protocol connection and bounded spawn observations. `src/agents/agent-registry.js`, `profiles/{leader,miner,builder,farmer,warrior,explorer,guard,crafter,trader,support}.json`: validated role configurations.
- `src/ai/{context-manager,prompt-builder,decision-parser,llm-gateway}.js`, `src/ai/providers/nvidia-nim.js`: isolated requests, provider interface, NIM HTTP adapter and allowlisted decision schema. `src/coordination/{message-bus,event-queue}.js`: schema-checked envelopes and bounded dispatch.
- `test/{config,lifecycle,wire,ai,database,foundation,mysql-live,live}.test.js`: offline component, protocol, integration and opt-in acceptance suites.
- Installed runtime dependencies: `mineflayer`, `minecraft-protocol`, `minecraft-data`, `prismarine-registry`, `mysql2`, `dotenv`, `pino`, `zod`. Native fetch, timers, HTTP and test runner. Dev-only: `prettier`. Exact dependency tree in lockfile.

## Verification and issues

Executed targeted configuration/lifecycle checks, a supported-release fixture, local protocol smoke test, and `npm test` on Node 22.22.3. **19 tests discovered: 17 passed, 0 failed, 2 opt-in live tests skipped.** The wire fixture initially timed out without a health packet; added the packet that triggers Mineflayer spawn and removed a redundant test teardown that kept a socket timer alive. Final suite passes without requiring a paid API or disabling a failing offline test.

`npm audit` reported six moderate entries in the transitive Prismarine authentication/UUID chain; deprecated `uuid` 8/10 are indirect requirements, not selected application dependencies. Retained the compatible upstream tree rather than applying a breaking forced downgrade. Review updated upstream releases and rerun protocol/auth acceptance before production deployment.

## Start, verify, then decide on Phase 2

```sh
npm ci
npm test
cp .env.example .env && chmod 600 .env
# Configure DB, NIM, profile and server permissions per README before proceeding.
docker compose up -d --wait mysql
GHOSTCLANS_MYSQL_TEST=yes node --test test/mysql-live.test.js
GHOSTCLANS_LIVE=yes node --test test/live.test.js
umask 077
npm start
```

Only the leader is enabled initially. For the supplied server set `MC_HOST=india-01.pingless.org`, `MC_PORT=25670`, `MC_VERSION=auto`; explicitly authorize the server and choose its actual authentication mode. See README for first-account enrollment. Do not operate another instance concurrently using the same account.

**Known limits:** single process; snapshots, not world history; bounded best-effort event delivery, not durable replay; model discovery required; no distributed locks on bot identities; device-code login needs a private Unix terminal. No survival loop, gameplay execution, learning, task planner or clan strategy is claimed. Before Phase 2, collect real database/server/NIM acceptance evidence. Later benchmark **1 → 3 → 5 → 10 → 20 → 50**, recording CPU, RSS, network traffic, event-loop delay, operator-provided server TPS and LLM request rate. Network/TPS benchmarking and 50-bot validation have not been performed. Phase 2 awaits approval.
