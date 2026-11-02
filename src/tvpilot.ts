/**
 * tvpilot core: six tools forwarded to the TVWizard relay.
 *
 *   tv.list_devices  list TVs paired with the caller's token
 *   tv.send_key      send one remote key event
 *   tv.launch_app    open an Android Intent / deep link / URL
 *   tv.list_apps     enumerate installed apps
 *   tv.play_title    resolve a title to a provider deep link and play it
 *   tv.observe       read back the TV screen state
 *
 * Transport (documented reconstruction): the public spec describes
 * the architecture (MCP client -> relay at tv.djwizard.ai -> bridge
 * app on the TV) and bearer-token auth, but does not publish the
 * relay's raw HTTP path. This rebuild forwards each call as a
 * JSON-RPC tools/call POST to https://tv.djwizard.ai/api/mcp,
 * overridable with TVWIZARD_MCP_URL, with the header
 * Authorization: Bearer <token> where the token comes from
 * TVWIZARD_TOKEN. That path choice is labelled a documented
 * reconstruction in the fixture and the build report.
 *
 * A missing token is an honest error naming TVWIZARD_TOKEN; no fake
 * result is ever produced. Upstream errors — including the relay's
 * resolver-disabled message and the accessibility_not_granted
 * message from tv.observe — pass through unchanged as error text.
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline.
 */
import type {
  FetchFn,
  LaunchAppOptions,
  PlayTitleOptions,
  Provider,
  RelayOptions,
  SendKeyOptions,
  TvKey,
} from "./types.js";
import { PROVIDERS, TV_KEYS } from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_RELAY_URL = "https://tv.djwizard.ai/api/mcp";

export const RELAY_URL_ENV = "TVWIZARD_MCP_URL";

export const TOKEN_ENV = "TVWIZARD_TOKEN";

/** Resolve the relay URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveRelayUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  const base = v ? v : DEFAULT_RELAY_URL;
  return base.replace(/\/+$/, "");
}

/** Resolve the bearer token: a non-blank string, else undefined. */
export function resolveToken(value?: string): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function optionalString(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

function optionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

function extractText(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const content = result.content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (isRecord(item) && typeof item.text === "string") parts.push(item.text);
  }
  return parts.length ? parts.join("\n") : undefined;
}

function unwrapResult(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  if (isRecord(payload.error)) {
    const msg =
      typeof payload.error.message === "string" && payload.error.message
        ? payload.error.message
        : JSON.stringify(payload.error);
    throw new Error(msg);
  }
  if (!("result" in payload)) return payload;
  const result = payload.result;
  if (isRecord(result) && result.isError === true) {
    throw new Error(extractText(result) ?? "TVWizard relay returned an error result");
  }
  const text = extractText(result);
  if (text !== undefined) {
    const trimmed = text.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return text;
      }
    }
    return text;
  }
  return result;
}

async function callRelay(
  fetchFn: FetchFn,
  toolName: string,
  args: Record<string, unknown>,
  options: RelayOptions,
): Promise<unknown> {
  const token = resolveToken(options.token);
  if (!token) {
    throw new Error(
      `${TOKEN_ENV} is not set: a TVWizard bearer token is required (pair the TV bridge app and copy the token it issues)`,
    );
  }
  const url = resolveRelayUrl(options.relayUrl);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  } catch (err) {
    throw new Error(
      `TVWizard relay request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (isRecord(payload.error) && typeof payload.error.message === "string" && payload.error.message) {
          detail = `: ${payload.error.message}`;
        } else if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      try {
        const t = await response.text();
        if (t) detail = `: ${t}`;
      } catch {
        // A body that cannot be read still reports its HTTP status below.
      }
    }
    throw new Error(
      `TVWizard relay request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("TVWizard relay returned a response that was not valid JSON");
  }
  return unwrapResult(payload);
}

/** List TVs paired with the caller's token. */
export async function listDevices(fetchFn: FetchFn, options: RelayOptions = {}): Promise<unknown> {
  return callRelay(fetchFn, "tv.list_devices", {}, options);
}

/** Send a single key event to the TV. */
export async function sendKey(fetchFn: FetchFn, options: SendKeyOptions): Promise<unknown> {
  const key = requireNonEmpty(options.key, "key");
  if (!(TV_KEYS as readonly string[]).includes(key)) {
    throw new Error(`key must be one of: ${TV_KEYS.join(", ")}`);
  }
  return callRelay(fetchFn, "tv.send_key", { key: key as TvKey }, options);
}

/** Open an Android Intent on the TV. */
export async function launchApp(fetchFn: FetchFn, options: LaunchAppOptions): Promise<unknown> {
  const data = requireNonEmpty(options.data, "data");
  const args: Record<string, unknown> = { data };
  const pkg = optionalString(options.package);
  if (pkg) args.package = pkg;
  return callRelay(fetchFn, "tv.launch_app", args, options);
}

/** Enumerate installed apps on the TV. */
export async function listApps(fetchFn: FetchFn, options: RelayOptions = {}): Promise<unknown> {
  return callRelay(fetchFn, "tv.list_apps", {}, options);
}

/** Resolve a natural-language title and play it on the TV. */
export async function playTitle(fetchFn: FetchFn, options: PlayTitleOptions): Promise<unknown> {
  const title = requireNonEmpty(options.title, "title");
  const args: Record<string, unknown> = { title };
  const country = optionalString(options.country);
  if (country) args.country = country;
  const season = optionalInt(options.season, "season");
  if (season !== undefined) args.season = season;
  const episode = optionalInt(options.episode, "episode");
  if (episode !== undefined) args.episode = episode;
  const year = optionalInt(options.year, "year");
  if (year !== undefined) args.year = year;
  const provider = optionalString(options.provider);
  if (provider) {
    if (!(PROVIDERS as readonly string[]).includes(provider)) {
      throw new Error(`provider must be one of: ${PROVIDERS.join(", ")}`);
    }
    args.provider = provider as Provider;
  }
  return callRelay(fetchFn, "tv.play_title", args, options);
}

/** Read back the TV screen state. */
export async function observe(fetchFn: FetchFn, options: RelayOptions = {}): Promise<unknown> {
  return callRelay(fetchFn, "tv.observe", {}, options);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
