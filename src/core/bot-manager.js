import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { BotSession } from "./bot-session.js";
export class BotManager {
  active = new Map();
  next = 0;
  closing = false;
  constructor(
    config,
    registry,
    bus,
    adapter,
    metrics,
    free = () => Math.min(os.freemem(), process.availableMemory()),
  ) {
    Object.assign(this, { config, registry, bus, adapter, metrics, free });
  }
  register(p) {
    return this.registry.register(p);
  }
  emit(s, type, payload = {}) {
    this.bus.publish(type, s.id, payload);
  }
  state(s, next) {
    s.transition(next);
    const snap = s.snapshot();
    this.registry.update(s.id, snap);
    this.emit(s, "BOT_STATE_CHANGED", snap);
  }
  start(id) {
    const p = this.registry.get(id),
      c = this.config;
    if (
      this.closing ||
      !p.enabled ||
      this.active.has(id) ||
      this.active.size >= Math.min(c.MAX_BOTS, c.INITIAL_BOT_LIMIT) ||
      this.free() < c.MIN_FREE_RAM_MB * 1048576
    )
      throw Error("Agent admission denied");
    const s = new BotSession(p),
      ctl = new AbortController();
    const entry = { s, ctl };
    this.active.set(id, entry);
    this.emit(s, "BOT_CREATED");
    entry.done = this.run(entry).catch(() => {
      this.active.delete(id);
      this.metrics.values.failedConnections++;
      this.emit(s, "BOT_ERROR", {
        message: "Session worker stopped unexpectedly",
      });
    });
    return s;
  }
  async run({ s, ctl }) {
    const c = this.config,
      signal = ctl.signal;
    try {
      while (!signal.aborted) {
        const slot = Math.max(Date.now(), this.next);
        this.next = slot + c.BOT_CONNECTION_STAGGER_MS;
        await sleep(slot - Date.now(), null, { signal });
        this.state(s, "CONNECTING");
        this.emit(s, "BOT_CONNECTING");
        let end;
        const ended = new Promise((r) => (end = r));
        let live = true;
        const error = (msg) => {
          if (live && !signal.aborted && s.status !== "ERROR") {
            s.lastError = msg;
            this.state(s, "ERROR");
            this.metrics.values.failedConnections++;
            this.emit(s, "BOT_ERROR", { message: msg });
          }
        };
        try {
          await this.adapter(c, s, signal, {
            login: () => {
              if (live && !signal.aborted && s.status === "CONNECTING")
                this.state(s, "SPAWNING");
            },
            spawn: (observations = {}) => {
              if (live && !signal.aborted && s.status === "SPAWNING") {
                s.aiContext = observations;
                this.state(s, "CONNECTED");
                this.emit(s, "BOT_SPAWNED");
                this.emit(s, "BOT_CONNECTED");
                if (s.reconnections) this.emit(s, "BOT_RECONNECTED");
              }
            },
            update: (v) => {
              if (live && !signal.aborted) Object.assign(s, v);
            },
            error,
            end,
          });
          await ended;
        } catch (e) {
          error(
            e.message ===
              "Unsupported or ambiguous Minecraft status/version; refusing connection"
              ? e.message
              : "Connection attempt failed",
          );
        } finally {
          live = false;
        }
        if (signal.aborted) break;
        if (["CONNECTING", "SPAWNING"].includes(s.status))
          error("Disconnected before spawn");
        this.state(s, "DISCONNECTED");
        this.emit(s, "BOT_DISCONNECTED");
        if (
          !c.BOT_RECONNECT_ENABLED ||
          s.reconnections >= c.BOT_RECONNECT_MAX_ATTEMPTS
        )
          break;
        s.reconnections++;
        this.metrics.values.reconnections++;
        this.state(s, "RECONNECTING");
        await sleep(Math.min(30000, 250 * 2 ** s.reconnections), null, {
          signal,
        });
      }
    } catch (e) {
      if (!signal.aborted) throw e;
    } finally {
      this.state(s, "STOPPING");
      this.state(s, "STOPPED");
      this.active.delete(s.id);
    }
  }
  async stop(id) {
    const e = this.active.get(id);
    if (e) {
      e.ctl.abort();
      await e.done;
    }
  }
  async restart(id) {
    await this.stop(id);
    return this.start(id);
  }
  async close() {
    this.closing = true;
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
  }
  stats() {
    const profiles = this.registry.all();
    return {
      registered: profiles.length,
      active: this.active.size,
      connected: [...this.active.values()].filter(
        (e) => e.s.status === "CONNECTED",
      ).length,
      disconnected: profiles.filter((p) =>
        ["DISCONNECTED", "STOPPED"].includes(this.registry.state(p.id)?.status),
      ).length,
    };
  }
}
