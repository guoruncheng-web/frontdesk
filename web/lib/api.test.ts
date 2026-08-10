import { describe, expect, it, vi } from "vitest";
import { ApiError, api, dollars, streamEvents, tokenStore } from "./api";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api", () => {
  it("sends the stored token as a bearer credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    tokenStore.write("a-token");

    await api("/tickets");

    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer a-token",
    );
  });

  it("surfaces the API's message so a lockout notice reaches the user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Too many attempts" }, 401)));

    await expect(api("/auth/login", { method: "POST" })).rejects.toThrow("Too many attempts");
  });

  it("carries the status code so a 401 can be told from a 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "no" }, 401)));

    await expect(api("/tickets")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    await expect(api("/tickets")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("streamEvents", () => {
  it("routes tokens, attempts and the final result to their handlers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: token\ndata: {"token":"{\\"cat"}\n\n',
          'event: token\ndata: {"token":"egory\\":1}"}\n\n',
          'event: attempt\ndata: {"attempt":1,"outcome":"ok"}\n\n',
          'event: done\ndata: {"category":"billing"}\n\n',
        ]),
      ),
    );

    const tokens: string[] = [];
    const attempts: unknown[] = [];
    let done: unknown = null;

    await streamEvents("/tickets/x/triage", {
      onToken: (token) => tokens.push(token),
      onAttempt: (attempt) => attempts.push(attempt),
      onDone: (payload) => (done = payload),
    });

    expect(tokens.join("")).toBe('{"category":1}');
    expect(attempts).toEqual([{ attempt: 1, outcome: "ok" }]);
    expect(done).toEqual({ category: "billing" });
  });

  /**
   * The same chunk-boundary trap the server reader has. A reader that parses
   * each network chunk independently drops whatever straddles the split, and
   * the failure is intermittent enough to be blamed on the server.
   */
  it("reassembles an event split across chunk boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(['event: token\nda', 'ta: {"token":"hello"}\n\n'])),
    );

    const tokens: string[] = [];
    await streamEvents("/x", { onToken: (token) => tokens.push(token) });

    expect(tokens).toEqual(["hello"]);
  });

  it("reads several events packed into one chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(['event: token\ndata: {"token":"a"}\n\nevent: token\ndata: {"token":"b"}\n\n']),
        ),
    );

    const tokens: string[] = [];
    await streamEvents("/x", { onToken: (token) => tokens.push(token) });

    expect(tokens).toEqual(["a", "b"]);
  });

  it("reports a failure event rather than resolving as if it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(['event: failed\ndata: {"message":"upstream down"}\n\n'])),
    );

    let failure: string | null = null;
    await streamEvents("/x", { onFailed: (message) => (failure = message) });

    expect(failure).toBe("upstream down");
  });

  it("throws when the request itself is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }, 403)));

    await expect(streamEvents("/x", {})).rejects.toThrow("nope");
  });
});

describe("dollars", () => {
  it("renders integer micros as money", () => {
    expect(dollars(1_350)).toBe("$0.0014");
    expect(dollars(0)).toBe("$0.0000");
  });

  it("can show the extra places a single call needs", () => {
    expect(dollars(113, 6)).toBe("$0.000113");
  });
});
