# perfbox-uiauto

`perfbox-uiauto` is the Go CLI for driving Perfetto UI through
`dev.perfbox.UiAutoBridge`.

The v1 `snapshot` command opens Perfetto UI, loads a trace through the file
input path, waits for `window.perfboxUiAuto?.isReady()`, calls
`window.perfboxUiAuto.applySnapshot(spec)`, then writes a PNG and optional
result JSON.

## Usage

```powershell
perfbox-uiauto snapshot `
  --ui-url http://localhost:10000 `
  --trace D:\traces\sample.trace `
  --spec D:\reports\sample.snapshot.json `
  --out D:\reports\sample.png `
  --result D:\reports\sample.result.json
```

## Flags

- `--ui-url`, default `http://localhost:10000`
- `--trace`, required
- `--spec`, required
- `--out`, required
- `--result`, optional
- `--viewport`, default `1680x900`
- `--timeout-ms`, default `60000`
- `--browser-path`, optional explicit Chrome, Edge, or Chromium path
- `--profile-dir`, optional persistent browser profile directory
- `--headed`, default `false`; by default the browser runs headless

By default, each invocation uses an isolated temporary browser profile so
upstream tools can run multiple processes concurrently. Pass `--profile-dir` to
reuse a persistent browser profile across invocations, which can preserve
browser cache and local storage. Do not run concurrent CLI invocations against
the same profile directory because Chromium locks active profiles.
