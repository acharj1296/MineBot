export class EventQueue {
  items = [];
  running = false;
  idle = [];
  constructor(limit, consume) {
    this.limit = limit;
    this.consume = consume;
  }
  push(e) {
    if (this.items.length >= this.limit) return false;
    this.items.push(e);
    if (!this.running) {
      this.running = true;
      queueMicrotask(() => this.run());
    }
    return true;
  }
  async run() {
    try {
      while (this.items.length) await this.consume(this.items.shift());
    } finally {
      this.running = false;
      this.idle.splice(0).forEach((r) => r());
    }
  }
  drain() {
    return this.running
      ? new Promise((r) => this.idle.push(r))
      : Promise.resolve();
  }
}
