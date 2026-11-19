export class NvidiaNim {
  constructor(config, http = fetch) {
    this.c = config;
    this.http = http;
  }
  async request(path, body, id) {
    const c = this.c;
    const response = await this.http(
      c.AI_BASE_URL.replace(/\/$/, "") + "/" + path,
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${c.AI_API_KEY}`,
          "Content-Type": "application/json",
          "X-Request-ID": id,
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(c.AI_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(Error("NIM HTTP " + response.status), {
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    let bytes = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 262144) throw Error("NIM response too large");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  async verify() {
    const r = await this.request(
      this.c.AI_MODELS_PATH,
      undefined,
      crypto.randomUUID(),
    );
    if (!r.data?.some((m) => m.id === this.c.AI_MODEL))
      throw Error("Configured model not advertised");
  }
  async complete(messages, id) {
    const c = this.c,
      r = await this.request(
        c.AI_CHAT_PATH,
        {
          model: c.AI_MODEL,
          messages,
          max_tokens: c.AI_MAX_TOKENS,
          temperature: c.AI_TEMPERATURE,
        },
        id,
      );
    return r.choices?.[0]?.message?.content;
  }
}
