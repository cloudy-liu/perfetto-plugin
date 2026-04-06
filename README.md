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

具体注册步骤见各子目录下的 **README.md**。
