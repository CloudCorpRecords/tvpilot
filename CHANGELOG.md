# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `tvpilot devices|key|launch|apps|play|observe` and `tvpilot mcp`.
- MCP server (`tvpilot mcp`, stdio) with six tools:
  `tv.list_devices`, `tv.send_key`, `tv.launch_app`, `tv.list_apps`,
  `tv.play_title`, and `tv.observe`.
- Calls are forwarded as JSON-RPC `tools/call` POSTs to the relay at
  `https://tv.djwizard.ai/api/mcp` (override with `TVWIZARD_MCP_URL`),
  authenticated with `Authorization: Bearer <token>` from
  `TVWIZARD_TOKEN`. The relay HTTP path is a documented reconstruction:
  the public spec does not publish the relay's raw HTTP path.
- A missing token is an honest error naming `TVWIZARD_TOKEN`; upstream
  errors pass through unchanged as error text.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on fake-fetch fixtures with no network access.
