import { describe, expect, it, vi } from "vitest";
import {
  RetryingJsonHttpClient,
  type FetchFunction,
  type SleepFunction,
  UpstreamRequestError,
} from "../../src/lib/http/jsonHttpClient.js";

const requestUrl = new URL("https://example.test/market-data");

describe("RetryingJsonHttpClient", () => {
  it("retries a transient response once and returns parsed JSON", async () => {
    const fetchMock = vi.fn<FetchFunction>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const sleepMock = vi.fn<SleepFunction>().mockResolvedValue(undefined);
    const client = new RetryingJsonHttpClient({
      fetch: fetchMock,
      sleep: sleepMock,
      random: () => 0,
    });

    await expect(client.get({ url: requestUrl })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(300);
  });

  it("does not retry a non-transient 4xx response", async () => {
    const fetchMock = vi.fn<FetchFunction>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const sleepMock = vi.fn<SleepFunction>().mockResolvedValue(undefined);
    const client = new RetryingJsonHttpClient({ fetch: fetchMock, sleep: sleepMock });

    await expect(client.get({ url: requestUrl })).rejects.toMatchObject({
      kind: "http",
      status: 401,
    } satisfies Partial<UpstreamRequestError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("converts an aborted request into a safe timeout error", async () => {
    const fetchThatWaits: FetchFunction = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    const client = new RetryingJsonHttpClient({ fetch: fetchThatWaits });

    await expect(client.get({ url: requestUrl, timeoutMs: 5, retries: 0 }))
      .rejects.toMatchObject({ kind: "timeout" });
  });

  it("rejects malformed JSON without exposing the response body", async () => {
    const client = new RetryingJsonHttpClient({
      fetch: vi.fn<FetchFunction>().mockResolvedValue(
        new Response("sensitive malformed response", { status: 200 }),
      ),
    });

    const failure = await client.get({ url: requestUrl, retries: 0 })
      .then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(UpstreamRequestError);
    expect(failure).toMatchObject({ kind: "invalid_json" });
    expect((failure as Error).message).not.toContain("sensitive malformed response");
  });
});

