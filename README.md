# tvpilot

tvpilot controls a paired Android TV or Google TV: it lists the
paired device, sends remote key events, launches apps and intents,
resolves a spoken-style title to the right streaming provider and
plays it, and reads back what is on the screen. One binary serves a
command-line interface and a stdio MCP server.

Calls go through the TVWizard relay, which forwards them over a
WebSocket to the bridge app running on the TV, so no same-network,
VPN, or port-forwarding setup is needed. Pairing is done once in
the bridge app: it shows a code, you claim it, and you receive a
bearer token for your TV.

## Configuration

Two environment variables configure the tool:

- `TVWIZARD_TOKEN` (required) — the bearer token issued when you
  paired your TV. Without it every call fails with an error naming
  the variable; there are no unauthenticated or fake results.
- `TVWIZARD_MCP_URL` (optional) — the relay endpoint. It defaults
  to `https://tv.djwizard.ai/api/mcp`. Note: the public TVWizard
  documentation describes the relay architecture and its bearer
  auth but does not publish the relay's raw HTTP path, so this
  default endpoint is a documented reconstruction; override it if
  the relay publishes a different path.

## Install

```bash
npx @reneturcios/tvpilot devices
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/tvpilot
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
tvpilot devices
tvpilot key POWER
tvpilot launch https://www.youtube.com/watch?v=jNQXAC9IVRw --package com.google.android.youtube.tv
tvpilot apps
tvpilot play Stranger Things --country US --season 2 --episode 3 --year 2016 --provider netflix
tvpilot observe

tvpilot --version
```

Commands print the relay's JSON payload. Exit codes: `0` on
success, `1` when a call fails (including a missing token or an
upstream relay error), `2` for usage errors.

Keys for `tvpilot key` are `POWER`, `HOME`, `UP`, `DOWN`, `LEFT`,
`RIGHT`, `OK`, `BACK`, `VOL_UP`, and `VOL_DOWN`. Providers for
`--provider` are `netflix`, `disney_plus`, `prime_video`, `max`,
`hulu`, `apple_tv_plus`, `paramount_plus`, `peacock`, `fubo_tv`,
`youtube`, and `stremio`.

`tvpilot observe` needs the Android AccessibilityService granted
to the bridge app. The first call without it returns an
`accessibility_not_granted` error explaining that a setup prompt
was posted on the TV; tap it, then retry.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/tvpilot mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "tvpilot": {
      "command": "npx",
      "args": ["-y", "@reneturcios/tvpilot", "mcp"],
      "env": { "TVWIZARD_TOKEN": "<your token>" }
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `tv.list_devices` | (none) | The TVs paired with the caller's token, each with an `id` and `online` flag. |
| `tv.send_key` | `key` (required) | Sends one key event: one of the ten keys listed above. |
| `tv.launch_app` | `data` (required), `package` (optional) | Opens an Intent URI, deep link, or URL, optionally in a named package. |
| `tv.list_apps` | (none) | Installed apps with `package`, `label`, and a `leanback` flag for TV launchers. |
| `tv.play_title` | `title` (required); `country`, `season`, `episode`, `year`, `provider` (optional) | Resolves the title to a provider deep link and plays it. |
| `tv.observe` | (none) | Foreground package/activity, the focused element, and visible clickable nodes. |

Upstream failures — a title that cannot be found, no provider for
the title in the chosen country, a relay with its resolver
disabled, or accessibility not yet granted — are returned as error
results carrying the relay's own message.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
