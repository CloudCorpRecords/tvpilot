#!/usr/bin/env node
/**
 * tvpilot CLI.
 *
 *   tvpilot devices
 *   tvpilot key <KEY>
 *   tvpilot launch <data> [--package <pkg>]
 *   tvpilot apps
 *   tvpilot play <title> [--country XX] [--season N] [--episode N] [--year N] [--provider <name>]
 *   tvpilot observe
 *   tvpilot mcp
 *
 * Relay URL from TVWIZARD_MCP_URL, default
 * https://tv.djwizard.ai/api/mcp (documented reconstruction).
 * Bearer token from TVWIZARD_TOKEN.
 * Exit codes: 0 success, 1 relay error, 2 usage error.
 */
import {
  formatPayload,
  launchApp,
  listApps,
  listDevices,
  observe,
  playTitle,
  RELAY_URL_ENV,
  resolveRelayUrl,
  resolveToken,
  sendKey,
  TOKEN_ENV,
  VERSION,
} from "./tvpilot.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  tvpilot devices
  tvpilot key <KEY>
  tvpilot launch <data> [--package <pkg>]
  tvpilot apps
  tvpilot play <title> [--country XX] [--season N] [--episode N] [--year N] [--provider <name>]
  tvpilot observe
  tvpilot mcp
  tvpilot --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function intFlag(rest: string[], name: string): number | undefined {
  const v = flag(rest, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) usage();
  return n;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const relay = {
    relayUrl: resolveRelayUrl(process.env[RELAY_URL_ENV]),
    token: resolveToken(process.env[TOKEN_ENV]),
  };
  const known = ["devices", "key", "launch", "apps", "play", "observe"];
  if (!known.includes(cmd)) usage();
  try {
    let out: unknown;
    if (cmd === "devices") {
      out = await listDevices(fetchFn, relay);
    } else if (cmd === "key") {
      if (!rest[0]) usage();
      out = await sendKey(fetchFn, { ...relay, key: rest[0] });
    } else if (cmd === "launch") {
      if (!rest[0]) usage();
      out = await launchApp(fetchFn, {
        ...relay,
        data: rest[0],
        package: flag(rest, "--package"),
      });
    } else if (cmd === "apps") {
      out = await listApps(fetchFn, relay);
    } else if (cmd === "play") {
      // Title is the positional words before the first --flag.
      const titleWords: string[] = [];
      for (const tok of rest) {
        if (tok.startsWith("--")) break;
        titleWords.push(tok);
      }
      if (!titleWords.length) usage();
      out = await playTitle(fetchFn, {
        ...relay,
        title: titleWords.join(" "),
        country: flag(rest, "--country"),
        season: intFlag(rest, "--season"),
        episode: intFlag(rest, "--episode"),
        year: intFlag(rest, "--year"),
        provider: flag(rest, "--provider"),
      });
    } else {
      out = await observe(fetchFn, relay);
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
