# 🔌 perfetto-plugin

面向 [Perfetto](https://github.com/google/perfetto) 的 **UI 插件独立源码仓库**：把插件目录 vendoring 进官方工程即可参与 **同一套 UI 构建**，**不是**单独发 npm 包、也**没有**「只编译这一个插件」的独立产物。

---

## 📌 本仓库解决什么问题？

Perfetto 的 Trace UI 是 **单页应用 + 统一打包**。插件以 TypeScript 写在 `ui/src/plugins/` 下，构建时会扫描目录生成 `all_plugins` 引用，再与整仓一起 **tsc + Rollup** 打进 `dist`。  
因此：自动化/内建部署时，需要一份 **可拷贝的插件源码** 与 **注册方式说明**——这就是本仓库的定位。

---

## 📂 目录结构

```text
perfetto-plugin/
├── README.md                 ← 本文件：总览、构建说明、注册方式
├── LICENSE                   ← Apache-2.0
└── dev.perfetto.UiAutomationBridge/
    ├── README.md             ← 该插件的 API、URL 参数等细节
    ├── index.ts              ← 插件实现（暴露 window.traceUiAutomation）
    └── trace_ui_automation_bridge_unittest.ts
```

---

## 🧩 包含的插件

| 目录 | 插件 ID | 一句话 |
|------|---------|--------|
| [dev.perfetto.UiAutomationBridge](dev.perfetto.UiAutomationBridge/) | `dev.perfetto.UiAutomationBridge` | 命令式驱动 UI：选 slice、pin track、缩放、标记等，适合 Playwright / `page.evaluate`，减少 DOM 依赖 |

更多调用约定见子目录 **README.md**。

---

## ❓ 需要「单独编译」插件吗？

**不需要、也不能**在本仓库里单独打出可部署的插件 bundle。

| 做法 | 结果 |
|------|------|
| ✅ 把子目录拷到 Perfetto 的 `ui/src/plugins/<目录名>/`，并按下文 **注册** + **构建整个 UI** | 插件会进产物，浏览器里可用 |
| ❌ 只拷贝文件，**不**跑 Perfetto UI 构建 | 不会生成新的 `all_plugins` / bundle，**等于没装上** |
| ❌ 只在 perfetto-plugin 里自己跑 `tsc` | 与官方 UI 打包链路无关，**不能**替代 Perfetto 的 `ui` 构建 |

构建时 Perfetto 会扫描 `ui/src/plugins/` 并生成导入表（例如 `all_plugins`），再对 **整个 `ui` 工程** 做 TypeScript 编译与 Rollup 打包——插件与核心 UI **同一次构建**完成。

---

## 🛠️ 在 Perfetto 工程里怎么用（推荐流程）

### 1️⃣ 准备官方仓库

克隆并配置好 [google/perfetto](https://github.com/google/perfetto)，能按官方文档完成 **UI 构建**（需 Node、以及仓库规定的 `out/xxx` 等）。

### 2️⃣ 拷贝插件源码

将本仓库中的 **`dev.perfetto.UiAutomationBridge/` 整个目录** 复制到：

```text
<perfetto>/ui/src/plugins/dev.perfetto.UiAutomationBridge/
```

目录名请与上表 **插件 ID** 一致（含点号），便于与文档和 `default_plugins` 对照。

### 3️⃣ 注册插件

二选一（可同时理解：默认启用 vs 仅本次会话）。

#### 方式 A：默认随 UI 启动加载（推荐用于自建部署）

编辑 **`ui/src/core/default_plugins.ts`**，在 `defaultPlugins` 数组里增加一行（注意逗号）：

```ts
'dev.perfetto.UiAutomationBridge',
```

保存后，用户打开你构建的 UI 时会自动加载该插件，无需在设置里再勾选。

#### 方式 B：不改编译默认列表，仅 URL 临时启用

在打开 UI 的地址后加上（多个插件用英文逗号分隔）：

```text
?enablePlugins=dev.perfetto.UiAutomationBridge
```

实现细节见 Perfetto 源码里对 `route.args.enablePlugins` 的处理。

### 4️⃣ 重新构建 Perfetto UI

在 **Perfetto 仓库根目录** 按你环境使用官方方式构建 UI，例如（具体以你本机 `out` 目录名为准）：

- 使用 GN + Ninja：`tools/ninja -C out/<你的输出目录> ui`  
- 或在已配置好的 `ui/out` 链路下执行与文档一致的 **`ui` 构建**（内部会跑 `node build.js`，扫描 plugins、编译 TS、打包 JS）

构建成功后，用新产物打开 UI，在控制台可检查是否存在 **`window.traceUiAutomation`**（trace 加载并就绪后 **`isReady()`** 为 `true` 再调用方法）。

### 5️⃣（可选）单元测试

`trace_ui_automation_bridge_unittest.ts` 依赖 Perfetto `ui` 里的 `public/` 等模块，需在拷贝插件到 `ui/src/plugins/...` 之后，在 **`ui/`** 目录执行：

```bash
npm test
```

（即 `node build.js --run-unittests`。）

---

## 🔗 相关链接

- 上游 Perfetto：<https://github.com/google/perfetto>
- 本仓库仅托管 **插件源码与文档**，**不包含** Trace Processor、traced 等设备端组件。

---

## 📄 许可

根目录 **LICENSE** 为 Apache License 2.0（与 Perfetto 常用许可一致）。使用插件源码时请保留许可与版权声明。
