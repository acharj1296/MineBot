import net from "node:net";
import { writeFileSync } from "node:fs";
import mf from "mineflayer";
import { detectVersion } from "./version.js";
import { observe } from "./observations.js";
export async function connect(c, p, signal, h) {
  if (!c.MC_AUTHORIZED || (c.MC_AUTH === "offline" && !c.MC_OFFLINE_AUTHORIZED))
    throw Error("Server authentication mode not authorized");
  const version = await detectVersion(c);
  signal.throwIfAborted();
  let socket,
    stopped = false,
    ended = false;
  const bot = mf.createBot({
    host: c.MC_HOST,
    port: c.MC_PORT,
    version,
    auth: c.MC_AUTH,
    username: p.username,
    profilesFolder: `.auth/${p.id}`,
    hideErrors: true,
    logErrors: false,
    // Never create a late socket after a cancelled device-code authentication flow.
    connect(client) {
      if (!stopped) {
        socket = net.createConnection(c.MC_PORT, c.MC_HOST);
        client.setSocket(socket);
      }
    },
    onMsaCode(code) {
      if (!stopped)
        writeFileSync(
          "/dev/tty",
          `Authorize ${p.id} at ${code.verification_uri} with code ${code.user_code}\n`,
        );
    },
  });
  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    bot.off("health", update);
    bot.off("move", update);
    h.end();
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    if (socket && !socket.destroyed) {
      bot.end();
      socket.destroy();
    } else finish();
  }
  function update() {
    const pos = bot.entity?.position;
    h.update({
      health: bot.health ?? null,
      hunger: bot.food ?? null,
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
    });
  }
  const timer = setTimeout(() => {
    h.error("Spawn timed out");
    stop();
  }, 60000);
  signal.addEventListener("abort", stop, { once: true });
  bot.once("login", h.login);
  bot.once("spawn", () =>
    queueMicrotask(() => {
      if (!ended && !stopped) {
        clearTimeout(timer);
        update();
        h.spawn(observe(bot));
      }
    }),
  );
  bot.on("health", update);
  bot.on("move", update);
  bot.on("kicked", () => h.error("Server kicked bot"));
  bot.on("error", () => {
    if (!ended) {
      h.error("Minecraft connection error");
      stop();
    }
  });
  bot.once("end", finish);
  return bot;
}
