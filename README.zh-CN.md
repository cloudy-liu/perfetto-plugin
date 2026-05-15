# perfetto-plugin

[English](README.md) | [简体中文](README.zh-CN.md)

这是 Perfbox 用来维护 vendored Perfetto UI 插件源码以及可选配套工具的仓库。

当前仓库在 `ui-plugins/` 下包含 `dev.perfbox.UiAutoBridge` 插件。它会在
Perfetto UI 中暴露 `window.perfboxUiAuto`，让外部浏览器自动化工具通过稳定的
语义 API 操作 Perfetto UI，而不是依赖脆弱的 DOM 点击流程。

## 仓库结构

```text
ui-plugins/
  dev.perfbox.UiAutoBridge/
    README.md
    index.ts
    ui_auto_bridge_unittest.ts

tools/
  perfbox-uiauto/
```

`perfetto-plugin` 本身不单独构建 Perfetto UI 插件 bundle。正确使用方式是把
插件源码目录复制到完整 Perfetto 源码树中，然后在 Perfetto 工程里构建和测试。
`tools/` 下的配套工具是可选能力，不要求每个插件都拥有一个工具。

## 插件使用

1. 将 `ui-plugins/dev.perfbox.UiAutoBridge/` 复制到
   `<perfetto>/ui/src/plugins/dev.perfbox.UiAutoBridge/`。
2. 如果希望默认启用，在
   `<perfetto>/ui/src/core/default_plugins.ts` 中加入：
   `'dev.perfbox.UiAutoBridge',`
3. 在 Perfetto 仓库中重新构建 UI。
4. 打开 trace 后，等待 `window.perfboxUiAuto?.isReady()` 为真，再调用 API。

如果不想修改 `default_plugins.ts`，也可以通过 URL 临时启用：

```text
?enablePlugins=dev.perfbox.UiAutoBridge
```

## 插件测试

插件复制到 Perfetto 后，在 Perfetto 仓库中运行：

```bash
cd <perfetto>
./ui/run-unittests --test-filter ui_auto_bridge
```

## API 示例

```js
await page.waitForFunction(() => window.perfboxUiAuto?.isReady());
await page.evaluate(() => window.perfboxUiAuto.selectSlice(12345));
```

## CLI

`tools/perfbox-uiauto/` 是 Go 实现的 `perfbox-uiauto` CLI。`snapshot`
命令会通过 Chrome DevTools Protocol 打开 Perfetto UI、加载 trace、调用
`window.perfboxUiAuto.applySnapshot(spec)`，并输出 PNG 截图和可选的结构化
result JSON。

```powershell
perfbox-uiauto snapshot `
  --ui-url http://localhost:10000 `
  --trace D:\traces\sample.trace `
  --spec D:\reports\sample.snapshot.json `
  --out D:\reports\sample.png `
  --result D:\reports\sample.result.json
```

CLI 默认以 headless 模式运行浏览器。调试时可以加 `--headed` 显示浏览器窗口；
如果需要多次运行时复用浏览器缓存和 local storage，可以加
`--profile-dir D:\cache\perfbox-uiauto-profile` 使用持久 profile。不要让多个
并发 CLI 进程共用同一个 profile 目录，因为 Chromium 会锁定正在使用的 profile。

CLI 单元测试：

```bash
cd tools/perfbox-uiauto
go test ./...
```

## 许可

Apache-2.0，见 `LICENSE`。

## 贡献

贡献内容按 Apache-2.0 授权，见 `CONTRIBUTING.md`。
