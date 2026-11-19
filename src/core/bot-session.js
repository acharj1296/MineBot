const edges = {
  CREATED: ["CONNECTING", "STOPPING"],
  CONNECTING: ["SPAWNING", "ERROR", "DISCONNECTED", "STOPPING"],
  SPAWNING: ["CONNECTED", "ERROR", "DISCONNECTED", "STOPPING"],
  CONNECTED: ["ERROR", "DISCONNECTED", "STOPPING"],
  ERROR: ["DISCONNECTED", "STOPPING"],
  DISCONNECTED: ["RECONNECTING", "STOPPING"],
  RECONNECTING: ["CONNECTING", "STOPPING"],
  STOPPING: ["STOPPED"],
  STOPPED: [],
};
export class BotSession {
  constructor(profile) {
    Object.assign(this, profile, {
      status: "CREATED",
      health: null,
      hunger: null,
      position: null,
      currentActivity: "idle",
      aiContext: {},
      lastError: null,
      reconnections: 0,
    });
  }
  transition(next) {
    if (!edges[this.status].includes(next))
      throw Error(`Invalid transition ${this.status} -> ${next}`);
    this.status = next;
  }
  snapshot() {
    return structuredClone({ ...this });
  }
}
