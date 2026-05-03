<div align="center">

<img src="grasp-social-v2.png" alt="Grasp — Code Architecture Suite" width="100%"/>

> [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [简体中文](README.zh.md)

<br/>
<br/>

<a href="https://github.com/ashfordeOU/grasp/actions/workflows/ci.yml" target="_blank"><img src="https://github.com/ashfordeOU/grasp/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank"><img src="https://img.shields.io/npm/v/grasp-mcp-server?label=MCP%20Server&color=00d4aa&style=flat-square&logo=npm" alt="npm"/></a>
<a href="LICENSE" target="_blank"><img src="https://img.shields.io/badge/license-ELv2-4d9fff?style=flat-square" alt="License"/></a>
<a href="https://ashfordeou.github.io/grasp" target="_blank"><img src="https://img.shields.io/badge/browser%20app-live-00d4aa?style=flat-square&logo=github" alt="GitHub Pages"/></a>

<br/>

**121 个 MCP 工具 + 8 个资源 + 2 个提示 · 35 种语言 · 11 个 AI 提供商 + 通过 OpenRouter 接入 200+ 模型 · 10 种图表视图 · 零数据收集**

<br/>

<a href="https://ashfordeou.github.io/grasp" target="_blank"><img src="https://img.shields.io/badge/▶%20Browser%20App-ashfordeou.github.io%2Fgrasp-0f2a2a?style=for-the-badge&color=0f2a2a&logoColor=00d4aa" alt="Browser App"/></a>
&nbsp;
<a href="https://github.com/ashfordeOU/grasp/releases/latest" target="_blank"><img src="https://img.shields.io/badge/VS%20Code-Install%20(.vsix)-007ACC?style=for-the-badge&logo=visual-studio-code" alt="VS Code"/></a>
&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank"><img src="https://img.shields.io/badge/MCP%20Server-npm-CB3837?style=for-the-badge&logo=npm" alt="MCP Server"/></a>
&nbsp;
<a href="https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer" target="_blank"><img src="https://img.shields.io/badge/JetBrains-Marketplace-000000?style=for-the-badge&logo=jetbrains" alt="JetBrains"/></a>
&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/grasp-code-architecture" target="_blank"><img src="https://img.shields.io/badge/Firefox-Add--ons-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" alt="Firefox Add-ons"/></a>
&nbsp;
<a href="https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj" target="_blank"><img src="https://img.shields.io/badge/Chrome-Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Web Store"/></a>
&nbsp;
<a href="https://github.com/ashfordeOU/grasp/releases" target="_blank"><img src="https://img.shields.io/badge/Safari-Sideload%20(macOS%2013%2B)-0D96F6?style=for-the-badge&logo=safari&logoColor=white" alt="Safari sideload"/></a>
&nbsp;
<a href="https://www.raycast.com/ashfordeOU/grasp" target="_blank"><img src="https://img.shields.io/badge/Raycast-Store-FF6363?style=for-the-badge&logo=raycast&logoColor=white" alt="Raycast Store"/></a>
&nbsp;
<a href="https://zed.dev/extensions?query=grasp" target="_blank"><img src="https://img.shields.io/badge/Zed-Extension-084CCF?style=for-the-badge&logoColor=white" alt="Zed Extension"/></a>

<br/>

<a href="https://ashfordeou.github.io/grasp" target="_blank">🌐 浏览器应用</a> &nbsp;·&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank">📦 MCP 服务器</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">🐛 报告 Bug</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">✨ 功能请求</a> &nbsp;·&nbsp;
<a href="https://ashfordeou.github.io/grasp/docs/privacy.html" target="_blank">🔒 隐私</a>

</div>

---

## 什么是 Grasp？

**Grasp** 可在几秒内将任何 GitHub 或 GitLab 仓库（云端或自托管）或本地代码库转换为交互式架构图。**121 个 MCP 工具**（外加 8 个 Resources 和 2 个引导式 Prompts）将完整的分析引擎暴露给 Claude Code、Cursor 以及任何兼容 MCP 的代理。

```
粘贴 URL / 打开文件夹  →  AST 分析引擎  →  架构图 + 121 个 MCP 工具
```

| | |
|---|---|
| **无需安装** | 100% 在浏览器中运行 — 两个 HTML 文件，无构建步骤 |
| **无数据收集** | 您的代码绝不会离开您的机器 |
| **无需账户** | 粘贴 URL 即可开始 |
| **离线可用** | 无需互联网即可分析本地文件夹 |
| **35 种语言** | JS/TS、Python、Go、Java、Rust、C/C++、C#、Ruby、Swift、Kotlin、Scala、Dart、Elixir、Erlang、Haskell、OCaml、F#、Clojure、Julia、Lua、R、Perl、Shell、PowerShell、Groovy、Zig、V、Nim、Crystal、VBA、Ada/SPARK、Vue、Svelte、PHP |
| **121 个 MCP 工具** | 依赖图、安全、**OSV.dev SCA 漏洞扫描**、DORA、brain store、Kuzu graph schema v3、社区检测、ORM 跟踪器、git 变更影响、架构漂移检测、测试覆盖率缺口图、组织仪表板、PR impact action、MCP Resources/Prompts、`grasp setup` 编辑器自动配置 |
| **11 个 AI 提供商** *(+ 通过路由器无限扩展)* | 直连：Anthropic Claude（3 个模型）、OpenAI（GPT-4o + o 系列）、Google Gemini（3 个）、Mistral（2 个）、Groq（3 个）、DeepSeek（chat + reasoner）、Ollama（本地）、LM Studio（本地）、自定义 OpenAI 兼容端点。路由器：OpenRouter（通过 slug 接入 200+ 模型）和 Together AI（50+ 开源模型）。**对话中可切换**，**默认完全关闭**（聊天面板关闭 = 零网络调用），**API 密钥仅存储在 `localStorage`** — Grasp 没有代理或遥测。 |
| **10 种图表视图** | Force graph、3D、arch、treemap、matrix、tree (dendrogram)、flow (sankey)、bundle、cluster (disjoint)、heatmap |
| **Grasp Brain** | SQLite + Kuzu 持久化存储 — 一次索引，立即查询。FTS5 + 384D 向量嵌入 + Cypher 图查询 |
| **供应链签名** | 每次发布均使用 SLSA Level 2 npm provenance + Cosign keyless Docker 签名 |

---

## 截图

### 🕸️ 依赖图 — 准确查看文件如何关联

<img src="docs/screenshots/graph.png" alt="Grasp dependency graph view" width="100%"/>

### 🏛️ 架构图 — 按层级查看代码库

<img src="docs/screenshots/arch.png" alt="Grasp architecture diagram view" width="100%"/>

### 📦 树形图 — 按代码行数显示文件大小

<img src="docs/screenshots/treemap.png" alt="Grasp treemap view" width="100%"/>

### 🏢 团队仪表板 — 一眼掌握所有仓库的健康状况

<img src="docs/screenshots/team-dashboard.png" alt="Grasp team dashboard" width="100%"/>

---

## 快速开始

### 选项 1 — 浏览器（零设置）

```bash
git clone https://github.com/ashfordeOU/grasp.git
open index.html           # 主应用
open team-dashboard.html  # 团队仪表板
```

无构建步骤。无需 `npm install`。**仅两个 HTML 文件。**

### 选项 2 — CLI

```bash
npm install -g grasp-mcp-server

grasp ./my-project        # 分析本地文件夹
grasp facebook/react      # 分析 GitHub 仓库
grasp .                   # 分析当前目录
grasp . --watch           # 实时模式 — 每次保存文件浏览器即重新加载
grasp . --timeline        # 时间穿梭 — 最近 30 次提交作为滑块
grasp . --report          # 仅终端报告 + JSON 输出
grasp . --format=sarif    # 为 GitHub Code Scanning 导出 SARIF
grasp . --pr-comment      # 将 GitHub PR 评论 markdown 输出到 stdout
grasp . --check           # 强制执行 grasp.yml 架构规则（CI 关卡）
```

### 选项 3 — IDE 扩展

| IDE | 安装 |
|-----|---------|
| **VS Code** | [Install (.vsix)](https://github.com/ashfordeOU/grasp/releases/latest) — 下载 `grasp-vscode-3.17.1.vsix` 并运行 **Extensions: Install from VSIX…**（`Cmd+Shift+P`） |
| **JetBrains** | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) — 在 Settings → Plugins 中搜索 **Grasp** |
| **Raycast** | [Raycast Store](https://www.raycast.com/ashfordeOU/grasp) — 或在 Raycast 扩展商店搜索 **Grasp** |
| **Zed** | [Zed Extensions](https://zed.dev/extensions?query=grasp) — 或在 Zed → Extensions 搜索 **grasp** |

### 选项 4 — 浏览器扩展

| 浏览器 | 安装 |
|---------|---------|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) — ID：`grasp@ashforde.org` |
| **Safari** | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) — 参见[侧载说明](#safari-sideload) |

每个 GitHub 和 GitLab 页面上都会出现一个浮动 **Grasp** 按钮。通过按需权限授予支持自托管 GitLab、GitHub Enterprise 和任何自定义主机。

---

### 分发渠道一览

每个标记的发布版本都会自动发布到所有渠道：

| 渠道 | 状态 | 链接 |
|---------|--------|------|
| **npm** (`grasp-mcp-server`) | [![npm](https://img.shields.io/npm/v/grasp-mcp-server?style=flat-square)](https://www.npmjs.com/package/grasp-mcp-server) | `npm install -g grasp-mcp-server` |
| **MCP Registry** | 已列出 | [modelcontextprotocol.io](https://mcpregistry.com) |
| **Docker** (`ghcr.io/ashfordeou/grasp`) | [![ghcr](https://img.shields.io/badge/ghcr.io-latest-blue?style=flat-square)](https://github.com/ashfordeOU/grasp/pkgs/container/grasp) | `docker pull ghcr.io/ashfordeou/grasp:latest` |
| **VS Code** | Releases 上的 `.vsix` | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest) |
| **JetBrains** | Marketplace | [Plugin ID 31362](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) |
| **Raycast** | Store（PR 已提交） | [raycast.com/ashfordeOU/grasp](https://www.raycast.com/ashfordeOU/grasp) |
| **Zed** | Extension（PR 已提交） | [zed.dev/extensions](https://zed.dev/extensions?query=grasp) |
| **Chrome** | Web Store | [CWS listing](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | AMO（已上架） | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) |
| **Safari** | 侧载（macOS 13+） | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitLab bot image** | `ghcr.io/ashfordeou/grasp-gitlab-bot` | 每次发布自动推送 |
| **GitLab tunnel agent** | Releases 上的二进制 | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitHub Release** | 已签名 + 校验和 | [Releases page](https://github.com/ashfordeOU/grasp/releases) |

### AI 工具集成 *(您的助手通过 MCP 或扩展调用 Grasp)*

| AI 工具 | 安装方法 | 备注 |
|---------|----------------|-------|
| **Claude Code** | `claude mcp add grasp -- npx -y grasp-mcp-server` | 原生 MCP — 全部 121 个工具 + 8 个 Resources + 2 个 Prompts |
| **Cursor** | 在 `~/.cursor/mcp.json` 中添加 `grasp-mcp-server` | 原生 MCP |
| **Cline / Roo Code / Kilo Code** | VS Code 设置中的 MCP 配置 | 原生 MCP |
| **Windsurf** | MCP 配置 | 原生 MCP |
| **Codex / OpenCode / Trae / Droid** | MCP 配置 | 原生 MCP — `grasp setup` 自动配置所有这些 |
| **Gemini CLI / Grok CLI** | MCP 配置 | 原生 MCP |
| **GitHub Copilot Chat** | 安装 `grasp-copilot-extension` | Copilot 通过 Copilot Extension API 调用 Grasp — 在聊天中使用 `@grasp` 提及 |
| **Continue** | `continue-provider` 包 | Grasp 作为 Continue context provider |
| **Amazon Q Developer** | `amazon-q-plugin` | Grasp 出现在 Q 的聊天中 |
| **GPT Actions / Custom GPTs** | `gpt-actions` 包 | Grasp 作为 REST 暴露给 OpenAI Actions schema |
| **Aider / Sweep / 任何工具** | 使用 `grasp-mcp-server` npm 包 | 工具无关的 stdio JSON-RPC |

<details>
<summary id="safari-sideload">🧭 Safari 侧载说明</summary>

```bash
curl -sL https://github.com/ashfordeOU/grasp/releases/latest/download/grasp-safari-extension.zip \
  -o /tmp/grasp-safari.zip \
  && unzip -q /tmp/grasp-safari.zip -d /tmp/grasp-safari \
  && mv /tmp/grasp-safari/Grasp.app /Applications/ \
  && open /Applications/Grasp.app
```

然后在 Safari 中：**设置 → 扩展 → 启用 Grasp**。如果未出现，请先启用 **Safari → 开发 → 允许未签名的扩展**。

</details>

---

## 工作原理

```
┌──────────────────────────────────────────────────────────────────┐
│  Input                                                            │
│  github.com/owner/repo  ·  gitlab.com/ns/proj  ·  ./local/path   │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  Analysis Pipeline  (mcp/src/)                                    │
│                                                                   │
│  1. scan        file enumeration + gitignore                      │
│  2. parse       tree-sitter AST · 35 languages · 16 native        │
│  3. routes      HTTP route detection (Express/FastAPI/Gin)        │
│  4. tools       MCP/gRPC tool definition detection                │
│  5. orm         ORM query tracking (Prisma/TypeORM/Sequelize/SA)  │
│  6. scope       3-tier call resolver  (0.95 → 0.90 → 0.50)       │
│  7. types       cross-file type propagation  (Kahn topo-sort)     │
│  8. coverage    test-file detection → TESTS/COVERS edges (v3)     │
│  9. communities Louvain community detection on import graph       │
│ 10. processes   BFS execution-flow tracing from entry points      │
└───────────┬──────────────────────────┬────────────────────────────┘
            │                          │
    ┌───────▼────────┐      ┌──────────▼──────────┐
    │  Browser App   │      │   MCP Server (CLI)   │
    │  index.html    │      │   grasp-mcp-server   │
    │                │      │                      │
    │  10 graph views│      │  130 tools           │
    │  16 color modes│      │  8 Resources         │
    │  AI Chat       │      │  2 guided Prompts    │
    │  Ask Grasp     │      │  Brain + Kuzu v3     │
    │  Coverage Ovly │      │  grasp setup (5 eds) │
    │  VULN tab      │      │  grasp vulns / drift │
    └────────────────┘      └──────────────────────┘
```

---

## 可视化

### 图表类型

| 视图 | 描述 |
|------|-------------|
| 🕸️ **Graph** | 力导向依赖图 — 拖动、缩放、多选 |
| 🔮 **3D Graph** | 三维力图 — 旋转、平移、缩放 |
| 🏛️ **Arch** | 逐层架构图 |
| 📦 **Treemap** | 按代码行数显示文件大小，按文件夹分组 |
| 📊 **Matrix** | 显示所有依赖关系的邻接矩阵 |
| 🌳 **Tree** | 分层聚类树状图 |
| 🌊 **Flow** | 文件夹级 Sankey 依赖流 |
| 🎯 **Bundle** | 基于弧线连接的环形布局 |
| 🔮 **Cluster** | 每个文件夹分离的力图 |

### 颜色模式

| 模式 | 显示内容 |
|------|---------------|
| 📁 **Folder** | 目录结构 |
| 🏗️ **Layer** | 架构层（UI、Services、Utils 等） |
| 🔥 **Churn** | 提交频率 — 红色 = 改动最多的热点 |
| ⚡ **Complexity** | 圈复杂度（绿色 → 黄色 → 红色） |
| 💥 **Blast** | 选定文件的 blast radius 影响 |
| 🌊 **Depth** | 最大花括号嵌套深度 |
| 🔎 **Dup** | 重复代码密度 — 红色 = 多个克隆 |
| 👤 **Owner** | 最高贡献者 — 发现 bus-factor 风险 |
| 🐛 **Issues** | 每个文件链接的 GitHub Issues |
| 🧪 **Coverage** | 测试覆盖率 — 高亮未测试文件 |
| 📦 **Bundle** | 包体积贡献 |
| 🌐 **API Surface** | 公开文件暴露 |
| ⚡ **Runtime** | 来自实时跟踪的实际调用频率 |
| 🔒 **Safety** | 安全门覆盖（绿色 = 已门控，红色 = 未门控） |
| 🧪 **Boundary** | 研究/生产边界漂移 |
| 🧪 **Eval Coverage** | 来自 eval/test 脚本的覆盖率 |

---

## 代码智能

### 📊 健康分数
基于死代码、循环依赖、耦合指标和安全问题的即时 **A–F 评级**。以分数（0–100）形式显示，带可视化条。

### 🔐 安全扫描器
自动检测硬编码的密钥和 API 密钥、SQL 注入风险、危险的 `eval()` 使用以及生产环境中遗留的调试语句。

### 🛡️ 依赖漏洞扫描器 *(v3.17.0)*
针对 [OSV.dev](https://osv.dev) 免费公开 CVE 数据库扫描每次分析中声明的依赖项。支持 `package.json`（含 `package-lock.json` 解析）、`requirements.txt`、`pyproject.toml`、`go.mod`、`Cargo.toml`（含 `Cargo.lock` 解析）和 `pom.xml`。按严重程度分类的结果，包含 CVSS 分数和修复版本建议。右侧面板新增 **VULN** 标签；新增 `grasp_vulnerabilities` MCP 工具；新增 `grasp vulns <path>` CLI，在严重/高发现时退出码为 1（CI 友好）。健康分数每个严重 –5，每个高 –3。**100% 客户端** — OSV 请求直接从浏览器到 OSV.dev，从不通过 Grasp 服务器。24 小时 localStorage 缓存；网络失败时静默降级。

### 🧩 模式检测
自动识别 Singleton、Factory、Observer/Event 模式、React hooks 和反模式（God Objects、高耦合）。

### 💥 Blast Radius 分析
*"如果我修改这个文件，会破坏什么？"* — 选择任何文件即可看到所有受影响的下游文件，在图上高亮显示。

### 🔥 活动热力图
按提交频率为文件着色。适用于 GitHub 仓库（通过 API）和**本地仓库**（通过 `git log` — 无需互联网）。

### 🔎 重复和相似性检测
**Dup** 颜色模式高亮显示具有完全或近似重复代码的文件。`grasp_similarity` MCP 工具返回排名重复簇，用于针对性重构。

### 👥 代码所有权
来自 git 历史的每个文件的最高贡献者，含行百分比细分。一键跳转到 GitHub Blame。

### 📋 PR 影响分析
粘贴 PR URL 即可查看它涉及哪些文件，并在合并前计算所提议变更的 blast radius。

### 💰 技术债务量化
使用可配置的估算将每个架构问题转换为开发人员小时 — 循环依赖 = 4 小时、god 文件 = 16 小时、严重安全 = 8 小时 — 带耦合乘数。在健康面板和团队仪表板中显示。

### 🔗 可分享嵌入
单击 `⋯ → 🔗 Embed` 获取即用即贴的 `<iframe>`、README 徽章、React 片段和直接链接 — 在文档、wiki 或仪表板中分享实时健康报告。

### 🎯 连接置信度评分 *(v3.16.0)*
每个跨文件连接均评分 0–1：显式静态导入 = 1.0、同文件夹 = 0.8、跨文件夹推断 = 0.6、低频 = 0.4。力图将置信度叠加为边不透明度 — 使用 ⚙ 设置中的滑块过滤低置信度边。

### 🔍 图查询模态框 *(v3.16.0)*
单击 🔍 工具栏按钮在浏览器内搜索文件、函数和边，无需离开图。匹配实时更新 — 单击任何文件结果即可跳转到图上。

### ƒ() 函数级画布 *(v3.16.0)*
切换 `ƒ()` 按钮将力图从文件级切换到函数级节点 — 查看单个函数调用关系，性能上限为 300 个节点。

### 🗄️ DB Coupling 标签 *(v3.16.0)*
右侧面板的 **🗄️ DB** 标签扫描文件内容以查找 ORM 模式（Django、TypeORM、原始 SQL），映射哪些文件引用哪些表。立即发现 god 表和高耦合文件。

### 🎯 Good First Issues 标签 *(v3.16.0)*
**🎯 GFI** 标签显示孤立的、低复杂度的、未测试的文件 — 是新工程师或 AI 编码代理的理想贡献目标。

### 🔐 PII 检测和安全子分类 *(v3.16.0)*
Security 标签现在有子分类胶囊 — **ALL / SECRETS / INJECTION / PII / EVAL** — 用于过滤发现。PII 胶囊扫描源文件中的电子邮件、电话、SSN、信用卡和 API 密钥模式。

### 📸 架构漂移检测 *(v3.17.0)*
快照您的代码库架构并检测随时间的漂移 — 自动进行。

```bash
grasp snapshot ./my-project --name before-refactor
# ... 进行修改 ...
grasp drift ./my-project          # 如果漂移为 CRITICAL 则退出 1（CI 友好）
```

| MCP 工具 | 描述 |
|----------|-------------|
| `grasp_snapshot` | 将当前健康分数、耦合指标、循环依赖和前 10 个热点保存为命名快照 |
| `grasp_diff_snapshots` | 比较任何两个快照 — 返回健康增量、新循环依赖、耦合增加 >20% 的文件、漂移级别（STABLE / DEGRADED / CRITICAL） |

快照存储在 `~/.grasp/brain.db` 中，跨分析会话持久化。

### 🧪 测试覆盖率缺口图 *(v3.17.0)*
找出最有可能导致生产事故的函数 — 调用次数最高，零测试覆盖。

```bash
grasp_coverage_gaps  # 通过 MCP — 返回按 call_count DESC 排序的 uncovered_functions
```

依赖图新增 **🧪 Coverage 覆盖层**切换 — 未覆盖函数显示为红色，部分覆盖为琥珀色，已覆盖为绿色。覆盖率通过静态分析估算：Grasp 检测测试文件（`*.test.*`、`*.spec.*`、`test_*`、`*_test.*`）并跟踪它们引用的源函数。

| MCP 工具 | 描述 |
|----------|-------------|
| `grasp_coverage_gaps` | 返回 `uncovered_functions`（按调用次数排序）、`risky_uncovered`（高 churn + 无测试）、按目录的 `coverage_by_module` 和 `overall_coverage_estimate` |

### 🏢 组织级仪表板 *(v3.17.0)*
一条命令分析整个 GitHub 组织：

```bash
grasp org my-github-org --token ghp_xxx --format html   # 自包含 HTML 仪表板
grasp org my-github-org --format json                   # CI 可消费的 JSON
grasp org my-github-org --format md                     # 用于 wiki 的 Markdown
```

跨所有仓库（最多 500 个，5 个并发）汇总健康等级、安全发现、变动最多的文件和语言分布。HTML 输出内联嵌入 Chart.js — 无外部依赖。

| MCP 工具 | 描述 |
|----------|-------------|
| `grasp_org_summary` | 分析组织中最多 20 个顶级仓库 — 返回汇总健康等级、等级分布、按严重程度的总安全发现、变动最多的文件、语言细分 |

### 🤖 PR Impact GitHub Action *(v3.17.0)*
为每个 pull request 添加自动架构影响分析：

```yaml
# .github/workflows/grasp-pr-impact.yml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-risk-to-comment: LOW      # LOW / MEDIUM / HIGH / CRITICAL
    fail-on-risk: CRITICAL        # 在此风险级别使 CI 检查失败
```

该操作发布一个结构化的 PR 评论，显示：
- 带颜色编码的**风险徽章**（LOW / MEDIUM / HIGH / CRITICAL）
- 带函数级 blast radius 的变更文件
- 受影响的执行流程（含步数）
- 来自 `git blame` 的建议审阅者（每个受影响文件的前 2 名贡献者）
- 测试覆盖率缺口：哪些变更函数没有测试文件涉及

---

## AI Chat — 15 个提供商

了解您整个代码库的内置 AI 助手。可以问 *"为什么 auth.ts 是热点？"*、*"哪些文件最适合重构？"* 或 *"解释这个调用链中的安全问题"* — 答案引用您的实时依赖图、安全发现和架构层。

| 提供商 | 模型 |
|----------|--------|
| **Anthropic** | Claude Opus 4.7、Sonnet 4.6、Haiku 4.5 |
| **OpenAI** | GPT-4o、GPT-4o mini、o3-mini、o1 |
| **Google Gemini** | Gemini 2.0 Flash、1.5 Pro、1.5 Flash |
| **Mistral** | Mistral Small、Mistral Large |
| **Groq** | Llama 3.3 70B、3.1 8B、Gemma 2 9B |
| **DeepSeek** | DeepSeek Chat、DeepSeek Reasoner |
| **OpenRouter** | 任何模型 slug（一个密钥可使用 100+ 模型） |
| **Together AI** | 任何模型 slug |
| **Ollama** | 本地模型（无需密钥） |
| **LM Studio** | 任何端口上的本地模型 |
| **Custom** | 任何 OpenAI 兼容的基础 URL |

**功能：**
- 多轮对话记忆 — 在 `localStorage` 中跨页面刷新持久化
- 选定文件上下文 — 选择文件时自动注入层、函数、复杂度和问题
- 丰富的代码库上下文 — 带元数据的前 80 个文件、所有问题、安全发现、循环依赖、层细分
- 带语法高亮代码块的 Markdown 渲染
- API 密钥仅在浏览器中保留，除选定的提供商外不会发送到任何地方

---

## Grasp Brain — 持久架构智能 *(v3.16.0)*

Grasp Brain 结合了两个协同工作的持久存储：

- **SQLite Brain** (`~/.grasp/brain.db`) — 文件元数据、耦合、安全和问题索引。包括对函数的 FTS5 全文索引和进程内 384D 向量嵌入存储（Xenova/all-MiniLM-L6-v2 — 无云依赖）。一次索引，立即查询。
- **Kuzu Graph DB** (`~/.grasp/graph/`) — 支持 Cypher 查询的原生图数据库。将完整的函数调用图、文件导入和类型关系存储为可遍历的属性图。

一次索引，然后立即查询 — 无需重新分析。每个函数都标记了它参与的执行流程（从入口点的 BFS），因此搜索结果包含一个 `processes[]` 字段，按流程对匹配进行分组。

### 工作原理

```
grasp index ./my-project    →  分析存储在 ~/.grasp/brain.db 中
grasp context src/api.ts    →  从存储的索引获取即时文件上下文
grasp diff ./my-project     →  比较当前状态与存储基线
grasp daemon ./my-project   →  监视变更，自动重新索引
```

### CLI 子命令

```bash
grasp index <path>           # 分析仓库并持久化到 brain
grasp context <src> <file>   # 获取任何文件的丰富上下文
grasp setup [path]           # 在 Claude Code / Cursor / Windsurf 中安装钩子
grasp diff <path>            # 比较 brain 基线与当前分析
grasp daemon <path>          # 监视目录并在变更时自动重新索引
grasp drift [path]           # 快照 + 与上次快照的差异；CRITICAL 时退出 1
grasp org <github-org>       # 组织级仪表板（--format json|html|md --token ghp_xxx）
```

### Ask Grasp — 自然语言架构查询

浏览器应用（Ask Grasp 面板）和 `grasp_ask` MCP 工具均支持关于您代码库的纯英文问题。`grasp_ask` 直接识别结构化意图；对于开放式查询，它回退到**混合语义搜索** — BM25 全文 + 通过 Reciprocal Rank Fusion 合并的 384D 向量嵌入。

对于不带问答层的纯语义搜索，直接使用 `grasp_search` — 结果包含一个 `processes[]` 字段，显示每个匹配属于哪个执行流程。

| 问题 | 您将获得什么 |
|----------|--------------|
| *"最复杂的文件是什么？"* | 按圈复杂度排名的文件 |
| *"显示耦合热点"* | 具有最高综合 fan-in + fan-out 的文件 |
| *"有任何安全问题吗？"* | 代码库中的所有安全发现 |
| *"auth.ts 的 blast radius 是什么？"* | 完整的传递影响列表 |
| *"哪个层处理数据访问？"* | 带文件示例的层细分 |
| *"总体等级是什么？"* | 健康分数、等级、问题摘要 |
| *"哪些文件 churn 最多？"* | 提交频率排名 |
| *"是否有循环依赖？"* | 带严重程度的循环列表 |

### Registry — 所有已索引仓库

`grasp_registry_list` 和 `grasp_registry_status` 公开完整的 Brain 索引：

```bash
# 通过 MCP
grasp_registry_list          # 所有仓库：健康等级、文件、函数、活动会话
grasp_registry_status        # 汇总：索引数、会话数、等级分布

# 通过 HTTP（当 MCP 服务器以 --http 运行时）
curl http://localhost:7332/api/v1/registry
```

团队仪表板的 **🗂️ Registry 面板**在加载时自动获取此信息 — 无需 session_id。

### Arch Diff

`grasp diff`（和 `grasp_arch_diff` MCP 工具）将当前代码库与存储的 brain 基线进行比较，并显示：
- 等级降级（变差的文件：A→B、B→C 等）
- 健康分数增量
- 自基线以来引入的新安全问题

### 编辑器钩子 (`grasp setup`)

检测您仓库中的 `.claude/`、`.cursor/`、`.windsurf/`，并安装一个 pre-tool-use 钩子，在每次操作之前自动为您的 AI 编码助手提供代码库上下文。还编写带有架构摘要的 `CLAUDE.md` 和 `AGENTS.md`。

---

## 团队和协作

### 🏢 团队仪表板

在一个视图中跟踪多个仓库的健康状况。添加任何公开（或带令牌的私有）GitHub 仓库即可看到：

- 健康分数、等级、文件、问题、循环依赖、安全发现、架构层
- **Pattern count、Env var issues、Feature flag count** — 新的 v3.13.0 列
- **DORA 指标小卡片** — 每个仓库的 Deploy Frequency、Lead Time、Change Fail Rate、MTTR（可展开行）
- **🗂️ Registry 面板** — 所有 Brain 索引仓库，带实时健康等级和会话状态
- 提交活动（7d / 30d）和 CI 状态（✅/❌/⏳）
- 提交速度迷你图、以开发人员-天计算的技术债务
- 将整个表格导出为 **CSV 或 JSON**。使用 📁 Open Folder（File System Access API）打开本地文件夹。

### 🔄 实时团队协作

Grasp 的 CLI 为整个团队托管实时协作服务器：

```bash
npx grasp --host=0.0.0.0 --room-secrets=backend:pass1,frontend:pass2
#   → main app:       http://server-ip:7331/
#   → team dashboard: http://server-ip:7331/dashboard
#   → health check:   http://server-ip:7331/api/health
```

- **WebSocket 同步** — 工作区变更立即传播到所有连接的团队成员
- **命名房间** — `?sync_room=backend-team` 隔离每个团队的工作区
- **存在指示器** — 在 Sync 面板中查看谁在线
- **共享链接** — ⎘ Copy team link 或 👁 Copy read-only link
- **只读模式** — 观察者使用 `?readonly=1`
- **密码保护** — `--room-secrets=room:password`
- **REST API** — `GET /api/health` · `GET /api/rooms` · `GET/PUT /api/workspace/:room`

> **LAN 托管：** 同一网络上的任何人都可以访问 `http://server-ip:7331/dashboard` — 无需云。

### 🏢 Monorepo 和工作区支持

Grasp 自动检测 monorepo 中的子包（`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`pom.xml`）。**Workspace** 侧栏让您过滤到单个包 — 所有图表、树形图和指标即时更新。

### ⏮️ 时间穿梭架构滑块

运行 `grasp . --timeline` 将最近 30 个 git 提交加载为滑块面板。将滑块拖到任何提交 — 变更的节点在图上呈黄色发光，让您观察架构随时间的演变。

### 📡 实时监视模式

运行 `grasp . --watch` 启动带实时 SSE 同步的本地开发服务器。每次保存文件时浏览器图自动重新加载 — 连接时显示 `LIVE` 徽章。

---

## 行业垂直

### ✈️ 航空航天 / 安全关键

| 功能 | 描述 |
|---------|-------------|
| **需求可追溯性** | 上传需求 CSV — Grasp 扫描 `@REQ-NNN` 标签并显示覆盖率 %、缺失和未指定文件。一键合规矩阵导出。 |
| **MISRA / 安全模式** | `⋯ → 🔧 Safety Mode` — 检测 MISRA C/C++ 和 Ada 违规：init 后动态分配、递归调用、`goto`、`abort()`/`exit()`。 |
| **DO-178C / ECSS 认证导出** | 一键认证证据包：清单、可追溯性矩阵、复杂度、MISRA 违规、安全发现 — JSON 和可打印 HTML。 |
| **异常调查** | 选择文件 → 🔍 Anomaly Investigation — 调用方、被调用方、传递 blast radius、最近提交、调用路径中的安全、纯英语摘要。 |
| **软件复用评估** | Interface Compatibility、Dependencies、Safety Level、Architecture Fitness、Security、Complexity 的红绿灯矩阵。 |
| **跨语言调用图** | Ada→C `pragma Import`、Python `ctypes`/`cffi`、JS→WASM 边界。 |
| **遗产软件谱系** | 叠加起源任务清单，识别零增量认证捷径。 |
| **ICD 映射器** | 将 Interface Control Document 条目与导出函数匹配，标记未实现的接口。 |
| **ECSS-E-ST-40C 合规性** | 检查 DI-01、DI-04、DI-07、DI-10、DI-15 合规要求。 |

### 🧠 AI 研究

| 功能 | 描述 |
|---------|-------------|
| **安全约束跟踪器** | 标记安全门（过滤器、清理器） — 跟踪每个 entry→output 路径并标记任何绕过所有门的路径。新的 **Safety** 颜色模式。 |
| **研究/生产边界** | 定义研究与生产文件夹 — 标记从研究代码导入的生产文件。 |
| **Jupyter Notebook 支持** | 依赖图中的 `.ipynb` — 提取代码单元格、解析导入、标记可重现性问题。 |
| **训练运行差异** | 上传两个 YAML/JSON 配置 — 差异化超参数并查找哪些文件读取每个变更键。 |
| **Eval 覆盖图** | 自动检测 eval 脚本并跟踪它们运行的 model/training 代码。没有 eval 覆盖的安全门标记为严重。 |
| **ML 流水线 DAG** | 检测 PyTorch、TensorFlow、JAX、HuggingFace 模式 — 渲染 Data→Model→Training→Eval→Checkpoint DAG。 |

### 🏢 企业

| 功能 | 描述 |
|---------|-------------|
| **SBOM 生成** | npm、pip、Cargo、Go modules 的 CycloneDX 1.4 或 SPDX 2.3 JSON。通过 OSV API 的可选 CVE 增强。 |
| **DORA 指标** | 来自 GitHub Actions 的 Deployment Frequency、Lead Time、Change Failure Rate、MTTR。Elite/High/Medium/Low 分类。 |
| **AI 驱动的 ADR 生成** | 使用代码库上下文 + 可选 PR 差异的一键 MADR 格式 Architecture Decision Records。 |
| **PII 数据流跟踪器** | 从用户标记的 PII 源文件的 BFS — 显示所有下游消费者。 |
| **职责分离** | 检测同时启动和批准事务的文件（SOX/FDA 合规性）。 |
| **法规变更影响** | GDPR/HIPAA/SOX/PCI-DSS 条款变更的关键字到 blast radius。 |
| **金融 / 交易** | 延迟热点检测 — 阻塞 I/O、GC 压力、锁争用、循环中的分配。 |
| **金融模型风险** | 硬编码参数、缺失 NaN 检查、无零保护的除法。 |

---

## 给 AI 代理 — MCP 服务器

Grasp 提供一个 **Model Context Protocol (MCP) 服务器**，将整个分析引擎暴露为 Claude Code、Cursor 和任何兼容 MCP 的代理可调用的工具。

### 设置

```bash
# 安装
npm install -g grasp-mcp-server

# 或不安装即可运行
npx grasp-mcp-server
```

添加到 `~/.claude/claude_mcp_settings.json`：

```json
{
  "mcpServers": {
    "grasp": {
      "command": "npx",
      "args": ["-y", "grasp-mcp-server"]
    }
  }
}
```

适用于 GitHub 仓库和本地目录。GitLab、Docker 和自托管选项请参阅 [`mcp/README.md`](mcp/README.md)。

### 工具参考

**Core Analysis**

| 工具 | 功能 |
|------|-------------|
| `grasp_analyze` | 任何仓库或本地路径的完整分析 — 返回用于后续查询的 `session_id` |
| `grasp_sessions` | 列出活动会话（持久化 7 天，存活重启） |
| `grasp_diff` | 比较两个快照 — 分析之间发生了什么变化？ |
| `grasp_watch` | 重新分析目录并与之前的运行进行差异比较 |
| `grasp_rules_check` | 运行 `grasp.yml` 架构规则并报告违规 |
| `grasp_config_check` | 针对架构规则验证会话 — 返回违规 |

**File & Code Intelligence**

| 工具 | 功能 |
|------|-------------|
| `grasp_file_deps` | 这个文件依赖什么？ |
| `grasp_dependents` | 如果我修改这个文件，会破坏什么？ |
| `grasp_cycles` | 是否存在循环依赖？ |
| `grasp_architecture` | 这个代码库有哪些层？ |
| `grasp_hotspots` | 哪些文件触碰起来最有风险？ |
| `grasp_metrics` | 每个文件的行数、复杂度、fan-in/fan-out |
| `grasp_find_path` | 文件 A 如何连接到文件 B？ |
| `grasp_patterns` | 使用了哪些设计模式？ |
| `grasp_unused` | 死代码 — 已定义但从未调用 |
| `grasp_explain` | 任何文件或函数的纯英语解释 |
| `grasp_refactor` | 文件或会话的逐步重构计划 |
| `grasp_suggest` | 按效果与工作量比排名的重构建议 |
| `grasp_onboard` | 进入代码库区域的新工程师的有序阅读路径 |
| `grasp_types` | 类型注解覆盖率 — 优先考虑缺少类型的高 fan-in 文件 |
| `grasp_similarity` | 排名重复簇和代码克隆组 |
| `grasp_stale` | 活跃但被遗弃的文件 — 低 churn、高 fan-in、无测试对应 |
| `grasp_change_risk` | 变更文件集的风险分数 0–100 |

**Security & Compliance**

| 工具 | 功能 |
|------|-------------|
| `grasp_security` | 硬编码密钥、注入风险、危险模式 |
| `grasp_sbom` | CycloneDX 1.4 或 SPDX 2.3 JSON 中的 SBOM |
| `grasp_sarif` | 用于 GitHub Code Scanning 的 SARIF 2.1.0 导出 |
| `grasp_license` | 依赖许可证 — 标记 copyleft 和未知 |
| `grasp_pii_trace` | 从 PII 源文件到所有消费者的 BFS 跟踪 |
| `grasp_duties` | 职责分离 — 同时启动和批准的文件 |
| `grasp_reg_impact` | 法规变更 blast radius（GDPR/HIPAA/SOX/PCI-DSS） |
| `grasp_env_vars` | 所有 env var 读取 — 标记未文档化和仅测试变量 |
| `grasp_feature_flags` | 所有 feature flag 读取（LaunchDarkly、GrowthBook、env-var 标志） |

**Team & DevOps**

| 工具 | 功能 |
|------|-------------|
| `grasp_pr_comment` | 为变更文件生成带 blast radius 的 PR 健康评论 |
| `grasp_pr_review` | 在高严重性行的 GitHub PR 上发布内联审查评论 |
| `grasp_commits` | 最近 7d 和 30d 的提交计数 |
| `grasp_ci_status` | 最新的 GitHub Actions 运行 — 通过/失败/进行中 |
| `grasp_dora` | DORA 指标 — Deployment Frequency、Lead Time、CFR、MTTR |
| `grasp_adr` | AI 驱动的 MADR 格式 Architecture Decision Record |
| `grasp_embed` | 生成用于共享的 iframe、README 徽章、React 片段 |
| `grasp_timeline` | 最后 N 个提交，含每个提交的变更文件 + co-change 矩阵 |
| `grasp_contributors` | 每个文件的所有权、bus-factor、最高贡献者 |
| `grasp_coverage` | 测试覆盖率叠加 — 哪些文件缺少测试？ |
| `grasp_issues` | 将 GitHub Issues 映射到它们提及的文件 |
| `grasp_jira_issues` | 通过项目密钥将 Jira 问题映射到源文件 |
| `grasp_service_graph` | 来自 OTEL / 自定义跟踪 JSON 的服务级依赖图 |
| `grasp_deps_dev` | 通过 deps.dev 的生态系统依赖项 — 有多少包依赖此仓库 |

**Brain / Intelligence** *(v3.16.0)*

| 工具 | 功能 |
|------|-------------|
| `grasp_brain_index` | 分析仓库并持久化到本地 SQLite brain |
| `grasp_brain_status` | brain 中索引了什么以及何时？ |
| `grasp_context` | 丰富的文件上下文 — 层、复杂度、耦合、安全、依赖项、依赖 |
| `grasp_arch_diff` | 比较当前状态与 brain 基线 — 检测降级 |
| `grasp_ask` | 用自然语言询问您的架构 |

**Graph Core** *(Kuzu — v3.16.0)*

| 工具 | 功能 |
|------|-------------|
| `graph_query` | 对持久函数/文件调用图运行只读 Cypher 查询 |
| `call_chain` | 跟踪任何函数的调用方和被调用方链，可配置深度 |
| `type_propagation` | 查找共享返回类型的所有函数及其调用邻居 |
| `function_graph` | 渲染以任何命名函数为中心的 Mermaid / DOT / JSON 子图 |

**Advanced Analysis**

| 工具 | 功能 |
|------|-------------|
| `grasp_dead_packages` | 在 `package.json` 中但从未导入的 npm 依赖 |
| `grasp_runtime_calls` | 将实时运行时跟踪与静态边合并 — 实际热路径 |
| `grasp_db_coupling` | ORM/SQL 到表的耦合图 — god 表、高耦合文件 |
| `grasp_migration_plan` | 用于替换包/模块的拓扑排序分阶段计划 |
| `grasp_api_surface` | 来自 OpenAPI、GraphQL、Express/FastAPI 路由的统一 API 表面 |
| `grasp_events` | 事件发射器和订阅者 — 孤立 emit、幽灵订阅 |
| `grasp_perf` | N+1 查询、同步 I/O、循环中的 JSON 序列化 |
| `grasp_bundle` | 包大小树形图 — 按大小类别的最大文件 |
| `grasp_dep_impact` | 升级依赖项对所有文件的影响 |
| `grasp_cross_repo` | 比较两个会话 — 共享文件、分歧函数 |
| `grasp_diagram` | 从依赖图生成 Mermaid 流程图或 C4 图 |

**Aerospace / Safety-Critical Vertical**

| 工具 | 功能 |
|------|-------------|
| `grasp_req_trace` | 需求可追溯性 — 针对 CSV 扫描 `@REQ-NNN` 标签 |
| `grasp_anomaly` | 异常调查 — BFS blast radius、调用链中的安全、纯英语摘要 |
| `grasp_reuse` | 软件复用评估 — 红/琥珀/绿兼容性矩阵 |
| `grasp_safety_trace` | 安全约束跟踪器 — 查找绕过所有安全门的路径 |
| `grasp_multilang` | 跨语言调用图（Ada→C、Python→C、JS→WASM） |
| `grasp_heritage` | 遗产软件谱系 — 零增量认证捷径 |
| `grasp_icd` | ICD 映射器 — 将 Interface Control Document 条目与代码匹配 |
| `grasp_ecss` | ECSS-E-ST-40C 合规性检查器（DI-01、DI-04、DI-07、DI-10、DI-15） |

**AI Research Vertical**

| 工具 | 功能 |
|------|-------------|
| `grasp_run_diff` | 训练运行差异 — 变更的超参数和受影响的代码 |
| `grasp_eval_coverage` | eval 覆盖图 — 没有 eval 覆盖的安全门标记为严重 |

**Multi-Repo / Platform**

| 工具 | 功能 |
|------|-------------|
| `grasp_org_graph` | 带跨仓库边的组织级多仓库依赖图 |
| `grasp_api_diff` | 破坏性 API 变更检测器 — 已删除/变更的导出符号 |
| `grasp_plugins` | 扩展点图 — 插件接口、钩子点、策略模式 |
| `grasp_semver` | 语义版本控制强制 — 验证变更集的 semver 升级 |
| `grasp_abi_diff` | ABI/API 稳定性检查器 — 稳定性分数 0–100 |
| `grasp_subsystems` | 内核/OS 子系统边界图 |
| `grasp_kconfig` | Kconfig/构建时条件分析 — CONFIG_* 使用图 |
| `grasp_irq` | IRQ/中断依赖图 — 处理程序中的阻塞调用、分配 |
| `grasp_patch_impact` | 补丁系列影响分析器 — 按 blast radius + 复杂度对补丁排名 |
| `grasp_good_first_issues` | Good first issue 生成器 — 孤立、低复杂度、未测试文件 |
| `grasp_api_stability` | 两个会话之间的 API 稳定性分数（0–100） |
| `grasp_fork_diff` | Fork 分歧分析 — 分歧/相同/仅 fork 文件 |
| `grasp_latency` | 金融/交易延迟热点检测 |
| `grasp_model_risk` | 金融模型风险审计 |

**Code Intelligence *(v3.16.0)***

| 工具 | 功能 |
|------|-------------|
| `grasp_diff_symbols` | 将 `git diff` 块映射到函数 — 合并前 PR 的 blast radius |
| `grasp_exec_flow` | 从任何入口点的 BFS 执行流，带 STEP_IN_PROCESS 边 + Mermaid 图表 |
| `grasp_skillmd` | 从分析会话自动生成 `SKILL.md` / `CLAUDE.md` 片段 |
| `grasp_hooks` | 生成 `.claude/settings.json` PostToolUse 钩子 + `.cursor/rules/grasp.mdc` |
| `grasp_mro` | 方法解析顺序 — C3 线性化（Python）、Ruby/Java 层次结构的 MRO |
| `grasp_communities` | Leiden/Louvain 社区检测 — 识别有界上下文和微服务候选 |
| `grasp_contracts` | 多仓库合同分析 — 提供者导出与消费者使用、违规 + 覆盖率 % |

**Analysis Intelligence *(v3.16.0)***

| 工具 | 功能 |
|------|-------------|
| `grasp_confidence` | 将每个跨文件连接评分 0–1（显式 import=1.0、同文件夹=0.8、跨文件夹=0.6、低频=0.4） |
| `grasp_wiki` | 自动生成 markdown wiki：index.md + 每个文件夹页面 + 按调用方计数排序的 api.md |
| `grasp_registry_list` | 列出所有 Brain 索引仓库，含健康等级、文件/函数计数和活动会话 ID |
| `grasp_registry_status` | Registry 健康状况：索引计数、会话计数、等级分布 |
| `grasp_resolve_receiver` | 解析每个类方法的具体类 — `self`/`this` 在 Python、JS、Java、Ruby 中指代什么 |

**Semantic Search, Rename & Routes *(v3.16.0)***

| 工具 | 功能 |
|------|-------------|
| `grasp_search` | 混合语义搜索 — BM25 FTS5 + 通过 Reciprocal Rank Fusion 合并的 384D 向量嵌入（Xenova/all-MiniLM-L6-v2）。结果包含按执行流分组的 `processes[]`。支持跨多个仓库的 `@groupName` fan-out |
| `grasp_rename` | 图感知的全代码库符号重命名，使用 brain store 边查找每个引用。`apply: false`（默认）返回 dry-run 差异；`apply: true` 将变更写入磁盘 |
| `grasp_route_map` | 扫描 HTTP 路由定义（Express/Fastify/Hono、FastAPI/Flask、Gin） — 将每个路由映射到带文件位置的处理函数 |
| `grasp_api_impact` | 给定路由或处理程序名称，使用 brain 图边返回所有调用方、下游服务和 blast radius |
| `grasp_tool_map` | 扫描 MCP 工具定义（`server.tool` / `server.registerTool`）和 gRPC 服务定义 — 返回服务合同图 |
| `grasp_shape_check` | 对于任何函数，从 brain 索引跟踪所有调用站点的参数类型和返回类型；标记调用站点不匹配 |
| `grasp_group_add` | 将仓库源添加到 `~/.grasp/groups.json` 中的命名组，用于多仓库 `@groupName` fan-out |
| `grasp_group_list` | 列出 `~/.grasp/groups.json` 中所有命名组及其成员仓库 |

**Graph Intelligence *(v3.16.0)***

| 工具 | 描述 |
|---|---|
| `grasp_graph_schema` | Kuzu schema v2 内省 — 节点/边表定义（Class、Interface、Method、Constructor + 10 种边类型）以及实时行计数 |
| `grasp_type_propagation` | 通过对导入图进行 Kahn 拓扑排序的跨文件类型推断；返回置信度 0–1 的顶部推断类型 |
| `grasp_orm_map` | ORM 查询跟踪器 — Prisma、TypeORM、Sequelize、SQLAlchemy；按模型分组的结果含调用站点、操作、频率 |
| `grasp_detect_changes` | Git diff → 符号影响：变更文件、受影响的函数、受影响的流程流、风险级别 `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` |
| `grasp_generate_agents_md` | 从 brain 会话生成丰富的 AGENTS.md — 功能社区、执行流程、健康等级、顶部问题 |
| `grasp_generate_skills` | 每个社区的 `.claude/skills/generated/<community>.md` 文件 — 关键文件、入口点、跨区域依赖 |

**MCP Resources *(v3.16.0)*** — 8 个用于直接资源访问的实时 `grasp://` URI：`grasp://repos` · `grasp://setup` · `grasp://repo/{id}/context` · `grasp://repo/{id}/clusters` · `grasp://repo/{id}/processes` · `grasp://repo/{id}/schema` · `grasp://repo/{id}/cluster/{name}` · `grasp://repo/{id}/process/{name}`

**MCP Prompts *(v3.16.0)*** — `detect_impact`（变更 → 符号 → 流程 → 风险 → 测试范围） · `generate_map`（仓库 → 分析 → 图 → 社区 → wiki）

---

## CI/CD 集成

### GitHub Actions — 自动 PR 评论

```yaml
# .github/workflows/grasp.yml
name: Grasp Health Check
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  health:
    uses: ashfordeOU/grasp/.github/workflows/grasp-health.yml@main
```

工作流在每个 PR 上发布并更新评论：

| 指标 | 值 |
|--------|-------|
| **Health Score** | `████████░░` **82/100** |
| **Grade** | 🟢 **A** |
| **Files** | 142 (891 functions) |
| **Architecture Issues** | 3 |
| **Circular Deps** | 0 ✓ |
| **Security** | 0 ✓ |
| **Changed Files** | 此 PR 中的 5 个代码文件 |

### 架构规则 (`grasp.yml`)

```yaml
rules:
  - min_health_score: 70       # 如果分数低于 70 则 CI 失败
  - max_blast_radius: 20       # 标记任何影响 20+ 个其他文件的文件
```

使用 `grasp . --check` 在本地运行，或使用 [GitHub Actions 模板](docs/examples/grasp-check.yml)。

### 基于 CLI 的 CI 关卡

```bash
grasp . --report   # 写入 grasp-report.json，exit 0 = 通过，exit 1 = 失败
```

```yaml
- name: Grasp health gate
  run: |
    PASSED=$(cat grasp-report.json | jq '.ci.passed')
    SCORE=$(cat grasp-report.json | jq '.ci.score')
    echo "Health score: $SCORE"
    if [ "$PASSED" != "true" ]; then
      cat grasp-report.json | jq '.ci.failures'
      exit 1
    fi
```

完整导出架构请参见 [docs/api-schema.md](docs/api-schema.md)。

### SARIF 上传 (GitHub Code Scanning)

```bash
grasp . --format=sarif   # 写入 grasp-results.sarif
```

```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: grasp-results.sarif
```

---

## 高级功能

### ⚡ 命令面板
`Cmd+K` (Mac) / `Ctrl+K` (Windows) — 搜索文件、跳转到函数、导航到问题。选择结果会将图平移到该节点。

### 🔍 路径查找器
在详情面板中选择两个文件以查找它们之间最短的依赖链。

### 🏛️ 架构规则引擎
定义自定义 `FORBIDDEN` 依赖规则（例如 `utils → services` 是 FORBIDDEN）。违规被标记为问题并跨会话持久化。

### 📅 历史和快照
每次分析都自动保存。单击右侧面板中的 **HISTORY** 即可使用 D3 迷你图和范围滑块比较随时间变化的健康分数。

### 🚫 自定义忽略模式
`⋯ → 🚫 Ignore Patterns` — 添加目录排除（例如 `generated/`、`__mocks__/`）。跨会话持久化。无法删除内置默认值（`node_modules`、`dist`、`.git`）。

### 📤 导出报告
JSON、Markdown、Plain Text、SVG、SARIF 2.1.0。完整架构在 [docs/api-schema.md](docs/api-schema.md) 中。

### 🤖 AI 编码工具支持
Grasp 通过 MCP 与所有主要 AI 编码工具配合使用：**Claude Code、Cursor、Cline、Roo Code、Kilo Code、OpenCode、Trae、Grok CLI、Codex CLI、Droid**

每个工具的设置指南请参见 [`ai-tools/`](./ai-tools/)。

### 🔖 健康徽章

```markdown
![Grasp Health](https://grasp.ashforde.org/badge/owner/repo.svg)
```

### PR 中的 @grasp-bot
在任何 PR 上评论 `@grasp-bot analyze` — Grasp 会内联发布完整的健康报告。

---

## VS Code 扩展

> **安装：** 从 [GitHub Releases](https://github.com/ashfordeOU/getgrasp) 下载 `grasp-vscode-3.17.1.vsix`，然后在 VS Code 中运行 **Extensions: Install from VSIX…** (`Cmd+Shift+P`)。

- 启动时自动分析工作区，文件保存时重新分析（2 秒去抖）
- 状态栏显示活动文件的 `↑ N deps  ↓ M dependents`
- 在每次编辑器切换时平移到活动文件
- 在 **Problems 面板**（波浪线）中显示安全问题和 arch 违规
- 面板标题中的 4 个颜色模式按钮：Layer / Folder / Churn / Complexity
- 面板标题中的健康分数徽章
- 双击任何节点以在编辑器中打开文件
- 右键单击任何文件 → **Grasp: Analyze File** 即可获得即时详细信息
- 有向链接：蓝色 = 传出导入，绿色 = 传入依赖项
- 丰富的工具提示：复杂度、churn 计数、每个文件的最高贡献者

---

## 键盘快捷键

| 键 | 操作 |
|-----|--------|
| `Enter` | 分析仓库 |
| `Cmd+K` / `Ctrl+K` | 打开命令面板 |
| `+` / `-` | 放大/缩小 |
| `Shift+单击` | 多选节点 |
| `Escape` | 关闭模态框 / 命令面板 |
| `T` | 循环主题 |
| `?` | 打开帮助模态框 |

---

## 19 个主题

带悬停选择器和单击循环的完整主题系统：

**Dark** · **Light** · **Matrix** · **Amber Terminal** · **Dracula** · **Nord** · **Tokyo Night** · **Catppuccin** · **Gruvbox** · **Obsidian Gold** · **Midnight Diamond** · **Carbon** · **Noir** · **Synthwave** · **Ocean Depth** · **Forest** · **Sunset** · **High Contrast** · **Solarized Light**

主题选择跨会话持久化并在 Grasp 和 Team Dashboard 之间共享。

---

## 支持的语言

JavaScript · TypeScript · Python · Go · Java · Rust · C · C++ · C# · Ruby · PHP · Swift · Kotlin · Scala · Vue · Svelte · Dart · Elixir · Erlang · Haskell · Lua · R · Julia · Perl · Shell · PowerShell · F# · OCaml · Clojure · Elm · VBA · Groovy · Ada · Zig

---

## GitHub API 速率限制

| 认证 | 请求/小时 |
|------|--------------|
| 无令牌 | 60 |
| Personal Access Token | 5,000 |
| GitHub App | 每次安装 5,000 |

---

## 架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Analysis Engine  (mcp/src/)                    │
│                                                                         │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐   │
│  │  AST Parser          │   │  Analyzer + Pipeline                 │   │
│  │  tree-sitter WASM    │   │  · Dependency extraction             │   │
│  │  35 languages        │   │  · Cyclomatic complexity             │   │
│  │  native bindings     │   │  · Layer classification              │   │
│  └──────────────────────┘   │  · Security pattern detection        │   │
│                              │  · Dead code & duplicate analysis    │   │
│  ┌──────────────────────┐   │  · Scope resolver (3-tier, 0.95→0.50)│   │
│  │  Source Adapters     │   │  · Type propagator (Kahn topo-sort)  │   │
│  │  GitHub  · GitLab    │   │  · ORM tracker (Prisma/TypeORM/SA)   │   │
│  │  Azure   · Bitbucket │   └──────────────────────────────────────┘   │
│  │  Gitea   · Local FS  │                                               │
│  └──────────────────────┘   ┌──────────────────────────────────────┐   │
│                              │  Brain Store  (~/.grasp/brain.db)    │   │
│                              │  SQLite · repos / files / edges      │   │
│                              │  FTS5 full-text · 384D vectors       │   │
│                              │  Execution process tags (BFS)        │   │
│                              └──────────────────────────────────────┘   │
│                              ┌──────────────────────────────────────┐   │
│                              │  Graph Store  (~/.grasp/graph/)      │   │
│                              │  Kuzu  —  Schema v2                  │   │
│                              │  Nodes: File · Function · Class      │   │
│                              │         Interface · Method           │   │
│                              │         Constructor                  │   │
│                              │  Edges: CALLS(conf) · IMPORTS        │   │
│                              │         EXTENDS · IMPLEMENTS         │   │
│                              │         HAS_METHOD · OVERRIDES       │   │
│                              │         QUERIES · STEP_IN_PROCESS    │   │
│                              │  Read-only Cypher via graph_query    │   │
│                              └──────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐  ┌───────────────────────┐  ┌──────────────────────┐
│    Browser Apps     │  │   MCP Server + CLI    │  │   IDE Extensions     │
│                     │  │   (grasp-mcp-server)  │  │                      │
│  index.html         │  │                       │  │  VS Code             │
│  · React + D3       │  │  130 tools            │  │  JetBrains           │
│  · 10 graph views   │  │  8 MCP Resources      │  │  Zed                 │
│  · AI Chat (11 prov)│  │  2 guided Prompts     │  │  Neovim · Vim        │
│  · Confidence overlay│  │  Brain (SQLite+Kuzu)  │  │  Emacs               │
│  · Graph query modal│  │  Hybrid search        │  │  Eclipse · Continue  │
│  · Fn-level canvas  │  │  ORM map · Change risk│  │                      │
│  · DB coupling tab  │  │  Route/API map        │  │  Browser Extensions  │
│  · PII detection    │  │  @group fan-out       │  │  Chrome · Firefox    │
│  · 19 themes        │  │  Arch diff · Hooks    │  │  Safari              │
│                     │  │  grasp setup          │  │                      │
│  team-dashboard.html│  │  (Claude/Cursor/      │  │  Setup auto-config   │
│  · Multi-repo health│  │   Windsurf/Codex/     │  │  grasp setup [path]  │
│  · DORA + sparklines│  │   OpenCode)           │  │  writes mcp.json +   │
│  · Patterns/Env/Flags│  │  --watch --timeline  │  │  hooks for all       │
│  · Registry panel   │  │  --format=sarif       │  │  detected editors    │
│  · WebSocket rooms  │  │  --pr-comment         │  │                      │
└─────────────────────┘  └───────────────────────┘  └──────────────────────┘
           │                         │                         │
           └─────────────────────────┴─────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                           Integrations                                  │
│                                                                         │
│  CI/CD             Bots & Alerts       AI Coding Tools   Project Mgmt  │
│  GitHub Action     Slack Bot           Claude Code       Jira          │
│  GitLab CI         Discord Bot         Cursor            Linear        │
│  Bitbucket Pipe    Teams Bot           Windsurf · Codex  Raycast       │
│  CircleCI Orb      @grasp-bot          Copilot Extension               │
│  Jenkins Plugin                        Amazon Q · Cline                │
│                                        GPT Actions · Roo               │
│                                                                         │
│  SaaS / Cloud: grasp.dev API · badge service · GitHub OAuth           │
└─────────────────────────────────────────────────────────────────────────┘
```

**浏览器应用：** 零安装依赖。React 18、D3.js 7、来自 CDN 的 Babel。Tree-sitter WASM 文法延迟加载并缓存在 IndexedDB 中。

**MCP 服务器：** Node.js 18+。用于跨 16 种语言的基于 AST 的函数提取和圈复杂度的原生 tree-sitter 绑定：Python、Go、Java、Kotlin、Rust、C、C++、C#、Ruby、JavaScript、TypeScript、TSX、Swift、PHP、Scala、Zig。

**Brain store：** 两个持久存储 — `~/.grasp/brain.db` 上的 SQLite（文件元数据、耦合、安全）和 `~/.grasp/graph/` 上的 Kuzu graph DB（函数调用图、导入、返回类型边 — 可通过 Cypher 查询）。

**IDE 扩展：** VS Code (`vscode-extension/`)、JetBrains (`jetbrains-plugin/`)、Zed、Neovim、Vim、Emacs、Eclipse、Continue — 全部由同一个 MCP 服务器支持。

**浏览器扩展：** Chrome、Firefox 和 Safari (`browser-extension/`、`safari-extension/`) — MV3，在 GitHub 和 GitLab 页面上注入浮动 Grasp 按钮。

---

## 版本和自动更新

`index.html` 和 `team-dashboard.html` 都在页脚中显示当前版本 (`v3.17.1`)。加载时，它们会静默检查 npm 注册表中的较新版本。如果找到，会出现一个可关闭的提示：

- **Update Now** — 从 GitHub 获取新的 HTML，下载它，并立即应用
- **Later** — 暂停 24 小时

无服务器，无后台进程。

---

## 隐私与安全

**您的代码留在您的机器上。**

**浏览器应用：**
- 100% 在浏览器中运行 — 无服务器，无代理
- GitHub/GitLab API 调用直接从您的浏览器到提供商
- 您的令牌仅存在于 `localStorage` 中 — 除选定的 Git 提供商外，绝不会发送到任何地方
- 无分析、无跟踪、无账户
- 整个应用是[一个开源 HTML 文件](index.html) — 自行审计

**MCP 服务器：**
- 作为子进程在本地运行 — 除 GitHub/GitLab API 外没有出站连接
- 无遥测、无数据收集
- 本地目录分析在内存中读取并丢弃；Brain store 留在您的机器上的 `~/.grasp/brain.db`

**供应链：**
- 每个 npm 版本都通过 GitHub Actions OIDC 使用 [SLSA provenance](https://slsa.dev) (Level 2) 签名
- 每个 Docker 镜像 (`ghcr.io/ashfordeou/grasp`) 都使用 Cosign keyless 签名进行签名，并记录在 [Sigstore Rekor](https://rekor.sigstore.dev) 公共账本中

安装前验证：

```bash
# npm 包
npm install -g @sigstore/verify  # 一次性
sigstore verify npm grasp-mcp-server@3.17.1

# Docker 镜像
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/ashfordeou/grasp:v3.17.1
```

---

## 贡献

设置、代码结构和 PR 检查清单请参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

**发现 Bug？** [打开 issue](https://github.com/ashfordeOU/grasp/issues)

**添加语言？** Tree-sitter 文法源在 `mcp/src/extractors/` 中 — 按照现有模式创建新的语言文件。

**添加 MCP 工具？** 按照现有的 `server.registerTool` 模式在 `mcp/src/index.ts` 中注册。在 `mcp/tests/` 中添加测试。

---

## 许可证

**Elastic License 2.0** — Copyright (c) 2026 Ashforde OÜ.

可免费使用、修改和自托管。您不得将 Grasp 作为托管或受管服务提供，不得删除版权声明，也不得以不同的品牌重新分发。完整条款请参见 [LICENSE](LICENSE)。

---

<div align="center">

**121 个 MCP 工具 · 35 种语言 · 11 个 AI 提供商 + 200+ 模型 · 零安装 · 零数据收集**

*依赖图、安全扫描器、DORA 指标和 Grasp Brain — 在您编写代码的任何地方。*

</div>
