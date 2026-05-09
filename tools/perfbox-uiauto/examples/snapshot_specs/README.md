# Snapshot Spec Examples

These files are public v1 examples for `perfbox-uiauto snapshot`.

```powershell
perfbox-uiauto snapshot `
  --ui-url http://localhost:10000 `
  --trace D:\traces\sample.perfetto-trace `
  --spec .\examples\snapshot_specs\slice_highlight.snapshot.json `
  --out D:\reports\slice_highlight.png `
  --result D:\reports\slice_highlight.result.json
```

The CLI loads the trace in Perfetto UI, waits for
`window.perfboxUiAuto?.isReady()`, calls
`window.perfboxUiAuto.applySnapshot(spec)`, and captures the resulting view.

IDs and track names in these examples are placeholders. Production callers
should fill them from their trace analysis results.
