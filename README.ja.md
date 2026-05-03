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

**121 個の MCP ツール + 8 個のリソース + 2 個のプロンプト · 35 言語 · 11 AI プロバイダー + OpenRouter 経由で 200+ モデル · 10 種類のグラフビュー · データ収集ゼロ**

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

<a href="https://ashfordeou.github.io/grasp" target="_blank">🌐 ブラウザアプリ</a> &nbsp;·&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank">📦 MCP サーバー</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">🐛 バグ報告</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">✨ 機能リクエスト</a> &nbsp;·&nbsp;
<a href="https://ashfordeou.github.io/grasp/docs/privacy.html" target="_blank">🔒 プライバシー</a>

</div>

---

## Grasp とは？

**Grasp** は、任意の GitHub または GitLab リポジトリ — クラウドまたはセルフホスト — あるいはローカルコードベースを数秒でインタラクティブなアーキテクチャマップに変換します。**121 個の MCP ツール**(加えて 8 個のリソースと 2 個のガイド付きプロンプト)が、解析エンジン全体を Claude Code、Cursor、および任意の MCP 互換エージェントに公開します。

```
URL を貼り付け / フォルダーを開く  →  AST 解析エンジン  →  アーキテクチャマップ + 121 MCP ツール
```

| | |
|---|---|
| **インストール不要** | ブラウザで 100% 動作 — HTML ファイル 2 つ、ビルドステップなし |
| **データ収集なし** | あなたのコードはマシンから一切外に出ません |
| **アカウント不要** | URL を貼り付けるだけで開始 |
| **オフライン動作** | インターネットなしでローカルフォルダを解析 |
| **35 言語** | JS/TS, Python, Go, Java, Rust, C/C++, C#, Ruby, Swift, Kotlin, Scala, Dart, Elixir, Erlang, Haskell, OCaml, F#, Clojure, Julia, Lua, R, Perl, Shell, PowerShell, Groovy, Zig, V, Nim, Crystal, VBA, Ada/SPARK, Vue, Svelte, PHP |
| **121 個の MCP ツール** | 依存関係グラフ、セキュリティ、**OSV.dev SCA 脆弱性スキャン**、DORA、Brain ストア、Kuzu graph schema v3、コミュニティ、ORM トラッカー、git 変更影響、アーキテクチャドリフト検出、テストカバレッジギャップマップ、組織ダッシュボード、PR impact action、MCP Resources/Prompts、`grasp setup` エディタ自動設定 |
| **11 AI プロバイダー** *(+ ルーター経由で無制限)* | 直接接続: Anthropic Claude (3 モデル), OpenAI (GPT-4o + o-シリーズ), Google Gemini (3), Mistral (2), Groq (3), DeepSeek (chat + reasoner), Ollama (ローカル), LM Studio (ローカル), カスタム OpenAI 互換エンドポイント。ルーター: OpenRouter (slug 経由で 200+ モデル) と Together AI (50+ オープンソースモデル)。**会話の途中で切り替え可能**、**デフォルトでは完全にオフ** (チャットパネル閉じている = ネットワーク呼び出しゼロ)、**API キーは `localStorage` のみに保存** — Grasp にはプロキシやテレメトリはありません。 |
| **10 種類のグラフビュー** | Force graph, 3D, arch, treemap, matrix, tree (dendrogram), flow (sankey), bundle, cluster (disjoint), heatmap |
| **Grasp Brain** | SQLite + Kuzu 永続ストア — 一度インデックスすれば、即座にクエリ可能。FTS5 + 384D ベクトル埋め込み + Cypher グラフクエリ |
| **サプライチェーン署名済み** | リリースごとに SLSA Level 2 npm provenance + Cosign keyless Docker 署名 |

---

## スクリーンショット

### 🕸️ 依存関係グラフ — ファイル間の接続を正確に可視化

<img src="docs/screenshots/graph.png" alt="Grasp dependency graph view" width="100%"/>

### 🏛️ アーキテクチャ図 — レイヤーごとのコードベース

<img src="docs/screenshots/arch.png" alt="Grasp architecture diagram view" width="100%"/>

### 📦 ツリーマップ — 行数によるサイズ表示

<img src="docs/screenshots/treemap.png" alt="Grasp treemap view" width="100%"/>

### 🏢 チームダッシュボード — 全リポジトリの健全性を一目で

<img src="docs/screenshots/team-dashboard.png" alt="Grasp team dashboard" width="100%"/>

---

## クイックスタート

### オプション 1 — ブラウザ (セットアップ不要)

```bash
git clone https://github.com/ashfordeOU/grasp.git
open index.html           # メインアプリ
open team-dashboard.html  # チームダッシュボード
```

ビルドステップなし。`npm install` なし。**HTML ファイル 2 つだけ。**

### オプション 2 — CLI

```bash
npm install -g grasp-mcp-server

grasp ./my-project        # ローカルフォルダを解析
grasp facebook/react      # GitHub リポジトリを解析
grasp .                   # カレントディレクトリを解析
grasp . --watch           # ライブモード — ファイル保存ごとにブラウザがリロード
grasp . --timeline        # タイムトラベル — 直近 30 コミットをスクラバーとして表示
grasp . --report          # ターミナル専用レポート + JSON 出力
grasp . --format=sarif    # GitHub Code Scanning 用に SARIF をエクスポート
grasp . --pr-comment      # GitHub PR コメント用 markdown を stdout に出力
grasp . --check           # grasp.yml アーキテクチャルールを強制 (CI ゲート)
```

### オプション 3 — IDE 拡張機能

