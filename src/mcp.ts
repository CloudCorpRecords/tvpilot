/**
 * tvpilot MCP server. Tools: tv.list_devices, tv.send_key,
 * tv.launch_app, tv.list_apps, tv.play_title, tv.observe.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Calls are forwarded to the relay at TVWIZARD_MCP_URL (default
 * https://tv.djwizard.ai/api/mcp, a documented reconstruction) with
 * the bearer token from TVWIZARD_TOKEN.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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
import { PROVIDERS, TV_KEYS } from "./types.js";
import type { FetchFn } from "./types.js";

const NoArgs = z.object({});
const SendKeyArgs = z.object({ key: z.enum(TV_KEYS) });
const LaunchAppArgs = z.object({
  data: z.string(),
  package: z.string().optional(),
});
const PlayTitleArgs = z.object({
  title: z.string(),
  country: z.string().optional(),
  season: z.number().int().optional(),
  episode: z.number().int().optional(),
  year: z.number().int().optional(),
  provider: z.enum(PROVIDERS).optional(),
});

const TOOLS = [
  {
    name: "tv.list_devices",
    description: "List TVs paired with the caller's token.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "tv.send_key",
    description: "Send a single key event to the TV.",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          enum: ["POWER", "HOME", "UP", "DOWN", "LEFT", "RIGHT", "OK", "BACK", "VOL_UP", "VOL_DOWN"],
          description: "Key event to send: POWER, HOME, UP, DOWN, LEFT, RIGHT, OK, BACK, VOL_UP, or VOL_DOWN.",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "tv.launch_app",
    description: "Open an Android Intent on the TV: a deep link, package launch, or arbitrary URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        data: { type: "string", description: "Deep link, Intent URI, or URL for the TV to open." },
        package: { type: "string", description: "Android package id to launch when the data value alone does not select the app." },
      },
      required: ["data"],
    },
  },
  {
    name: "tv.list_apps",
    description: "Enumerate installed apps on the TV.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "tv.play_title",
    description: "Resolve a natural-language title to a provider deep link and play it on the TV.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Natural-language title of the movie or show to play." },
        country: { type: "string", description: "Country code used to resolve provider availability and deep links." },
        season: { type: "integer", description: "Season number to play." },
        episode: { type: "integer", description: "Episode number to play, within the chosen season." },
        year: { type: "integer", description: "Release year, used to disambiguate same-name titles." },
        provider: {
          type: "string",
          enum: ["netflix", "disney_plus", "prime_video", "max", "hulu", "apple_tv_plus", "paramount_plus", "peacock", "fubo_tv", "youtube", "stremio"],
          description: "Streaming provider to play on: netflix, disney_plus, prime_video, max, hulu, apple_tv_plus, paramount_plus, peacock, fubo_tv, youtube, or stremio.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "tv.observe",
    description: "Read back the TV screen state: foreground app, focused element, and visible clickable nodes.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "tvpilot", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const relay = {
    relayUrl: resolveRelayUrl(process.env[RELAY_URL_ENV]),
    token: resolveToken(process.env[TOKEN_ENV]),
  };
  try {
    let out: unknown;
    if (name === "tv.list_devices") {
      NoArgs.parse(args ?? {});
      out = await listDevices(fetchFn, relay);
    } else if (name === "tv.send_key") {
      const parsed = SendKeyArgs.parse(args ?? {});
      out = await sendKey(fetchFn, { ...relay, key: parsed.key });
    } else if (name === "tv.launch_app") {
      const parsed = LaunchAppArgs.parse(args ?? {});
      out = await launchApp(fetchFn, { ...relay, data: parsed.data, package: parsed.package });
    } else if (name === "tv.list_apps") {
      NoArgs.parse(args ?? {});
      out = await listApps(fetchFn, relay);
    } else if (name === "tv.play_title") {
      const parsed = PlayTitleArgs.parse(args ?? {});
      out = await playTitle(fetchFn, { ...relay, ...parsed });
    } else if (name === "tv.observe") {
      NoArgs.parse(args ?? {});
      out = await observe(fetchFn, relay);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
