# UiAutomationBridge（Trace UI 自动化）

本目录在独立仓库中的路径为：

`perfetto-plugin/dev.perfetto.UiAutomationBridge/`

插件在 Perfetto 源码中应对应：

`ui/src/plugins/dev.perfetto.UiAutomationBridge/`

实现暴露 **`window.traceUiAutomation`**：面向浏览器自动化（如 Playwright）的命令式 API，用公开语义接口驱动 Perfetto UI，避免依赖 DOM 结构。

## 并入 Perfetto 工程

1. 将本目录 **原样复制** 到：

   `ui/src/plugins/dev.perfetto.UiAutomationBridge/`

2. 在 **`ui/src/core/default_plugins.ts`** 的 `defaultPlugins` 数组中加入一行：

   `'dev.perfetto.UiAutomationBridge',`

   列表中的插件会在 UI 启动时默认加载。

3. 重新构建 UI。

### 不改默认列表时（仅当前会话）

在 URL 上增加查询参数（见 `ui/src/frontend/index.ts` 对 `route.args.enablePlugins` 的处理）：

`?enablePlugins=dev.perfetto.UiAutomationBridge`

多个插件用英文逗号分隔。

## 自动化侧约定

- 全局对象：**`window.traceUiAutomation`**
- Trace 就绪后调用 **`traceUiAutomation.isReady()`** 为 `true` 再执行其它方法。

## 单元测试

本目录中的 **`trace_ui_automation_bridge_unittest.ts`** 需在 **Perfetto 的 `ui/` 工程** 内运行（依赖 `../../public/*` 等路径）：

在 Perfetto 仓库的 `ui/` 目录执行：

`npm test`

（内部为 `node build.js --run-unittests`。）

将插件目录拷入 `ui/src/plugins/dev.perfetto.UiAutomationBridge/` 后，测试文件与 Perfetto 内其它 `*_unittest.ts` 一样由同一 Jest 配置收集。
