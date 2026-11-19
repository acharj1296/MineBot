// Capture only summaries, once per requested decision (not once per movement packet).
export function observe(bot) {
  const origin = bot.entity?.position;
  const nearbyEntities = [],
    nearbyPlayers = [];
  for (const entity of Object.values(bot.entities)) {
    if (
      entity === bot.entity ||
      !origin ||
      origin.distanceTo(entity.position) > 32
    )
      continue;
    const list = entity.type === "player" ? nearbyPlayers : nearbyEntities;
    if (list.length < 16)
      list.push(
        String(entity.username ?? entity.name ?? entity.type).slice(0, 256),
      );
    if (nearbyEntities.length === 16 && nearbyPlayers.length === 16) break;
  }
  return {
    nearbyEntities,
    nearbyPlayers,
    inventorySummary: bot.inventory
      .items()
      .slice(0, 16)
      .map((i) => `${i.name}: ${i.count}`),
  };
}
