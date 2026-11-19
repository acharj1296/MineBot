# GhostClans AI · Phase 1

A Node.js service for independent Minecraft Java agents. The first enabled agent connects, observes its spawn surroundings, requests one structured decision and records it. **It does not execute the decision.** No external services are contacted by the default tests.

## Run the tests

Use Node.js 22 LTS or a newer LTS and npm:

```sh
npm ci
npm test
```

## Connect the first bot

1. Obtain the server operator’s permission for a bot and confirm its authentication mode. A hostname is not evidence that offline access is permitted. Use an account with a Minecraft Java entitlement for Microsoft authentication. Ensure your network allows outbound traffic to the server, the selected NIM deployment and (if applicable) Microsoft authentication services.
2. From the repository root, run `cp .env.example .env && chmod 600 .env`. Set `DB_USER` (non-root) and `DB_PASSWORD` to your own values. Use a dedicated MySQL **8.4** database. With the included Compose file, start it using `docker compose up -d --wait mysql`. Otherwise create the database yourself and grant the application account DDL and DML permissions **only on that database**. Use loopback or a trusted private database connection; this configuration does not set up database TLS.
3. Fill `AI_BASE_URL` with the API prefix documented for your deployment and set `AI_API_KEY`. Set `AI_MODELS_PATH` and `AI_CHAT_PATH` to the model-list and chat-completions paths **relative to that prefix**. Deployment must support OpenAI-compatible model discovery and chat; startup fails rather than assuming the configured model exists. The suggested `AI_MODEL` is not a verified entitlement. Do not commit `.env`, tokens or the `.auth/` cache.
4. For the **supplied target**, use the following settings **only after authorization**:

   ```dotenv
   MC_HOST=india-01.pingless.org
   MC_PORT=25670
   MC_VERSION=auto
   MC_AUTH=microsoft
   MC_AUTHORIZED=true
   INITIAL_BOT_LIMIT=1
   ```

   Only if the operator explicitly confirms a private/offline-mode server should you set **both** `MC_AUTH=offline` and `MC_OFFLINE_AUTHORIZED=true`. The adapter will not try offline mode after an authentication failure. Use the actual TCP host and port, not an SRV alias. Server status must advertise one recognizable tested release and its matching protocol. An explicit `MC_VERSION` is an additional constraint, not a bypass.
5. Configure `profiles/leader.json` for the intended account. For Microsoft auth use a distinct account identifier per profile. Run in a private interactive terminal for first-time device-code authorization (Unix `/dev/tty`); protect the cache (`umask 077`). Leave only the leader enabled and retain `INITIAL_BOT_LIMIT=1`. The ten profiles are templates, not ten automatic logins.
6. Start and observe:

   ```sh
   umask 077
   npm start
   # In another terminal:
   curl http://127.0.0.1:3000/metrics
   ```

   Expect `BOT_SPAWNED`, `BOT_CONNECTED`, then `AI_DECISION_RECEIVED` or `AI_DECISION_REJECTED` in the JSON log. Inspect `agent_states`, `ai_decisions` and `system_events` in MySQL. A rejected decision is never executed. Ctrl-C / SIGTERM stops connections, waits for outstanding work, drains accepted events and closes the pool. Stop the supplied database with `docker compose stop mysql`.

## Optional acceptance runs

Use a dedicated test database; these tests create persistent rows. Do not run a second instance with the same Minecraft account. The live acceptance run incurs NIM usage and uses the actual configured server.

```sh
# MySQL only; no Minecraft or NIM credentials needed
GHOSTCLANS_MYSQL_TEST=yes node --test test/mysql-live.test.js
# Full stack; needs all settings above, one enabled test bot and explicit authorization
GHOSTCLANS_LIVE=yes node --test test/live.test.js
```

See [architecture](ARCHITECTURE.md) for module contracts and [Phase 1 report](PHASE_1_REPORT.md) for the verification boundary, dependency caveats and remaining work.
