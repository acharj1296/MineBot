import { monitorEventLoopDelay } from "node:perf_hooks";
export class Metrics {
  values = {
    failedConnections: 0,
    reconnections: 0,
    llmRequests: 0,
    llmFailures: 0,
    llmLatencyMs: 0,
    databaseConnected: false,
  };
  loop = monitorEventLoopDelay();
  constructor() {
    this.loop.enable();
  }
  snapshot() {
    return {
      ...this.values,
      uptime: process.uptime(),
      rss: process.memoryUsage().rss,
      cpu: process.cpuUsage(),
      eventLoopDelayMs: this.loop.mean / 1e6,
    };
  }
  close() {
    this.loop.disable();
  }
}
