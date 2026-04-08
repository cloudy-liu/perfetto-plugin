# perfetto-plugin

[English](README.md) | [简体中文](README.zh-CN.md)

面向 Perfetto UI 插件的独立源码仓库。

当前仓库提供 `dev.perfetto.UiAutomationBridge`，它会暴露
`window.traceUiAutomation`，供浏览器自动化调用。

## 项目是什么？

`perfetto-plugin` 是一个用于 vendoring 的源码仓库，不会单独构建或发布插件
bundle。

正确用法是：把插件目录拷贝进 Perfetto 源码树，然后在 Perfetto 工程里完成 UI
构建。

## 有什么作用？

`dev.perfetto.UiAutomationBridge` 为自动化脚本提供稳定的语义化接口，避免依赖
DOM 点击。它支持：

- 选择 slice 或 SQL event
- 按名称、kind、URI pin track
- 缩放或平移时间线
- 添加临时或永久 span note

## 如何使用

1. 将 `dev.perfetto.UiAutomationBridge/` 复制到
   `<perfetto>/ui/src/plugins/dev.perfetto.UiAutomationBridge/`
2. 如果希望默认启用，在
   `<perfetto>/ui/src/core/default_plugins.ts` 中加入
   `'dev.perfetto.UiAutomationBridge',`
3. 在 Perfetto 仓库中重新构建 UI
4. 打开 trace 后，等待 `window.traceUiAutomation?.isReady()` 为真，再调用 API

如果不想改 `default_plugins.ts`，也可以通过 URL 临时启用：

```text
?enablePlugins=dev.perfetto.UiAutomationBridge
```

## 编译与测试

编译和测试都发生在 vendoring 之后的 Perfetto 仓库里。

构建 UI：

```bash
cd <perfetto>/ui
npm run build
```

运行全部 UI 单测：

```bash
cd <perfetto>/ui
npm test
```

只运行这个插件的单测：

```bash
cd <perfetto>/ui
node build.js --run-unittests --test-filter trace_ui_automation_bridge
```

## 快速入门

```bash
cp -R dev.perfetto.UiAutomationBridge <perfetto>/ui/src/plugins/
# 编辑 <perfetto>/ui/src/core/default_plugins.ts，加入：
# 'dev.perfetto.UiAutomationBridge',
cd <perfetto>/ui
npm run build
```

然后在 Playwright 中调用：

```js
await page.waitForFunction(() => window.traceUiAutomation?.isReady());
await page.evaluate(() => window.traceUiAutomation.selectSlice(12345));
```

## 许可

Apache-2.0，见 `LICENSE`。
