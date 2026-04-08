# perfetto-plugin

[English](README.md) | [简体中文](README.zh-CN.md)

Standalone source packages for Perfetto UI plugins.

This repo currently ships `dev.perfetto.UiAutomationBridge`, a plugin that
exposes `window.traceUiAutomation` for browser automation.

## What is this?

`perfetto-plugin` is a vendoring repo. It does not build or publish a
standalone plugin bundle.

Copy the plugin directory into a Perfetto checkout and build Perfetto UI there.

## What does it do?

`dev.perfetto.UiAutomationBridge` gives automation scripts a stable API for
driving Perfetto UI without relying on DOM clicks. It supports:

- selecting a slice or SQL event
- pinning tracks by name, kind, or URI
- zooming or panning the timeline
- adding temporary or permanent span notes

## How to use

1. Copy `dev.perfetto.UiAutomationBridge/` to
   `<perfetto>/ui/src/plugins/dev.perfetto.UiAutomationBridge/`.
2. Add `'dev.perfetto.UiAutomationBridge',` to
   `<perfetto>/ui/src/core/default_plugins.ts` if you want it enabled by
   default.
3. Build Perfetto UI in the Perfetto repo.
4. Load a trace and wait for `window.traceUiAutomation?.isReady()` before
   calling the API.

To enable the plugin without editing `default_plugins.ts`, open the UI with:

```text
?enablePlugins=dev.perfetto.UiAutomationBridge
```

## Build and test

Build and test happen inside the Perfetto repo after vendoring the plugin.

Build:

```bash
cd <perfetto>/ui
npm run build
```

Run all UI unit tests:

```bash
cd <perfetto>/ui
npm test
```

Run only this plugin's unit tests:

```bash
cd <perfetto>/ui
node build.js --run-unittests --test-filter trace_ui_automation_bridge
```

## Quick start

```bash
cp -R dev.perfetto.UiAutomationBridge <perfetto>/ui/src/plugins/
# edit <perfetto>/ui/src/core/default_plugins.ts and add:
# 'dev.perfetto.UiAutomationBridge',
cd <perfetto>/ui
npm run build
```

Then in Playwright:

```js
await page.waitForFunction(() => window.traceUiAutomation?.isReady());
await page.evaluate(() => window.traceUiAutomation.selectSlice(12345));
```

## License

Apache-2.0. See `LICENSE`.
