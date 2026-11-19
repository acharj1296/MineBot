import net from "node:net";
import mf from "mineflayer";
import protocol from "minecraft-protocol";
import data from "minecraft-data";
import registry from "prismarine-registry";
export async function detectVersion(c, ping = protocol.ping) {
  const { version: v } = await ping({
    host: c.MC_HOST,
    port: c.MC_PORT,
    connect: (client) =>
      client.setSocket(net.createConnection(c.MC_PORT, c.MC_HOST)),
    closeTimeout: 8000,
  });
  const matches =
    v?.name?.match(/(?<![\w.])\d+\.\d+(?:\.\d+)?(?![\w.])/g) ?? [];
  const name = matches.length === 1 ? matches[0] : null;
  if (
    !mf.testedVersions.includes(name) ||
    !protocol.supportedVersions.includes(name) ||
    data(name)?.version.version !== v.protocol ||
    !data(name)?.protocol ||
    !registry(name)?.version ||
    (c.MC_VERSION !== "auto" && c.MC_VERSION !== name)
  )
    throw Error(
      "Unsupported or ambiguous Minecraft status/version; refusing connection",
    );
  return name;
}
