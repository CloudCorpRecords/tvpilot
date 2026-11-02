import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  launchApp,
  listApps,
  listDevices,
  observe,
  playTitle,
  resolveRelayUrl,
  resolveToken,
  sendKey,
} from "../src/tvpilot.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function relayResult(payload: unknown) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
    },
  };
}

function fakeFetch(captured: Captured, body: unknown = relayResult({ ok: true })): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body);
  };
}

const RELAY = "https://tv.djwizard.ai/api/mcp";
const OPTS = { relayUrl: RELAY, token: "tok-123" };

function sentBody(c: Captured): { method: string; params: { name: string; arguments: Record<string, unknown> } } {
  return JSON.parse(c.body ?? "{}");
}

describe("relay URL and token resolution", () => {
  it("defaults and strips trailing slashes", () => {
    assert.equal(resolveRelayUrl(undefined), RELAY);
    assert.equal(resolveRelayUrl("  "), RELAY);
    assert.equal(resolveRelayUrl("https://example.test/mcp/"), "https://example.test/mcp");
  });

  it("token trims and blanks become undefined", () => {
    assert.equal(resolveToken("  abc "), "abc");
    assert.equal(resolveToken(""), undefined);
    assert.equal(resolveToken(undefined), undefined);
  });
});

describe("JSON-RPC shaping and Bearer header", () => {
  it("list_devices posts a tools/call with no args and the Bearer header", async () => {
    const c: Captured = {};
    const out = await listDevices(fakeFetch(c, relayResult({ devices: [{ id: "living-room", online: true }] })), OPTS);
    assert.deepEqual(out, { devices: [{ id: "living-room", online: true }] });
    assert.equal(c.url, RELAY);
    assert.equal(c.method, "POST");
    assert.equal(c.headers?.Authorization, "Bearer tok-123");
    assert.equal(c.headers?.["Content-Type"], "application/json");
    const body = sentBody(c);
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.name, "tv.list_devices");
    assert.deepEqual(body.params.arguments, {});
  });

  it("list_apps and observe forward their dotted names", async () => {
    const c1: Captured = {};
    await listApps(fakeFetch(c1), OPTS);
    assert.equal(sentBody(c1).params.name, "tv.list_apps");
    const c2: Captured = {};
    await observe(fakeFetch(c2), OPTS);
    assert.equal(sentBody(c2).params.name, "tv.observe");
  });

  it("honours a custom relay URL", async () => {
    const c: Captured = {};
    await listDevices(fakeFetch(c), { relayUrl: "https://example.test/mcp/", token: "t" });
    assert.equal(c.url, "https://example.test/mcp");
  });
});

describe("missing token", () => {
  it("missing token is an honest error naming TVWIZARD_TOKEN and sends nothing", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    await assert.rejects(() => listDevices(spy, { relayUrl: RELAY }), /TVWIZARD_TOKEN is not set/);
    assert.equal(called, false);
    await assert.rejects(() => sendKey(spy, { relayUrl: RELAY, token: "  ", key: "POWER" }), /TVWIZARD_TOKEN/);
    assert.equal(called, false);
  });
});

describe("send_key", () => {
  it("forwards a valid key", async () => {
    const c: Captured = {};
    await sendKey(fakeFetch(c), { ...OPTS, key: "VOL_UP" });
    assert.equal(sentBody(c).params.name, "tv.send_key");
    assert.deepEqual(sentBody(c).params.arguments, { key: "VOL_UP" });
  });

  it("rejects a key outside the enum before any request", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    await assert.rejects(() => sendKey(spy, { ...OPTS, key: "MUTE" }), /key must be one of/);
    assert.equal(called, false);
  });

  it("rejects an empty key", async () => {
    await assert.rejects(() => sendKey(fakeFetch({}), { ...OPTS, key: " " }), /non-empty/);
  });
});

describe("launch_app", () => {
  it("forwards data and the optional package", async () => {
    const c: Captured = {};
    await launchApp(fakeFetch(c), { ...OPTS, data: "https://www.youtube.com/watch?v=jNQXAC9IVRw", package: "com.google.android.youtube.tv" });
    assert.deepEqual(sentBody(c).params.arguments, {
      data: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      package: "com.google.android.youtube.tv",
    });
  });

  it("omits package when not supplied", async () => {
    const c: Captured = {};
    await launchApp(fakeFetch(c), { ...OPTS, data: "https://example.test/x" });
    assert.deepEqual(sentBody(c).params.arguments, { data: "https://example.test/x" });
  });
});

describe("play_title", () => {
  it("forwards title only when no optionals are supplied", async () => {
    const c: Captured = {};
    await playTitle(fakeFetch(c), { ...OPTS, title: "Inception" });
    assert.equal(sentBody(c).params.name, "tv.play_title");
    assert.deepEqual(sentBody(c).params.arguments, { title: "Inception" });
  });

  it("passes every optional field through unchanged", async () => {
    const c: Captured = {};
    await playTitle(fakeFetch(c), {
      ...OPTS,
      title: "Stranger Things",
      country: "US",
      season: 2,
      episode: 3,
      year: 2016,
      provider: "netflix",
    });
    assert.deepEqual(sentBody(c).params.arguments, {
      title: "Stranger Things",
      country: "US",
      season: 2,
      episode: 3,
      year: 2016,
      provider: "netflix",
    });
  });

  it("rejects an unknown provider and a non-integer season", async () => {
    await assert.rejects(() => playTitle(fakeFetch({}), { ...OPTS, title: "X", provider: "bogus" }), /provider must be one of/);
    await assert.rejects(() => playTitle(fakeFetch({}), { ...OPTS, title: "X", season: 1.5 }), /season must be an integer/);
  });
});

describe("upstream error mapping", () => {
  it("JSON-RPC error message passes through", async () => {
    const failing: FetchFn = async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "title not found on TMDB" } });
    await assert.rejects(() => playTitle(failing, { ...OPTS, title: "Nope" }), /title not found on TMDB/);
  });

  it("isError result text passes through (resolver disabled)", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [{ type: "text", text: "resolver disabled: TMDB_API_KEY is not set" }] },
    };
    const failing: FetchFn = async () => jsonResponse(body);
    await assert.rejects(() => playTitle(failing, { ...OPTS, title: "Inception" }), /resolver disabled: TMDB_API_KEY is not set/);
  });

  it("accessibility_not_granted passes through from observe", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [{ type: "text", text: "accessibility_not_granted: a setup prompt was just posted on the TV. Ask the user to tap it to grant accessibility, then retry tv.observe." }],
      },
    };
    const failing: FetchFn = async () => jsonResponse(body);
    await assert.rejects(() => observe(failing, OPTS), /accessibility_not_granted/);
  });

  it("HTTP error surfaces status and upstream message", async () => {
    const failing: FetchFn = async () =>
      jsonResponse({ error: { message: "unauthorized" } }, 401, "Unauthorized");
    await assert.rejects(() => listDevices(failing, OPTS), /HTTP 401.*unauthorized/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => listDevices(failing, OPTS), /TVWizard relay request failed: socket hang up/);
  });
});
