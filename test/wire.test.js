import { once } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import protocol from "minecraft-protocol";
import { connect } from "../src/minecraft/connection.js";
// Real TCP/status/login/play packets, minimal local test peer (not a Java Edition server).
test(
  "Mineflayer adapter negotiates a loopback peer, spawns and closes",
  { timeout: 10000 },
  async (t) => {
    const server = protocol.createServer({
      host: "127.0.0.1",
      port: 0,
      version: "1.8.8",
      "online-mode": false,
    });
    await once(server, "listening");
    t.after(() => server.close());
    server.on("login", (client) => {
      client.write("login", {
        entityId: 1,
        gameMode: 0,
        dimension: 0,
        difficulty: 1,
        maxPlayers: 1,
        levelType: "default",
        reducedDebugInfo: false,
      });
      client.write("position", {
        x: 0,
        y: 64,
        z: 0,
        yaw: 0,
        pitch: 0,
        flags: 0,
      });
      client.write("update_health", {
        health: 20,
        food: 20,
        foodSaturation: 5,
      });
    });
    const c = {
      MC_AUTHORIZED: true,
      MC_OFFLINE_AUTHORIZED: true,
      MC_AUTH: "offline",
      MC_VERSION: "auto",
      MC_HOST: "127.0.0.1",
      MC_PORT: server.socketServer.address().port,
    };
    const ctl = new AbortController(),
      events = [];
    let finish;
    const ended = new Promise((r) => (finish = r));
    const bot = await connect(
      c,
      { id: "local", username: "LocalBot" },
      ctl.signal,
      {
        login: () => events.push("login"),
        spawn: () => {
          events.push("spawn");
          ctl.abort();
        },
        end: finish,
        update() {},
        error: (e) => events.push(e),
      },
    );
    t.after(() => {
      if (!ctl.signal.aborted) ctl.abort();
    });
    await ended;
    assert.deepEqual(events, ["login", "spawn"]);
  },
);
