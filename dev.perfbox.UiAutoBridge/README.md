# Perfbox UiAuto Bridge

`dev.perfbox.UiAutoBridge` is a Perfetto UI plugin for browser automation.
It exposes `window.perfboxUiAuto` after a trace is loaded.

The plugin belongs in a full Perfetto checkout at:

```text
ui/src/plugins/dev.perfbox.UiAutoBridge/
```

## Enable The Plugin

For default enablement, add the plugin ID to Perfetto:

```ts
'dev.perfbox.UiAutoBridge',
```

in:

```text
ui/src/core/default_plugins.ts
```

For one session only, enable it through the URL:

```text
?enablePlugins=dev.perfbox.UiAutoBridge
```

## Automation Contract

- Global object: `window.perfboxUiAuto`
- Ready check: `window.perfboxUiAuto?.isReady()`
- No compatibility alias is exposed for older names.

Current low-level helpers include:

- `applySnapshot(spec)`
- `selectSlice(id)`
- `selectSqlEvent(table, id)`
- `pinTrackByName(pattern)`
- `pinTrackByKind(kind)`
- `pinTrackByUri(uri)`
- `zoomTo(startNs, endNs)`
- `panTo(tsNs)`
- `mark()`
- `markPermanent()`
- `addSpanNote(startNs, endNs, color, text)`
- `reset()`
- `listTracks()`

## Unit Tests

Run from the Perfetto repository after copying this directory into
`ui/src/plugins/`:

```bash
./ui/run-unittests --test-filter ui_auto_bridge
```
