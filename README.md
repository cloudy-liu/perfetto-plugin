# perfetto-plugin

[English](README.md) | [简体中文](README.zh-CN.md)

Vendored Perfetto UI plugins and companion tools for Perfbox workflows.

This repository currently contains the `dev.perfbox.UiAutoBridge` plugin. The
plugin exposes `window.perfboxUiAuto`, a browser automation API for driving
Perfetto UI through stable semantic operations instead of DOM clicks.

## Repository Layout

```text
dev.perfbox.UiAutoBridge/
  README.md
  index.ts
  ui_auto_bridge_unittest.ts

tools/
  perfbox-uiauto/
```

`perfetto-plugin` is a source vendoring repository. The plugin is built and
tested after it is copied into a full Perfetto checkout.

## Plugin Usage

1. Copy `dev.perfbox.UiAutoBridge/` to
   `<perfetto>/ui/src/plugins/dev.perfbox.UiAutoBridge/`.
2. Add `'dev.perfbox.UiAutoBridge',` to
   `<perfetto>/ui/src/core/default_plugins.ts` if you want it enabled by
   default.
3. Build Perfetto UI from the Perfetto repository.
4. Load a trace and wait for `window.perfboxUiAuto?.isReady()` before calling
   the API.

To enable the plugin without editing `default_plugins.ts`, open Perfetto UI with:

```text
?enablePlugins=dev.perfbox.UiAutoBridge
```

## Plugin Test

Run the plugin unit tests after vendoring the plugin into Perfetto:

```bash
cd <perfetto>
./ui/run-unittests --test-filter ui_auto_bridge
```

## Quick API Example

```js
await page.waitForFunction(() => window.perfboxUiAuto?.isReady());
await page.evaluate(() => window.perfboxUiAuto.selectSlice(12345));
```

## CLI

`tools/perfbox-uiauto/` contains the Go `perfbox-uiauto` CLI. The `snapshot`
command uses Chrome DevTools Protocol to open Perfetto UI, load a trace, call
`window.perfboxUiAuto.applySnapshot(spec)`, and write a PNG plus optional
structured result JSON.

```powershell
perfbox-uiauto snapshot `
  --ui-url http://localhost:10000 `
  --trace D:\traces\sample.trace `
  --spec D:\reports\sample.snapshot.json `
  --out D:\reports\sample.png `
  --result D:\reports\sample.result.json
```

Run CLI unit tests from the tool directory:

```bash
cd tools/perfbox-uiauto
go test ./...
```

## License

Apache-2.0. See `LICENSE`.

## Contributing

Contributions are accepted under Apache-2.0. See `CONTRIBUTING.md`.
