# perfetto-plugin

本仓库是 **Perfetto UI 插件的独立源码包**（vendoring 用），不包含完整的
[google/perfetto](https://github.com/google/perfetto) 工程。

## 目录结构

```text
perfetto-plugin/
  README.md                              ← 本文件（仓库总览）
  LICENSE
  dev.perfetto.UiAutomationBridge/       ← 插件包（目录名与 Perfetto 内路径一致）
    README.md                            ← 安装、注册、API 说明
    index.ts                             ← 插件实现
    trace_ui_automation_bridge_unittest.ts
```

## 插件一览

| 目录 | 插件 ID | 说明 |
|------|---------|------|
| [dev.perfetto.UiAutomationBridge](dev.perfetto.UiAutomationBridge/) | `dev.perfetto.UiAutomationBridge` | 暴露 `window.traceUiAutomation`，供 Playwright 等做命令式 UI 自动化（选 slice、pin、缩放、标记等） |

将对应子目录 **整体拷贝** 到 Perfetto 源码中的：

`ui/src/plugins/<同上目录名>/`

## 注册为默认插件（随 UI 启动自动加载）

拷贝完成后，在 Perfetto 仓库里编辑 **`ui/src/core/default_plugins.ts`**：

1. 打开文件中的 `defaultPlugins` 字符串数组。
2. 在合适位置（例如其它 `dev.perfetto.*` 项附近）**新增一行**插件 ID，注意保留逗号：

   `'dev.perfetto.UiAutomationBridge',`

3. 重新构建 UI。

`defaultPlugins` 中的插件会在用户打开 Perfetto UI 时默认启用，无需在设置里手动勾选。

**仅临时启用（不改默认列表）**：可在 URL 上加  
`?enablePlugins=dev.perfetto.UiAutomationBridge`（多个插件用英文逗号分隔）。详见各子目录 **README.md**。
