# tvpilot — Build Report

MCP Rebuild 1000. Clean-room rebuild of fizzious1/TVWizard-mcp
(rank 381, Tier C), built from the public README + `docs/mcp-tools.md`
spec captured in `specs-batch8/tvwizard.md` and the fixture
`harness/fixtures/tvwizard-mcp-tools-original.json`. That fixture is
docs-derived: the 6 enumerated tools govern (the registry candidate
description's "38 tools" claim is noted in the fixture `_source` as a
discrepancy). No original server was probed. Parity proves the rebuild
matches this program's defined spec, labelled docs-derived. Local
build only — nothing pushed or published.

Identity: repo `tvpilot`, npm `@reneturcios/tvpilot`,
MCP name `io.github.CloudCorpRecords/tvpilot`, version `0.1.0`,
bin `tvpilot` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `tvpilot: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Android TV remote: list devices, send
  keys, launch apps, play titles, and observe the screen." = **93 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/tvpilot:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/tvpilot"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`devices`, `key`, `launch`, `apps`,
  `play`, `observe`, `mcp`, `--version`; exit 2 usage / 1 relay error),
  `src/mcp.ts`, `src/types.ts`, `src/tvpilot.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/tvpilot.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to tvpilot)
- Plus `parity-out/` (harness output) and this report.

## Tools implemented (6)

`tv.list_devices` (no params), `tv.send_key` (`key` required, enum
POWER|HOME|UP|DOWN|LEFT|RIGHT|OK|BACK|VOL_UP|VOL_DOWN),
`tv.launch_app` (`data` required, `package` optional),
`tv.list_apps` (no params), `tv.play_title` (`title` required;
`country`/`season`/`episode`/`year`/`provider` optional, provider enum
netflix|disney_plus|prime_video|max|hulu|apple_tv_plus|paramount_plus|
peacock|fubo_tv|youtube|stremio), `tv.observe` (no params) — the full
documented set, as recorded in the fixture `_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals matching the fixture exactly, per the task
  spec: the high-level helper's zod-to-JSON-Schema conversion injects
  keys absent from the defined spec and breaks exact schema parity.
  Zod still validates every `tools/call`.
- Core (`src/tvpilot.ts`) with injectable `FetchFn`: each call is
  forwarded as a JSON-RPC `tools/call` POST to the relay
  `https://tv.djwizard.ai/api/mcp` (env `TVWIZARD_MCP_URL` override),
  header `Authorization: Bearer <token>` from env `TVWIZARD_TOKEN`.
  **Relay-path choice (documented reconstruction):** the public spec
  describes the relay architecture and bearer auth but does not
  publish the relay's raw HTTP path, so this endpoint is a documented
  reconstruction, labelled as such in the fixture `_source`, the core
  header comment, the README, and here.
- Missing token → honest error naming `TVWIZARD_TOKEN`, thrown before
  any request is sent; never a fake result. In MCP mode this surfaces
  as an `isError` result; in the CLI it exits 1.
- Upstream errors pass through as honest error text: JSON-RPC `error`
  messages, `isError` result text (including the relay's
  `resolver disabled: TMDB_API_KEY is not set` and tv.observe's
  `accessibility_not_granted: ...` messages), and HTTP failures with
  status plus the upstream message when present. Successful relay
  results are unwrapped from their text content (JSON text is parsed
  back to an object).
- Key and provider enums are validated in the core before any
  request, in addition to the zod validation in the MCP layer;
  `season`/`episode`/`year` must be integers. Optional play_title
  fields are omitted from the forwarded arguments when not supplied.

## Verification (foreground, exact outputs)

### 1. Typecheck and build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ ./node_modules/.bin/tsc ; echo exit=$?
exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
19 tests, FAKE FETCH ONLY, no network. Covers: relay-URL
default/custom/trailing-slash and token resolution; JSON-RPC
shaping (method `tools/call`, dotted tool names, arguments) plus the
`Authorization: Bearer` and content-type headers for list_devices,
list_apps, and observe; missing-token error naming `TVWIZARD_TOKEN`
with no request sent; send_key forwarding, enum rejection, and
empty-key rejection; launch_app data/package forwarding and package
omission; play_title title-only forwarding, full optional-field
passthrough, unknown-provider and non-integer-season rejection;
upstream error mapping for JSON-RPC errors, resolver-disabled
isError text, `accessibility_not_granted` from observe, HTTP 401
with upstream message, and network-failure wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with Usage;
`devices` with no token exits 1 with the `TVWIZARD_TOKEN is not set`
error. MCP `initialize`/`tools/list` exercised by the parity harness
below. No live relay call was made in smoke — no token is available
in this environment, and no live result is claimed.

### 4. Parity (harness)
```
$ python3 ~/workspace/mcp-rebuild-100/harness/parity.py \
    --original ~/workspace/mcp-rebuild-100/harness/fixtures/tvwizard-mcp-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/tvpilot/dist/cli.js mcp" \
    --out ~/workspace/mcp-rebuild-100/builds/tvpilot/parity-out
verdict=PASS parity_pct=100.0 original_tools=6 rebuild_tools=6 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 6/6.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`/`dist`), offline
`npm install --package-lock-only --ignore-scripts --offline`,
verified after generation — parses as JSON, top-level `name` is
`@reneturcios/tvpilot`, version `0.1.0`, `lockfileVersion` 3, **128
package entries** — then only the lockfile was placed in the build
dir. Local `node_modules` is a copy of the fxrates sibling's tree,
used only for the local build/test; it is not part of the lockfile
generation.

## Gaps / honest notes

- Docs-derived spec: no original TVWizard server was probed, so
  parity proves the rebuild matches this program's defined spec, not
  a hand-probed original.
- Relay HTTP path is a documented reconstruction: the public spec
  does not publish the relay's raw HTTP path. If the real relay
  expects a different path or envelope, only `TVWIZARD_MCP_URL` /
  `DEFAULT_RELAY_URL` and the forwarding code need to change; the
  tool surface is unaffected.
- No live call was made: every behaviour is fake-fetch tested only,
  so live relay payload/response-shape drift (including how the real
  relay wraps tool results) is unverified until a paired token is
  available.
- The registry candidate's "38 tools" claim could not be reconciled
  with the enumerated docs (README + docs/mcp-tools.md both say six
  in v0.3); the enumerated 6 govern, per the spec.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