| IDE | インストール |
|-----|---------|
| **VS Code** | [Install (.vsix)](https://github.com/ashfordeOU/grasp/releases/latest) — `grasp-vscode-3.17.1.vsix` をダウンロードし、**Extensions: Install from VSIX…** (`Cmd+Shift+P`) を実行 |
| **JetBrains** | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) — Settings → Plugins で **Grasp** を検索 |
| **Raycast** | [Raycast Store](https://www.raycast.com/ashfordeOU/grasp) — または Raycast 拡張ストアで **Grasp** を検索 |
| **Zed** | [Zed Extensions](https://zed.dev/extensions?query=grasp) — または Zed → Extensions で **grasp** を検索 |

### オプション 4 — ブラウザ拡張機能

| ブラウザ | インストール |
|---------|---------|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) — ID: `grasp@ashforde.org` |
| **Safari** | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) — [サイドロード手順](#safari-sideload)を参照 |

すべての GitHub および GitLab ページにフローティング **Grasp** ボタンが表示されます。オンデマンド許可付与により、セルフホストの GitLab、GitHub Enterprise、および任意のカスタムホストをサポートします。

---

### 配布チャネル一覧

タグ付きリリースごとにすべてのチャネルへ自動公開されます:

| チャネル | ステータス | リンク |
|---------|--------|------|
| **npm** (`grasp-mcp-server`) | [![npm](https://img.shields.io/npm/v/grasp-mcp-server?style=flat-square)](https://www.npmjs.com/package/grasp-mcp-server) | `npm install -g grasp-mcp-server` |
| **MCP Registry** | 掲載中 | [modelcontextprotocol.io](https://mcpregistry.com) |
| **Docker** (`ghcr.io/ashfordeou/grasp`) | [![ghcr](https://img.shields.io/badge/ghcr.io-latest-blue?style=flat-square)](https://github.com/ashfordeOU/grasp/pkgs/container/grasp) | `docker pull ghcr.io/ashfordeou/grasp:latest` |
| **VS Code** | Releases に `.vsix` | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest) |
| **JetBrains** | Marketplace | [Plugin ID 31362](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) |
| **Raycast** | Store (PR 提出済み) | [raycast.com/ashfordeOU/grasp](https://www.raycast.com/ashfordeOU/grasp) |
| **Zed** | Extension (PR 提出済み) | [zed.dev/extensions](https://zed.dev/extensions?query=grasp) |
| **Chrome** | Web Store | [CWS listing](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | AMO (掲載中) | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) |
| **Safari** | サイドロード (macOS 13+) | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitLab bot image** | `ghcr.io/ashfordeou/grasp-gitlab-bot` | リリースごとに自動プッシュ |
| **GitLab tunnel agent** | Releases にバイナリ | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitHub Release** | 署名 + チェックサム | [Releases page](https://github.com/ashfordeOU/grasp/releases) |

### AI ツール統合 *(あなたのアシスタントが MCP または拡張機能経由で Grasp を呼び出します)*

| AI ツール | インストール方法 | 備考 |
|---------|----------------|-------|
| **Claude Code** | `claude mcp add grasp -- npx -y grasp-mcp-server` | ネイティブ MCP — 全 121 ツール + 8 Resources + 2 Prompts |
| **Cursor** | `~/.cursor/mcp.json` に `grasp-mcp-server` を追加 | ネイティブ MCP |
| **Cline / Roo Code / Kilo Code** | VS Code 設定で MCP 構成 | ネイティブ MCP |
| **Windsurf** | MCP 構成 | ネイティブ MCP |
| **Codex / OpenCode / Trae / Droid** | MCP 構成 | ネイティブ MCP — `grasp setup` がすべてを自動設定 |
| **Gemini CLI / Grok CLI** | MCP 構成 | ネイティブ MCP |
| **GitHub Copilot Chat** | `grasp-copilot-extension` をインストール | Copilot が Copilot Extension API 経由で Grasp を呼び出し — チャット内で `@grasp` メンション |
| **Continue** | `continue-provider` パッケージ | Grasp を Continue context provider として |
| **Amazon Q Developer** | `amazon-q-plugin` | Grasp が Q のチャットに表示される |
| **GPT Actions / Custom GPTs** | `gpt-actions` パッケージ | OpenAI Actions schema 用に REST として公開 |
| **Aider / Sweep / 任意のツール** | `grasp-mcp-server` npm パッケージを使用 | ツール非依存の stdio JSON-RPC |

<details>
<summary id="safari-sideload">🧭 Safari サイドロード手順</summary>

```bash
curl -sL https://github.com/ashfordeOU/grasp/releases/latest/download/grasp-safari-extension.zip \
  -o /tmp/grasp-safari.zip \
  && unzip -q /tmp/grasp-safari.zip -d /tmp/grasp-safari \
  && mv /tmp/grasp-safari/Grasp.app /Applications/ \
  && open /Applications/Grasp.app
```

その後、Safari で: **設定 → 機能拡張 → Grasp を有効化**。表示されない場合は、まず **Safari → 開発 → 未署名の機能拡張を許可** を有効にします。

</details>

---

## 動作の仕組み

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

## ビジュアライゼーション

### グラフタイプ

| ビュー | 説明 |
|------|-------------|
| 🕸️ **Graph** | Force-directed 依存関係グラフ — ドラッグ、ズーム、複数選択 |
| 🔮 **3D Graph** | 三次元 force graph — 回転、パン、ズーム |
| 🏛️ **Arch** | レイヤー別アーキテクチャ図 |
| 📦 **Treemap** | 行数によるサイズ、フォルダごとにグループ化 |
| 📊 **Matrix** | すべての依存関係を表示する隣接行列 |
| 🌳 **Tree** | 階層的クラスター樹形図 |
| 🌊 **Flow** | フォルダレベルの Sankey 依存フロー |
| 🎯 **Bundle** | アークベース接続による円形レイアウト |
| 🔮 **Cluster** | フォルダごとに分離した force グラフ |

### カラーモード

| モード | 表示内容 |
|------|---------------|
| 📁 **Folder** | ディレクトリ構造 |
| 🏗️ **Layer** | アーキテクチャ層 (UI、Services、Utils など) |
| 🔥 **Churn** | コミット頻度 — 赤 = 最も変更されたホットスポット |
| ⚡ **Complexity** | 循環的複雑度 (緑 → 黄 → 赤) |
| 💥 **Blast** | 選択したファイルの blast radius 影響範囲 |
| 🌊 **Depth** | 最大ブレースネスト深さ |
| 🔎 **Dup** | 重複コード密度 — 赤 = 多くのクローン |
| 👤 **Owner** | トップ貢献者 — bus-factor リスクを発見 |
| 🐛 **Issues** | ファイルごとにリンクされた GitHub Issues |
| 🧪 **Coverage** | テストカバレッジ — 未テストファイルをハイライト |
| 📦 **Bundle** | バンドルサイズへの貢献 |
| 🌐 **API Surface** | 公開ファイルの露出度 |
| ⚡ **Runtime** | ライブトレースからの実際のコール頻度 |
| 🔒 **Safety** | セーフティゲートカバレッジ (緑 = ゲート済み、赤 = 未ゲート) |
| 🧪 **Boundary** | リサーチ/プロダクション境界ドリフト |
| 🧪 **Eval Coverage** | eval/test スクリプトからのカバレッジ |

---

## コードインテリジェンス

### 📊 ヘルススコア
デッドコード、循環依存、結合メトリクス、セキュリティ問題に基づく即座の **A–F グレード**。スコア (0–100) としてビジュアルバー付きで表示。

### 🔐 セキュリティスキャナー
ハードコードされたシークレットや API キー、SQL インジェクションリスク、危険な `eval()` 使用、本番環境に残されたデバッグステートメントの自動検出。

### 🛡️ 依存関係脆弱性スキャナー *(v3.17.0)*
[OSV.dev](https://osv.dev) の無料公開 CVE データベースに対して宣言された依存関係を解析ごとにスキャン。`package.json` (`package-lock.json` 解決を含む)、`requirements.txt`、`pyproject.toml`、`go.mod`、`Cargo.toml` (`Cargo.lock` 解決を含む)、および `pom.xml` をサポート。CVSS スコアと修正バージョン提案による重大度分類された結果。右パネルに新しい **VULN** タブ、新しい `grasp_vulnerabilities` MCP ツール、critical/high の発見で 1 を返して終了する新しい `grasp vulns <path>` CLI (CI フレンドリー)。ヘルススコアは critical あたり –5、high あたり –3 を減算します。**100% クライアントサイド** — OSV リクエストはあなたのブラウザから直接 OSV.dev へ送られ、Grasp サーバーを経由することはありません。24 時間 localStorage キャッシュ、ネットワーク障害時は静かに低下動作。

### 🧩 パターン検出
Singleton、Factory、Observer/Event パターン、React フック、アンチパターン (God Objects、高結合) を自動的に識別。

### 💥 Blast Radius 解析
*"このファイルを変更したら、何が壊れるか?"* — 任意のファイルを選択すると、影響を受けるすべての下流ファイルがグラフ上でハイライトされます。

### 🔥 アクティビティヒートマップ
コミット頻度でファイルを着色。GitHub リポジトリ (API 経由) と**ローカルリポジトリ** (`git log` 経由 — インターネット不要) の両方で動作。

### 🔎 重複・類似性検出
**Dup** カラーモードは完全または近似重複コードを持つファイルをハイライトします。`grasp_similarity` MCP ツールはターゲットを絞ったリファクタリングのためにランク付けされた重複クラスターを返します。

### 👥 コードオーナーシップ
git 履歴から得たファイルごとのトップ貢献者と行パーセンテージの内訳。GitHub Blame へワンクリックでジャンプ。

### 📋 PR 影響解析
PR URL を貼り付けて、それが触れるファイルとマージ前の変更の blast radius を計算します。

### 💰 技術的負債の定量化
すべてのアーキテクチャ問題を、設定可能な見積もりを使用して開発時間に変換 — circular dep = 4h、god file = 16h、critical security = 8h — 結合乗数付き。ヘルスパネルとチームダッシュボードに表示。

### 🔗 共有可能な埋め込み
`⋯ → 🔗 Embed` をクリックすると、すぐに貼り付けられる `<iframe>`、README バッジ、React スニペット、直接リンクが取得できます — ドキュメント、wiki、ダッシュボードでライブヘルスレポートを共有できます。

### 🎯 接続コンフィデンススコア *(v3.16.0)*
すべてのクロスファイル接続が 0–1 でスコア化されます: 明示的な静的 import = 1.0、同フォルダ = 0.8、クロスフォルダ推測 = 0.6、低頻度 = 0.4。Force graph はコンフィデンスをエッジ不透明度として重ねて表示 — ⚙ 設定のスライダーで低コンフィデンスエッジをフィルタリング可能。

### 🔍 グラフクエリモーダル *(v3.16.0)*
🔍 ツールバーボタンをクリックして、グラフを離れることなくブラウザ内でファイル、関数、エッジを検索。マッチはライブで更新 — 任意のファイル結果をクリックしてグラフ上にジャンプ。

### ƒ() 関数レベルキャンバス *(v3.16.0)*
`ƒ()` ボタンをトグルして force graph をファイルレベルから関数レベルノードに切り替え — 個別の関数呼び出し関係を表示、パフォーマンスのため 300 ノードに制限。

### 🗄️ DB Coupling タブ *(v3.16.0)*
右パネルの **🗄️ DB** タブは ORM パターン (Django、TypeORM、生 SQL) のためにファイル内容をスキャンし、どのファイルがどのテーブルを参照するかをマッピング。god テーブルや高結合ファイルを即座に発見。

### 🎯 Good First Issues タブ *(v3.16.0)*
**🎯 GFI** タブは孤立した低複雑度の未テストファイルを表示 — 新人エンジニアや AI コーディングエージェントに理想的な貢献ターゲット。

### 🔐 PII 検出とセキュリティサブカテゴリ *(v3.16.0)*
Security タブにサブカテゴリピル — **ALL / SECRETS / INJECTION / PII / EVAL** — が追加され、発見をフィルタリングできます。PII ピルはソースファイル内で email、phone、SSN、credit card、API key パターンをスキャンします。

### 📸 アーキテクチャドリフト検出 *(v3.17.0)*
コードベースアーキテクチャのスナップショットを取得し、時間とともにドリフトを検出 — 自動的に。

```bash
grasp snapshot ./my-project --name before-refactor
# ... 変更を加える ...
grasp drift ./my-project          # ドリフトが CRITICAL なら 1 を返して終了 (CI フレンドリー)
```

| MCP ツール | 説明 |
|----------|-------------|
| `grasp_snapshot` | 現在のヘルススコア、結合メトリクス、循環依存、トップ 10 ホットスポットを名前付きスナップショットとして保存 |
| `grasp_diff_snapshots` | 任意の 2 つのスナップショットを比較 — ヘルスデルタ、新しい循環依存、結合が 20% 以上増加したファイル、ドリフトレベル (STABLE / DEGRADED / CRITICAL) を返す |

スナップショットは `~/.grasp/brain.db` に保存され、解析セッションを越えて保持されます。

### 🧪 テストカバレッジギャップマップ *(v3.17.0)*
本番インシデントを引き起こす可能性が最も高い関数を発見 — 最高のコール数、ゼロのテストカバレッジ。

```bash
grasp_coverage_gaps  # MCP 経由 — call_count DESC でソートされた uncovered_functions を返す
```

依存関係グラフに **🧪 Coverage オーバーレイ** トグルが追加 — 未カバー関数は赤、部分カバーは琥珀、カバー済みは緑でレンダリング。カバレッジは静的解析で推定: Grasp はテストファイル (`*.test.*`、`*.spec.*`、`test_*`、`*_test.*`) を検出し、それらが参照するソース関数をトレースします。

| MCP ツール | 説明 |
|----------|-------------|
| `grasp_coverage_gaps` | `uncovered_functions` (コール数でソート)、`risky_uncovered` (高 churn + テストなし)、ディレクトリごとの `coverage_by_module`、`overall_coverage_estimate` を返す |

### 🏢 組織レベルダッシュボード *(v3.17.0)*
1 コマンドで GitHub 組織全体を解析:

```bash
grasp org my-github-org --token ghp_xxx --format html   # 自己完結型 HTML ダッシュボード
grasp org my-github-org --format json                   # CI 消費可能な JSON
grasp org my-github-org --format md                     # wiki 用 Markdown
```

すべてのリポジトリ (最大 500、5 並列) でヘルスグレード、セキュリティ発見、最も churn したファイル、言語分布を集約。HTML 出力は Chart.js をインライン埋め込み — 外部依存なし。

| MCP ツール | 説明 |
|----------|-------------|
| `grasp_org_summary` | 組織のトップ 20 リポジトリまでを解析 — 集約ヘルスグレード、グレード分布、重大度別の総セキュリティ発見、トップ churn ファイル、言語内訳を返す |

### 🤖 PR Impact GitHub Action *(v3.17.0)*
すべての pull request に自動アーキテクチャ影響解析を追加:

```yaml
# .github/workflows/grasp-pr-impact.yml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-risk-to-comment: LOW      # LOW / MEDIUM / HIGH / CRITICAL
    fail-on-risk: CRITICAL        # このリスクレベルで CI チェックを失敗させる
```

アクションは構造化された PR コメントを投稿します:
- カラーコード付きの**リスクバッジ** (LOW / MEDIUM / HIGH / CRITICAL)
- 関数レベルの blast radius を伴う変更ファイル
- 影響を受けた実行プロセス (ステップ数付き)
- `git blame` から提案されるレビュアー (影響を受けた各ファイルのトップ 2 貢献者)
- テストカバレッジギャップ: 変更された関数のうちテストファイルが触れていないもの

---

## AI Chat — 15 プロバイダー

コードベース全体を理解する組み込み AI アシスタント。*"なぜ auth.ts はホットスポットなのか?"*、*"リファクタリングに最も安全なファイルは?"*、*"このコールチェーン内のセキュリティ問題を説明して"* のように尋ねると、回答はライブの依存関係グラフ、セキュリティ発見、アーキテクチャ層を参照します。

| プロバイダー | モデル |
|----------|--------|
| **Anthropic** | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-4o, GPT-4o mini, o3-mini, o1 |
| **Google Gemini** | Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash |
| **Mistral** | Mistral Small, Mistral Large |
| **Groq** | Llama 3.3 70B, 3.1 8B, Gemma 2 9B |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner |
| **OpenRouter** | 任意のモデル slug (1 つのキーで 100+ モデル) |
| **Together AI** | 任意のモデル slug |
| **Ollama** | ローカルモデル (キー不要) |
| **LM Studio** | 任意のポートでのローカルモデル |
| **Custom** | 任意の OpenAI 互換ベース URL |

**特徴:**
- マルチターン会話メモリ — ページ更新を越えて `localStorage` で保持
- 選択ファイルコンテキスト — ファイル選択時にレイヤー、関数、複雑度、問題が自動注入
- 豊富なコードベースコンテキスト — メタデータ付きトップ 80 ファイル、すべての問題、セキュリティ発見、循環依存、レイヤー内訳
- シンタックスハイライト付きコードブロックの Markdown レンダリング
- API キーはブラウザ内のみ、選択したプロバイダー以外には決して送信されません

---

## Grasp Brain — 永続的アーキテクチャインテリジェンス *(v3.16.0)*

Grasp Brain は連携して動作する 2 つの永続ストアを組み合わせています:

- **SQLite Brain** (`~/.grasp/brain.db`) — ファイルメタデータ、結合、セキュリティ、issue インデックス。関数の FTS5 全文索引と、プロセス内 384D ベクトル埋め込みストア (Xenova/all-MiniLM-L6-v2 — クラウド依存なし) を含みます。一度インデックスすれば、即座にクエリ可能。
- **Kuzu Graph DB** (`~/.grasp/graph/`) — Cypher クエリサポート付きネイティブグラフデータベース。完全な関数コールグラフ、ファイルインポート、型関係をトラバース可能なプロパティグラフとして保存。

一度インデックスすれば、即座にクエリ可能 — 再解析不要。すべての関数は参加する実行プロセス (エントリポイントからの BFS) でタグ付けされるため、検索結果には flow ごとにマッチをグループ化する `processes[]` フィールドが含まれます。

### 動作の仕組み

```
grasp index ./my-project    →  解析が ~/.grasp/brain.db に保存される
grasp context src/api.ts    →  保存されたインデックスから即座にファイルコンテキスト
grasp diff ./my-project     →  保存されたベースラインと現在の状態を比較
grasp daemon ./my-project   →  変更を監視し、自動的に再インデックス
```

### CLI サブコマンド

```bash
grasp index <path>           # リポジトリを解析して brain に保存
grasp context <src> <file>   # 任意のファイルの豊富なコンテキストを取得
grasp setup [path]           # Claude Code / Cursor / Windsurf にフックをインストール
grasp diff <path>            # brain ベースラインと現在の解析を比較
grasp daemon <path>          # ディレクトリを監視し、変更時に自動再インデックス
grasp drift [path]           # スナップショット + 前回スナップショットとの diff; CRITICAL で 1 終了
grasp org <github-org>       # 組織レベルダッシュボード (--format json|html|md --token ghp_xxx)
```

### Ask Grasp — 自然言語アーキテクチャクエリ

ブラウザアプリ (Ask Grasp パネル) と `grasp_ask` MCP ツールの両方が、コードベースに関する平易な英語の質問をサポートします。`grasp_ask` は構造的意図を直接認識します。オープンエンドのクエリでは、**ハイブリッドセマンティック検索** にフォールバック — Reciprocal Rank Fusion でマージされた BM25 全文 + 384D ベクトル埋め込み。

質問応答層なしの純粋なセマンティック検索には、`grasp_search` を直接使用してください — 結果には各マッチがどの実行フローに属するかを示す `processes[]` フィールドが含まれます。

| 質問 | 得られるもの |
|----------|--------------|
| *"最も複雑なファイルは?"* | 循環的複雑度でランク付けされたファイル |
| *"結合ホットスポットを見せて"* | 最高の合計 fan-in + fan-out を持つファイル |
| *"セキュリティ問題は?"* | コードベース全体のすべてのセキュリティ発見 |
| *"auth.ts の blast radius は?"* | 完全な推移的影響リスト |
| *"データアクセスを処理するのはどの層?"* | ファイル例付きレイヤー内訳 |
| *"全体のグレードは?"* | ヘルススコア、グレード、問題サマリー |
| *"最も churn の多いファイルは?"* | コミット頻度ランキング |
| *"循環依存はある?"* | 重大度付きサイクルリスト |

### Registry — すべてのインデックス済みリポジトリ

`grasp_registry_list` と `grasp_registry_status` は完全な Brain インデックスを公開します:

```bash
# MCP 経由
grasp_registry_list          # すべてのリポジトリ: ヘルスグレード、ファイル、関数、アクティブセッション
grasp_registry_status        # 集約: インデックス数、セッション数、グレード分布

# HTTP 経由 (MCP サーバーが --http で実行されている場合)
curl http://localhost:7332/api/v1/registry
```

チームダッシュボードの **🗂️ Registry パネル**は読み込み時に自動取得 — session_id 不要。

### Arch Diff

`grasp diff` (および `grasp_arch_diff` MCP ツール) は現在のコードベースを保存された brain ベースラインと比較し、以下を表示します:
- グレードの低下 (悪化したファイル: A→B、B→C など)
- ヘルススコアデルタ
- ベースライン以降に導入された新しいセキュリティ問題

### エディタフック (`grasp setup`)

リポジトリ内の `.claude/`、`.cursor/`、`.windsurf/` を検出し、AI コーディングアシスタントにすべてのアクション前にコードベースコンテキストを自動的に与える pre-tool-use フックをインストールします。アーキテクチャサマリー付きの `CLAUDE.md` と `AGENTS.md` も書き出します。

---

## チーム & コラボレーション

### 🏢 チームダッシュボード

複数リポジトリの健全性を 1 つのビューで追跡。任意の公開 (またはトークン付きの非公開) GitHub リポジトリを追加して以下を確認:

- ヘルススコア、グレード、ファイル、問題、循環依存、セキュリティ発見、アーキテクチャ層
- **Pattern count、Env var issues、Feature flag count** — 新しい v3.13.0 列
- **DORA メトリクスミニカード** — リポジトリごとの Deploy Frequency、Lead Time、Change Fail Rate、MTTR (展開可能な行)
- **🗂️ Registry パネル** — ライブヘルスグレードとセッションステータス付きのすべての Brain インデックス済みリポジトリ
- コミットアクティビティ (7d / 30d) と CI ステータス (✅/❌/⏳)
- コミット速度スパークライン、開発者日数での技術的負債
- テーブル全体を **CSV または JSON** としてエクスポート。📁 Open Folder (File System Access API) でローカルフォルダを開く。

### 🔄 ライブチームコラボレーション

Grasp の CLI はチーム全体のためのリアルタイムコラボレーションサーバーをホストします:

```bash
npx grasp --host=0.0.0.0 --room-secrets=backend:pass1,frontend:pass2
#   → main app:       http://server-ip:7331/
#   → team dashboard: http://server-ip:7331/dashboard
#   → health check:   http://server-ip:7331/api/health
```

- **WebSocket 同期** — ワークスペースの変更が接続されたすべてのチームメンバーに即座に伝播
- **名前付きルーム** — `?sync_room=backend-team` で各チームのワークスペースを分離
- **プレゼンスインジケーター** — Sync パネルで誰がオンラインかを確認
- **共有リンク** — ⎘ Copy team link または 👁 Copy read-only link
- **読み取り専用モード** — 観察者用 `?readonly=1`
- **パスワード保護** — `--room-secrets=room:password`
- **REST API** — `GET /api/health` · `GET /api/rooms` · `GET/PUT /api/workspace/:room`

> **LAN ホスティング:** 同じネットワーク上の誰でも `http://server-ip:7331/dashboard` にアクセス可能 — クラウド不要。

### 🏢 Monorepo & ワークスペースサポート

Grasp は monorepo 内のサブパッケージを自動的に検出します (`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`pom.xml`)。**Workspace** サイドバーで単一パッケージにフィルタリング — すべてのグラフ、ツリーマップ、メトリクスが即座に更新されます。

### ⏮️ タイムトラベルアーキテクチャスクラバー

`grasp . --timeline` を実行すると、直近 30 git コミットがスクラバーパネルとして読み込まれます。任意のコミットへスライダーをドラッグ — 変更されたノードがグラフ上で黄色く光るので、アーキテクチャの時間的変化を観察できます。

### 📡 ライブウォッチモード

`grasp . --watch` を実行すると、リアルタイム SSE 同期付きのローカル開発サーバーが起動。すべてのファイル保存でブラウザグラフが自動的にリロード — 接続中は `LIVE` バッジが表示されます。

---

## 業界バーティカル

### ✈️ 航空宇宙 / 安全クリティカル

| 機能 | 説明 |
|---------|-------------|
| **要求トレーサビリティ** | 要求 CSV をアップロード — Grasp が `@REQ-NNN` タグをスキャンしてカバレッジ %、不足、未指定ファイルを表示。ワンクリックでコンプライアンスマトリクスをエクスポート。 |
| **MISRA / 安全モード** | `⋯ → 🔧 Safety Mode` — MISRA C/C++ および Ada 違反を検出: init 後の動的割り当て、再帰呼び出し、`goto`、`abort()`/`exit()`。 |
| **DO-178C / ECSS 認証エクスポート** | ワンクリックの認証エビデンスパッケージ: インベントリ、トレーサビリティマトリクス、複雑度、MISRA 違反、セキュリティ発見 — JSON と印刷可能な HTML。 |
| **異常調査** | ファイル選択 → 🔍 Anomaly Investigation — caller、callee、推移的 blast radius、最近のコミット、コールパス内のセキュリティ、平易な英語サマリー。 |
| **ソフトウェア再利用評価** | Interface Compatibility、Dependencies、Safety Level、Architecture Fitness、Security、Complexity を横断する信号機マトリクス。 |
| **クロス言語コールグラフ** | Ada→C `pragma Import`、Python `ctypes`/`cffi`、JS→WASM 境界。 |
| **遺産ソフトウェア系譜** | 起源ミッションマニフェストをオーバーレイ、ゼロデルタ認証ショートカットを識別。 |
| **ICD マッパー** | Interface Control Document エントリをエクスポートされた関数にマッチング、未実装インターフェースをフラグ。 |
| **ECSS-E-ST-40C コンプライアンス** | DI-01、DI-04、DI-07、DI-10、DI-15 コンプライアンス要件をチェック。 |

### 🧠 AI 研究

| 機能 | 説明 |
|---------|-------------|
| **安全制約トレーサー** | 安全ゲート (フィルタ、サニタイザ) をマーク — すべての entry→output パスをトレースし、すべてのゲートをバイパスするものをフラグ。新しい **Safety** カラーモード。 |
| **リサーチ/プロダクション境界** | リサーチ vs プロダクションフォルダを定義 — リサーチコードからインポートするプロダクションファイルをフラグ。 |
| **Jupyter Notebook サポート** | 依存関係グラフ内の `.ipynb` — コードセルを抽出、インポートを解析、再現性問題をフラグ。 |
| **トレーニング実行 Diff** | 2 つの YAML/JSON 設定をアップロード — ハイパーパラメータを diff し、各変更キーを読むファイルを発見。 |
| **Eval カバレッジマップ** | eval スクリプトを自動検出し、それらが実行する model/training コードをトレース。eval カバレッジのない安全ゲートは critical としてフラグ。 |
| **ML パイプライン DAG** | PyTorch、TensorFlow、JAX、HuggingFace パターンを検出 — Data→Model→Training→Eval→Checkpoint DAG をレンダリング。 |

### 🏢 エンタープライズ

| 機能 | 説明 |
|---------|-------------|
| **SBOM 生成** | npm、pip、Cargo、Go modules 用の CycloneDX 1.4 または SPDX 2.3 JSON。OSV API 経由のオプション CVE 強化。 |
| **DORA メトリクス** | GitHub Actions からの Deployment Frequency、Lead Time、Change Failure Rate、MTTR。Elite/High/Medium/Low 分類。 |
| **AI 駆動 ADR 生成** | コードベースコンテキスト + オプション PR diff を使用したワンクリック MADR 形式 Architecture Decision Records。 |
| **PII データフロートレーサー** | ユーザーマーク済み PII ソースファイルからの BFS — すべての下流コンシューマを表示。 |
| **職務分離** | トランザクションを開始かつ承認するファイルを検出 (SOX/FDA コンプライアンス)。 |
| **規制変更影響** | GDPR/HIPAA/SOX/PCI-DSS 条文変更のキーワードから blast radius へ。 |
| **金融 / トレーディング** | レイテンシホットスポット検出 — ブロッキング I/O、GC 圧力、ロック競合、ループ内の割り当て。 |
| **金融モデルリスク** | ハードコードされたパラメータ、欠落 NaN チェック、ゼロガードなしの除算。 |

---

## AI エージェント向け — MCP サーバー

Grasp は **Model Context Protocol (MCP) サーバー**を提供し、解析エンジン全体を Claude Code、Cursor、および任意の MCP 互換エージェントに対する呼び出し可能なツールとして公開します。

### セットアップ

```bash
# インストール
npm install -g grasp-mcp-server

# またはインストールせずに実行
npx grasp-mcp-server
```

`~/.claude/claude_mcp_settings.json` に追加:

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

GitHub リポジトリとローカルディレクトリで動作します。GitLab、Docker、セルフホストオプションについては [`mcp/README.md`](mcp/README.md) を参照してください。

### ツールリファレンス

**Core Analysis**

| ツール | 機能 |
|------|-------------|
| `grasp_analyze` | 任意のリポジトリまたはローカルパスの完全解析 — フォローアップクエリ用に `session_id` を返す |
| `grasp_sessions` | アクティブセッションのリスト (7 日間保持、再起動を生き延びる) |
| `grasp_diff` | 2 つのスナップショットを比較 — 解析間で何が変わったか? |
| `grasp_watch` | ディレクトリを再解析し、前回実行と diff |
| `grasp_rules_check` | `grasp.yml` アーキテクチャルールを実行し違反を報告 |
| `grasp_config_check` | アーキテクチャルールに対するセッションを検証 — 違反を返す |

**File & Code Intelligence**

| ツール | 機能 |
|------|-------------|
| `grasp_file_deps` | このファイルは何に依存しているか? |
| `grasp_dependents` | このファイルを変更したら何が壊れるか? |
| `grasp_cycles` | 循環依存はあるか? |
| `grasp_architecture` | このコードベースにはどんな層があるか? |
| `grasp_hotspots` | 触れるのが最もリスキーなファイルは? |
| `grasp_metrics` | ファイルごとの行数、複雑度、fan-in/fan-out |
| `grasp_find_path` | ファイル A はファイル B にどうつながっているか? |
| `grasp_patterns` | どんなデザインパターンが使われているか? |
| `grasp_unused` | デッドコード — 定義されているが呼ばれていない |
| `grasp_explain` | 任意のファイルまたは関数の平易な英語説明 |
| `grasp_refactor` | ファイルまたはセッションの段階的リファクタプラン |
| `grasp_suggest` | 効果対労力比でランク付けされたリファクタリング提案 |
| `grasp_onboard` | コードベース領域に入る新人エンジニア用の順序付き読書パス |
| `grasp_types` | 型注釈カバレッジ — 型のない高 fan-in ファイルを優先 |
| `grasp_similarity` | ランク付けされた重複クラスターとコードクローングループ |
| `grasp_stale` | アクティブだが放棄されたファイル — 低 churn、高 fan-in、テスト対応物なし |
| `grasp_change_risk` | 変更ファイルセットのリスクスコア 0–100 |

**Security & Compliance**

| ツール | 機能 |
|------|-------------|
| `grasp_security` | ハードコードされたシークレット、インジェクションリスク、危険なパターン |
| `grasp_sbom` | CycloneDX 1.4 または SPDX 2.3 JSON での SBOM |
| `grasp_sarif` | GitHub Code Scanning 用 SARIF 2.1.0 エクスポート |
| `grasp_license` | 依存ライセンス — copyleft と不明をフラグ |
| `grasp_pii_trace` | PII ソースファイルからすべてのコンシューマへの BFS トレース |
| `grasp_duties` | 職務分離 — 開始かつ承認するファイル |
| `grasp_reg_impact` | 規制変更 blast radius (GDPR/HIPAA/SOX/PCI-DSS) |
| `grasp_env_vars` | すべての env var 読み取り — 未文書化と test-only 変数をフラグ |
| `grasp_feature_flags` | すべての feature flag 読み取り (LaunchDarkly、GrowthBook、env-var フラグ) |

**Team & DevOps**

| ツール | 機能 |
|------|-------------|
| `grasp_pr_comment` | 変更ファイルの blast radius 付き PR ヘルスコメントを生成 |
| `grasp_pr_review` | 高重大度行で GitHub PR にインラインレビューコメントを投稿 |
| `grasp_commits` | 直近 7d と 30d のコミット数 |
| `grasp_ci_status` | 最新の GitHub Actions 実行 — passing/failing/in-progress |
| `grasp_dora` | DORA メトリクス — Deployment Frequency、Lead Time、CFR、MTTR |
| `grasp_adr` | AI 駆動 MADR 形式 Architecture Decision Record |
| `grasp_embed` | 共有用 iframe、README バッジ、React スニペットを生成 |
| `grasp_timeline` | コミットごとの変更ファイル + co-change マトリクス付き直近 N コミット |
| `grasp_contributors` | ファイルごとのオーナーシップ、bus-factor、トップ貢献者 |
| `grasp_coverage` | テストカバレッジオーバーレイ — テストのないファイルは? |
| `grasp_issues` | GitHub Issues を言及するファイルにマップ |
| `grasp_jira_issues` | プロジェクトキー経由で Jira issues をソースファイルにマップ |
| `grasp_service_graph` | OTEL / カスタムトレース JSON からのサービスレベル依存関係グラフ |
| `grasp_deps_dev` | deps.dev 経由のエコシステム依存者 — このリポジトリに依存するパッケージ数 |

**Brain / Intelligence** *(v3.16.0)*

| ツール | 機能 |
|------|-------------|
| `grasp_brain_index` | リポジトリを解析しローカル SQLite brain に保存 |
| `grasp_brain_status` | brain にインデックスされているもの、いつ? |
| `grasp_context` | 豊富なファイルコンテキスト — レイヤー、複雑度、結合、セキュリティ、依存者、依存関係 |
| `grasp_arch_diff` | brain ベースラインと現在の状態を比較 — 劣化を検出 |
| `grasp_ask` | アーキテクチャについて自然言語で質問 |

**Graph Core** *(Kuzu — v3.16.0)*

| ツール | 機能 |
|------|-------------|
| `graph_query` | 永続的な関数/ファイルコールグラフに対して読み取り専用 Cypher クエリを実行 |
| `call_chain` | 任意の関数の caller/callee チェーンを設定可能な深さまでトレース |
| `type_propagation` | 同じ戻り値型を共有するすべての関数とそのコール隣接を発見 |
| `function_graph` | 任意の名前付き関数を中心とした Mermaid / DOT / JSON サブグラフをレンダリング |

**Advanced Analysis**

| ツール | 機能 |
|------|-------------|
| `grasp_dead_packages` | `package.json` にあるがインポートされない npm 依存 |
| `grasp_runtime_calls` | ライブランタイムトレースを静的エッジとマージ — 実際のホットパス |
| `grasp_db_coupling` | ORM/SQL からテーブルへの結合マップ — god テーブル、高結合ファイル |
| `grasp_migration_plan` | パッケージ/モジュール置換のためのトポロジカル順序付き段階的プラン |
| `grasp_api_surface` | OpenAPI、GraphQL、Express/FastAPI ルートからの統合 API サーフェス |
| `grasp_events` | イベントエミッタとサブスクライバ — 孤立 emit、ゴーストサブスクリプション |
| `grasp_perf` | N+1 クエリ、同期 I/O、ループ内の JSON シリアライゼーション |
| `grasp_bundle` | バンドルサイズツリーマップ — サイズカテゴリ別最大ファイル |
| `grasp_dep_impact` | 全ファイルにわたる依存関係アップグレードの影響 |
| `grasp_cross_repo` | 2 つのセッションを比較 — 共有ファイル、分岐した関数 |
| `grasp_diagram` | 依存関係グラフから Mermaid フローチャートまたは C4 図を生成 |

**Aerospace / Safety-Critical Vertical**

| ツール | 機能 |
|------|-------------|
| `grasp_req_trace` | 要求トレーサビリティ — CSV に対して `@REQ-NNN` タグをスキャン |
| `grasp_anomaly` | 異常調査 — BFS blast radius、コールチェーン内のセキュリティ、平易な英語サマリー |
| `grasp_reuse` | ソフトウェア再利用評価 — Red/Amber/Green 互換性マトリクス |
| `grasp_safety_trace` | 安全制約トレーサー — すべての安全ゲートをバイパスするパスを発見 |
| `grasp_multilang` | クロス言語コールグラフ (Ada→C、Python→C、JS→WASM) |
| `grasp_heritage` | 遺産ソフトウェア系譜 — ゼロデルタ認証ショートカット |
| `grasp_icd` | ICD マッパー — Interface Control Document エントリをコードにマッチ |
| `grasp_ecss` | ECSS-E-ST-40C コンプライアンスチェッカー (DI-01、DI-04、DI-07、DI-10、DI-15) |

**AI Research Vertical**

| ツール | 機能 |
|------|-------------|
| `grasp_run_diff` | トレーニング実行 diff — 変更されたハイパーパラメータと影響を受けたコード |
| `grasp_eval_coverage` | eval カバレッジマップ — eval カバレッジのない安全ゲートを critical としてフラグ |

**Multi-Repo / Platform**

| ツール | 機能 |
|------|-------------|
| `grasp_org_graph` | リポジトリ間エッジ付きの組織レベルマルチリポジトリ依存関係グラフ |
| `grasp_api_diff` | 破壊的 API 変更検出器 — 削除/変更されたエクスポートシンボル |
| `grasp_plugins` | 拡張ポイントマップ — プラグインインターフェース、フックポイント、戦略パターン |
| `grasp_semver` | セマンティックバージョニング強制 — 変更セット用 semver bump を検証 |
| `grasp_abi_diff` | ABI/API 安定性チェッカー — 安定性スコア 0–100 |
| `grasp_subsystems` | カーネル/OS サブシステム境界マップ |
| `grasp_kconfig` | Kconfig/ビルド時条件解析 — CONFIG_* 使用マップ |
| `grasp_irq` | IRQ/割り込み依存関係グラフ — ハンドラ内のブロッキング呼び出し、割り当て |
| `grasp_patch_impact` | パッチシリーズ影響分析器 — blast radius + 複雑度でパッチをランク付け |
| `grasp_good_first_issues` | Good first issue ジェネレータ — 孤立、低複雑度、未テストファイル |
| `grasp_api_stability` | 2 つのセッション間の API 安定性スコア (0–100) |
| `grasp_fork_diff` | フォーク分岐解析 — 分岐/同一/フォーク専用ファイル |
| `grasp_latency` | 金融/トレーディングレイテンシホットスポット検出 |
| `grasp_model_risk` | 金融モデルリスク監査 |

**Code Intelligence *(v3.16.0)***

| ツール | 機能 |
|------|-------------|
| `grasp_diff_symbols` | `git diff` ハンクを関数にマップ — マージ前の PR の blast radius |
| `grasp_exec_flow` | STEP_IN_PROCESS エッジ + Mermaid チャート付きの任意のエントリポイントからの BFS 実行フロー |
| `grasp_skillmd` | 解析セッションから自動生成された `SKILL.md` / `CLAUDE.md` スニペット |
| `grasp_hooks` | `.claude/settings.json` PostToolUse フック + `.cursor/rules/grasp.mdc` を生成 |
| `grasp_mro` | メソッド解決順序 — C3 線形化 (Python)、Ruby/Java 階層用 MRO |
| `grasp_communities` | Leiden/Louvain コミュニティ検出 — 境界づけられたコンテキストとマイクロサービス候補を識別 |
| `grasp_contracts` | マルチリポジトリ契約解析 — プロバイダーエクスポート vs コンシューマ使用、違反 + カバレッジ % |

**Analysis Intelligence *(v3.16.0)***

| ツール | 機能 |
|------|-------------|
| `grasp_confidence` | すべてのクロスファイル接続を 0–1 でスコア (明示的 import=1.0、同フォルダ=0.8、クロスフォルダ=0.6、低頻度=0.4) |
| `grasp_wiki` | markdown wiki を自動生成: index.md + フォルダごとのページ + caller 数でソートされた api.md |
| `grasp_registry_list` | ヘルスグレード、ファイル/関数数、アクティブセッション ID 付きですべての Brain インデックス済みリポジトリをリスト |
| `grasp_registry_status` | レジストリヘルス: インデックス数、セッション数、グレード分布 |
| `grasp_resolve_receiver` | すべてのクラスメソッドの具体クラスを解決 — Python、JS、Java、Ruby で `self`/`this` が何を指すか |

**Semantic Search, Rename & Routes *(v3.16.0)***

| ツール | 機能 |
|------|-------------|
| `grasp_search` | ハイブリッドセマンティック検索 — Reciprocal Rank Fusion でマージされた BM25 FTS5 + 384D ベクトル埋め込み (Xenova/all-MiniLM-L6-v2)。結果には実行フローでグループ化された `processes[]` を含む。複数リポジトリにまたがる `@groupName` ファンアウトをサポート |
| `grasp_rename` | brain ストアエッジを使用してすべての参照を発見するグラフ対応の全コードベースシンボルリネーム。`apply: false` (デフォルト) はドライラン diff を返し、`apply: true` はディスクに変更を書き込む |
| `grasp_route_map` | HTTP ルート定義 (Express/Fastify/Hono、FastAPI/Flask、Gin) をスキャン — 各ルートをそのハンドラ関数とファイル位置にマップ |
| `grasp_api_impact` | ルートまたはハンドラ名を指定すると、brain グラフエッジを使用してすべての caller、下流サービス、blast radius を返す |
| `grasp_tool_map` | MCP ツール定義 (`server.tool` / `server.registerTool`) と gRPC サービス定義をスキャン — サービス契約マップを返す |
| `grasp_shape_check` | 任意の関数について、brain インデックスからすべてのコールサイトでパラメータ型と戻り値型をトレース; コールサイトの不一致をフラグ |
| `grasp_group_add` | マルチリポジトリ `@groupName` ファンアウト用に `~/.grasp/groups.json` の名前付きグループにリポジトリソースを追加 |
| `grasp_group_list` | `~/.grasp/groups.json` からすべての名前付きグループとそのメンバーリポジトリをリスト |

**Graph Intelligence *(v3.16.0)***

| ツール | 説明 |
|---|---|
| `grasp_graph_schema` | Kuzu schema v2 イントロスペクション — ノード/エッジテーブル定義 (Class、Interface、Method、Constructor + 10 エッジタイプ) とライブ行数 |
| `grasp_type_propagation` | インポートグラフ上の Kahn トポロジカルソートによるクロスファイル型推論; 信頼度 0–1 のトップ推論型を返す |
| `grasp_orm_map` | ORM クエリトラッカー — Prisma、TypeORM、Sequelize、SQLAlchemy; コールサイト、操作、頻度でモデルごとにグループ化された結果 |
| `grasp_detect_changes` | Git diff → シンボル影響: 変更ファイル、影響を受けた関数、影響を受けたプロセスフロー、リスクレベル `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` |
| `grasp_generate_agents_md` | brain セッションから豊富な AGENTS.md を生成 — 機能的コミュニティ、実行プロセス、ヘルスグレード、トップ問題 |
| `grasp_generate_skills` | コミュニティごとの `.claude/skills/generated/<community>.md` ファイル — キーファイル、エントリポイント、クロス領域依存 |

**MCP Resources *(v3.16.0)*** — リソースへの直接アクセス用 8 個のライブ `grasp://` URI: `grasp://repos` · `grasp://setup` · `grasp://repo/{id}/context` · `grasp://repo/{id}/clusters` · `grasp://repo/{id}/processes` · `grasp://repo/{id}/schema` · `grasp://repo/{id}/cluster/{name}` · `grasp://repo/{id}/process/{name}`

**MCP Prompts *(v3.16.0)*** — `detect_impact` (変更 → シンボル → プロセス → リスク → テストスコープ) · `generate_map` (リポジトリ → 解析 → 図 → コミュニティ → wiki)

---

## CI/CD 統合

### GitHub Actions — 自動 PR コメント

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

ワークフローはすべての PR にコメントを投稿および更新します:

| メトリクス | 値 |
|--------|-------|
| **Health Score** | `████████░░` **82/100** |
| **Grade** | 🟢 **A** |
| **Files** | 142 (891 functions) |
| **Architecture Issues** | 3 |
| **Circular Deps** | 0 ✓ |
| **Security** | 0 ✓ |
| **Changed Files** | この PR で 5 個のコードファイル |

### アーキテクチャルール (`grasp.yml`)

```yaml
rules:
  - min_health_score: 70       # スコアが 70 を下回ったら CI を失敗させる
  - max_blast_radius: 20       # 20 個以上に影響するファイルをフラグ
```

ローカルで `grasp . --check` で実行、または [GitHub Actions テンプレート](docs/examples/grasp-check.yml)を使用。

### CLI ベース CI ゲート

```bash
grasp . --report   # grasp-report.json を書き込み、exit 0 = 成功、exit 1 = 失敗
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

完全なエクスポートスキーマは [docs/api-schema.md](docs/api-schema.md) を参照。

### SARIF アップロード (GitHub Code Scanning)

```bash
grasp . --format=sarif   # grasp-results.sarif を書き込み
```

```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: grasp-results.sarif
```

---

## 高度な機能

### ⚡ コマンドパレット
`Cmd+K` (Mac) / `Ctrl+K` (Windows) — ファイル検索、関数へジャンプ、問題へナビゲート。結果を選択するとグラフがそのノードへパンします。

### 🔍 パスファインダー
詳細パネルで 2 つのファイルを選択すると、それらの間の最短依存チェーンを発見します。

### 🏛️ アーキテクチャルールエンジン
カスタム `FORBIDDEN` 依存ルールを定義 (例: `utils → services` は FORBIDDEN)。違反は問題としてフラグされ、セッションを越えて保持されます。

### 📅 履歴 & スナップショット
すべての解析が自動的に保存されます。右パネルの **HISTORY** をクリックして、D3 スパークラインと範囲スライダーで時間経過のヘルススコアを比較。

### 🚫 カスタム無視パターン
`⋯ → 🚫 Ignore Patterns` — ディレクトリ除外を追加 (例: `generated/`、`__mocks__/`)。セッションを越えて保持されます。組み込みデフォルト (`node_modules`、`dist`、`.git`) は削除できません。

### 📤 レポートエクスポート
JSON、Markdown、Plain Text、SVG、SARIF 2.1.0。完全なスキーマは [docs/api-schema.md](docs/api-schema.md) に。

### 🤖 AI コーディングツールサポート
Grasp はすべての主要な AI コーディングツールと MCP 経由で動作します: **Claude Code、Cursor、Cline、Roo Code、Kilo Code、OpenCode、Trae、Grok CLI、Codex CLI、Droid**

ツールごとのセットアップガイドは [`ai-tools/`](./ai-tools/) を参照。

### 🔖 ヘルスバッジ

```markdown
![Grasp Health](https://grasp.ashforde.org/badge/owner/repo.svg)
```

### PR 内の @grasp-bot
任意の PR に `@grasp-bot analyze` とコメント — Grasp が完全なヘルスレポートをインラインで投稿します。

---

## VS Code 拡張機能

> **インストール:** [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest) から `grasp-vscode-3.17.1.vsix` をダウンロードし、VS Code で **Extensions: Install from VSIX…** (`Cmd+Shift+P`) を実行。

- 起動時にワークスペースを自動解析、ファイル保存時に再解析 (2 秒デバウンス)
- ステータスバーがアクティブファイルの `↑ N deps  ↓ M dependents` を表示
- エディタ切り替えごとにアクティブファイルへパン
- セキュリティ問題と arch 違反を **Problems パネル** (波線) に表示
- パネルヘッダーに 4 つのカラーモードボタン: Layer / Folder / Churn / Complexity
- パネルヘッダーにヘルススコアバッジ
- ノードをダブルクリックでエディタ内のファイルを開く
- 任意のファイルを右クリック → **Grasp: Analyze File** で即座に詳細
- 有向リンク: 青 = 発信インポート、緑 = 着信依存者
- 豊富なツールチップ: 複雑度、churn 数、ファイルごとのトップ貢献者

---

## キーボードショートカット

| キー | アクション |
|-----|--------|
| `Enter` | リポジトリを解析 |
| `Cmd+K` / `Ctrl+K` | コマンドパレットを開く |
| `+` / `-` | ズームイン/アウト |
| `Shift+クリック` | 複数ノード選択 |
| `Escape` | モーダル / コマンドパレットを閉じる |
| `T` | テーマを循環 |
| `?` | ヘルプモーダルを開く |

---

## 19 種類のテーマ

ホバーピッカーとクリックで循環できる完全なテーマシステム:

**Dark** · **Light** · **Matrix** · **Amber Terminal** · **Dracula** · **Nord** · **Tokyo Night** · **Catppuccin** · **Gruvbox** · **Obsidian Gold** · **Midnight Diamond** · **Carbon** · **Noir** · **Synthwave** · **Ocean Depth** · **Forest** · **Sunset** · **High Contrast** · **Solarized Light**

テーマ選択はセッションを越えて保持され、Grasp と Team Dashboard で共有されます。

---

## サポート言語

JavaScript · TypeScript · Python · Go · Java · Rust · C · C++ · C# · Ruby · PHP · Swift · Kotlin · Scala · Vue · Svelte · Dart · Elixir · Erlang · Haskell · Lua · R · Julia · Perl · Shell · PowerShell · F# · OCaml · Clojure · Elm · VBA · Groovy · Ada · Zig

---

## GitHub API レート制限

| 認証 | リクエスト/時間 |
|------|--------------|
| トークンなし | 60 |
| Personal Access Token | 5,000 |
| GitHub App | インストールごとに 5,000 |

---

## アーキテクチャ

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

**ブラウザアプリ:** インストール依存ゼロ。React 18、D3.js 7、Babel は CDN から。Tree-sitter WASM 文法は遅延ロードされ、IndexedDB にキャッシュされます。

**MCP サーバー:** Node.js 18+。16 言語にわたる AST ベースの関数抽出と循環的複雑度のためのネイティブ tree-sitter バインディング: Python、Go、Java、Kotlin、Rust、C、C++、C#、Ruby、JavaScript、TypeScript、TSX、Swift、PHP、Scala、Zig。

**Brain ストア:** 2 つの永続ストア — `~/.grasp/brain.db` の SQLite (ファイルメタデータ、結合、セキュリティ) と `~/.grasp/graph/` の Kuzu graph DB (関数コールグラフ、インポート、戻り値型エッジ — Cypher 経由でクエリ可能)。

**IDE 拡張機能:** VS Code (`vscode-extension/`)、JetBrains (`jetbrains-plugin/`)、Zed、Neovim、Vim、Emacs、Eclipse、Continue — すべて同じ MCP サーバーがバックエンド。

**ブラウザ拡張機能:** Chrome、Firefox、Safari (`browser-extension/`、`safari-extension/`) — MV3、GitHub と GitLab ページにフローティング Grasp ボタンを注入。

---

## バージョン & 自動更新

`index.html` と `team-dashboard.html` の両方がフッターに現在のバージョン (`v3.17.1`) を表示します。読み込み時に、新しいリリースを npm レジストリで静かに確認します。見つかった場合、消去可能なトーストが表示されます:

- **Update Now** — GitHub から新しい HTML を取得、ダウンロード、即座に適用
- **Later** — 24 時間スヌーズ

サーバーなし、バックグラウンドプロセスなし。

---

## プライバシー & セキュリティ

**あなたのコードはあなたのマシンに留まります。**

**ブラウザアプリ:**
- ブラウザで 100% 動作 — サーバーもプロキシもなし
- GitHub/GitLab API 呼び出しはあなたのブラウザから直接プロバイダーへ
- トークンは `localStorage` のみに存在 — 選択した Git プロバイダー以外には決して送信されません
- 分析なし、追跡なし、アカウントなし
- アプリ全体が[1 つのオープンソース HTML ファイル](index.html) — 自分で監査してください

**MCP サーバー:**
- サブプロセスとしてローカルで動作 — GitHub/GitLab API 以外の発信接続なし
- テレメトリなし、データ収集なし
- ローカルディレクトリ解析はメモリ内で読み取られ破棄、Brain ストアはあなたのマシンの `~/.grasp/brain.db` に留まる

**サプライチェーン:**
- すべての npm リリースは GitHub Actions OIDC 経由で[SLSA provenance](https://slsa.dev) (Level 2) で署名されている
- すべての Docker イメージ (`ghcr.io/ashfordeou/grasp`) は Cosign keyless 署名で署名され、[Sigstore Rekor](https://rekor.sigstore.dev) 公開台帳に記録されている

インストール前に検証:

```bash
# npm パッケージ
npm install -g @sigstore/verify  # 一度だけ
sigstore verify npm grasp-mcp-server@3.17.1

# Docker イメージ
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/ashfordeou/grasp:v3.17.1
```

---

## 貢献

セットアップ、コード構造、PR チェックリストについては [CONTRIBUTING.md](CONTRIBUTING.md) を参照。

**バグを発見?** [issue を開く](https://github.com/ashfordeOU/grasp/issues)

**言語を追加?** Tree-sitter 文法ソースは `mcp/src/extractors/` にあります — 既存のパターンに従って新しい言語ファイルを作成してください。

**MCP ツールを追加?** 既存の `server.registerTool` パターンに従って `mcp/src/index.ts` で登録。`mcp/tests/` にテストを追加してください。

---

## ライセンス

**Elastic License 2.0** — Copyright (c) 2026 Ashforde OÜ.

使用、変更、セルフホスト自由。Grasp をホスト型またはマネージドサービスとして提供する、著作権表示を削除する、別のブランドで再配布することはできません。完全な条項は [LICENSE](LICENSE) を参照。

---

<div align="center">

**121 MCP ツール · 35 言語 · 11 AI プロバイダー + 200+ モデル · インストール不要 · データ収集ゼロ**

*依存関係グラフ、セキュリティスキャナー、DORA メトリクス、Grasp Brain — コードを書くすべての場所に。*

</div>
