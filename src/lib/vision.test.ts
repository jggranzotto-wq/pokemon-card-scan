import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { READ_FAIL_MESSAGE } from "./ocr-parse";
import {
  VISION_UNAVAILABLE_NOTE,
  VISION_UNREAD_NOTE,
  isVisionFallbackMessage,
  withVisionFallbackNote,
} from "./vision-messages";
import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MAX_ATTEMPTS,
  geminiModelConfig,
  identifyGemini,
  providerErrorMessage,
  redactVisionLog,
  VisionQuotaError,
} from "./vision";

const SECRET = "AIzaSyTESTKEYSHOULDNOTLEAK99";

function cardJson(name: string): string {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { thought: true, text: "ignore this thought" },
            { text: JSON.stringify({ name, confidence: 0.9, language: "English" }) },
          ],
        },
      },
    ],
  });
}

function googleError(status: number, message: string): string {
  return JSON.stringify({
    error: {
      code: status,
      message,
      status: status === 404 ? "NOT_FOUND" : "UNAVAILABLE",
    },
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    return handler(String(url), init);
  }) as typeof fetch;
}

describe("geminiModelConfig", () => {
  it("defaults to the current stable flash models", () => {
    const config = geminiModelConfig({} as unknown as NodeJS.ProcessEnv);
    assert.equal(config.primary, DEFAULT_GEMINI_MODEL);
    assert.equal(config.primary, "gemini-3.8-flash");
    assert.equal(config.fallback, DEFAULT_GEMINI_FALLBACK_MODEL);
    assert.equal(config.fallback, "gemini-3.5-flash-lite");
  });

  it("uses GEMINI_MODEL and can disable the second model", () => {
    const config = geminiModelConfig({
      GEMINI_MODEL: "gemini-3.6-flash",
      GEMINI_FALLBACK_MODEL: "",
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(config.primary, "gemini-3.6-flash");
    assert.equal(config.fallback, null);
  });

  it("rejects a model id that is not a single token", () => {
    assert.throws(
      () => geminiModelConfig({ GEMINI_MODEL: "gemini-3.8-flash?key=secret" } as unknown as NodeJS.ProcessEnv),
      /not a valid id/,
    );
  });
});

describe("providerErrorMessage", () => {
  it("keeps Google's message and strips the key", () => {
    const body = googleError(
      404,
      `models/gemini-2.0-flash is no longer available. Request ?key=${SECRET}`,
    );
    const message = providerErrorMessage(body, [SECRET]);
    assert.match(message, /no longer available/);
    assert.equal(message.includes(SECRET), false);
    assert.match(message, /key=\[redacted\]/);
  });
});

describe("redactVisionLog", () => {
  it("redacts bearer tokens and sk- keys", () => {
    const line = redactVisionLog("Bearer sk-supersecretvalue and key=abc123", ["sk-supersecretvalue"]);
    assert.equal(line.includes("sk-supersecretvalue"), false);
    assert.equal(line.includes("abc123"), false);
    assert.match(line, /Bearer \[redacted\]/);
  });
});

describe("identifyGemini", () => {
  it("retries a 503 once immediately and then reads the card JSON, skipping thought text", async () => {
    const sleeps: number[] = [];
    const statuses = [503, 200];
    let calls = 0;
    const logs: string[] = [];
    const fetchImpl = mockFetch((url, init) => {
      calls += 1;
      assert.equal(url.includes(SECRET), true);
      assert.match(url, /models\/gemini-3\.8-flash:generateContent/);
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body)) as {
        generationConfig?: { thinkingConfig?: { thinkingLevel?: string } };
      };
      assert.equal(body.generationConfig?.thinkingConfig?.thinkingLevel, "low");
      const status = statuses[calls - 1] ?? 200;
      if (status !== 200) {
        return new Response(
          googleError(status, `high demand ?key=${SECRET}`),
          { status },
        );
      }
      return new Response(cardJson("Charizard"), { status: 200 });
    });

    const card = await identifyGemini(Buffer.from("img"), "image/jpeg", {
      env: { GEMINI_API_KEY: SECRET, GEMINI_FALLBACK_MODEL: "" } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      log: (line) => logs.push(line),
    });

    assert.equal(card.name, "Charizard");
    assert.equal(calls, GEMINI_MAX_ATTEMPTS);
    assert.deepEqual(sleeps, []);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /model=gemini-3\.8-flash status=503/);
    assert.match(logs[0], /high demand/);
    assert.equal(logs[0].includes(SECRET), false);
    assert.match(logs[0], /key=\[redacted\]/);
  });

  it("does not take a second 503 retry", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => {
      calls += 1;
      return new Response(googleError(503, "high demand"), { status: 503 });
    });
    await assert.rejects(
      () =>
        identifyGemini(Buffer.from("img"), "image/jpeg", {
          env: { GEMINI_API_KEY: SECRET, GEMINI_FALLBACK_MODEL: "" } as unknown as NodeJS.ProcessEnv,
          fetchImpl,
          sleepImpl: async () => {
            throw new Error("backoff");
          },
          log: () => {},
        }),
      /busy right now/,
    );
    assert.equal(calls, GEMINI_MAX_ATTEMPTS);
  });

  it("aborts a hung call and retries once without waiting out the route limit", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        await new Promise<never>((_resolve, reject) => {
          const abort = () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init?.signal?.aborted) abort();
          init?.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return new Response(cardJson("Pikachu"), { status: 200 });
    }) as typeof fetch;

    const card = await identifyGemini(Buffer.from("img"), "image/jpeg", {
      env: { GEMINI_API_KEY: SECRET, GEMINI_FALLBACK_MODEL: "" } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
      timeoutMs: 30,
      log: () => {},
    });
    assert.equal(card.name, "Pikachu");
    assert.equal(calls, 2);
  });

  it("does not retry a 404 and tries the fallback model", async () => {
    const sleeps: number[] = [];
    const models: string[] = [];
    const logs: string[] = [];
    const fetchImpl = mockFetch((url) => {
      const model = url.match(/models\/([^:]+):/)?.[1] ?? "";
      models.push(model);
      if (model === "gemini-3.8-flash") {
        return new Response(
          googleError(404, `gemini-2.0-flash is no longer available ?key=${SECRET}`),
          { status: 404 },
        );
      }
      return new Response(cardJson("Blastoise"), { status: 200 });
    });

    const card = await identifyGemini(Buffer.from("img"), "image/jpeg", {
      env: { GEMINI_API_KEY: SECRET } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      log: (line) => logs.push(line),
    });

    assert.equal(card.name, "Blastoise");
    assert.deepEqual(models, ["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    assert.deepEqual(sleeps, []);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /status=404/);
    assert.equal(logs[0].includes(SECRET), false);
  });

  it("strips the key when a network error includes the request URL", async () => {
    const logs: string[] = [];
    const fetchImpl = mockFetch((url) => {
      throw new Error(`connect ${url}`);
    });
    await assert.rejects(
      () =>
        identifyGemini(Buffer.from("img"), "image/jpeg", {
          env: { GEMINI_API_KEY: SECRET, GEMINI_FALLBACK_MODEL: "" } as unknown as NodeJS.ProcessEnv,
          fetchImpl,
          sleepImpl: async () => {},
          log: (line) => logs.push(line),
        }),
      /unavailable right now/,
    );
    assert.equal(logs.length, 1);
    assert.match(logs[0], /status=0/);
    assert.equal(logs[0].includes(SECRET), false);
  });

  it("stops on a 429 without retrying or calling the fallback model", async () => {
    const models: string[] = [];
    const fetchImpl = mockFetch((url) => {
      models.push(url.match(/models\/([^:]+):/)?.[1] ?? "");
      return new Response(googleError(429, "quota"), { status: 429 });
    });
    await assert.rejects(
      () =>
        identifyGemini(Buffer.from("img"), "image/jpeg", {
          env: { GEMINI_API_KEY: SECRET } as unknown as NodeJS.ProcessEnv,
          fetchImpl,
          sleepImpl: async () => {
            throw new Error("waited");
          },
          log: () => {},
        }),
      (error: unknown) => error instanceof VisionQuotaError,
    );
    assert.deepEqual(models, ["gemini-3.8-flash"]);
  });
});

describe("vision fallback copy", () => {
  it("keeps a catalog message after the OCR note", () => {
    const message = withVisionFallbackNote(VISION_UNAVAILABLE_NOTE, "Several printings match. Tap the number, set, and rarity on your card.");
    assert.equal(isVisionFallbackMessage(message), true);
    assert.match(message, /Several printings match/);
  });

  it("keeps the unread-photo message when OCR also fails", () => {
    const message = withVisionFallbackNote(VISION_UNREAD_NOTE, READ_FAIL_MESSAGE);
    assert.match(message, /did not read a card name/);
    assert.match(message, /flatter, brighter photo/);
  });
});
