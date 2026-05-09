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
- `--viewport`, default `1920x1080`
- `--timeout-ms`, default `60000`
- `--browser-path`, optional explicit Chrome, Edge, or Chromium path
- `--headed`, default `false`

Each invocation uses an isolated temporary browser profile so upstream tools can
run multiple processes concurrently.
