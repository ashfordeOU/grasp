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

**130개 MCP 도구 + 8개 리소스 + 2개 프롬프트 · 35개 언어 · 11개 AI 제공자 + OpenRouter를 통한 200+ 모델 · 10개 그래프 뷰 · 데이터 수집 없음**

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

<a href="https://ashfordeou.github.io/grasp" target="_blank">🌐 브라우저 앱</a> &nbsp;·&nbsp;
<a href="https://www.npmjs.com/package/grasp-mcp-server" target="_blank">📦 MCP 서버</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">🐛 버그 신고</a> &nbsp;·&nbsp;
<a href="https://github.com/ashfordeOU/grasp/issues" target="_blank">✨ 기능 요청</a> &nbsp;·&nbsp;
<a href="https://ashfordeou.github.io/grasp/docs/privacy.html" target="_blank">🔒 개인정보 보호</a>

</div>

---

## v3.18.0의 새로운 기능

| 카테고리 | 추가 사항 |
|----------|-----------|
| **그래프 분석** | `grasp_hub_nodes`, `grasp_bridge_nodes`, `grasp_surprising_connections`, `grasp_knowledge_gaps`, `grasp_suggested_questions` — 차수 중심성, Brandes 매개 중심성, 희귀 교차 레이어 엣지 감지, 격리/미테스트 핫스팟 탐지, 자동 생성 리뷰 질문 |
| **LLM 컨텍스트 도구** | `grasp_minimal_context`(100 토큰 미만 오리엔테이션), `grasp_traverse`(토큰 예산 BFS), `grasp_semantic_search`(함수 시그니처 코사인 유사도), `grasp_apply_refactor`(dry-run 미리보기와 함께 rename 실행) |
| **아키텍처 인텔리전스** | `grasp_architecture_overview` — 커뮤니티 + 허브 + 질문 통합 리포트 |
| **그래프 내보내기** | `grasp_export_graphml`, `grasp_export_cypher`, `grasp_export_obsidian` — yEd/Gephi GraphML, Neo4j CREATE 문, Obsidian Canvas |
| **임포트 리졸버** | TS-config 경로 별칭 해석 (`@/components` → `src/components`), Jedi 스타일 Python 상대 임포트 + `__init__.py` |
| **워크플로우** | Claude Code 슬래시 명령어 (`/grasp:build-graph`, `/grasp:review-delta`, `/grasp:review-pr`), 토큰 감소 평가 하니스 (`scripts/eval-token-reduction.mjs`) |
| **브라우저 UX** | 시도 칩, 토큰 인디케이터, 스냅샷 URL, 두 저장소 비교 모달, 분석 중 레이트 리밋 복구, 모바일 그래프 터치 제스처, 플로팅 키보드 단축키 팝오버, 저장소별 영속화, 확장된 내보내기 메뉴 |
| **i18n** | 현지화된 READMEs — हिन्दी · 日本語 · 한국어 · 简体中文 |

총계: 130개 MCP 도구(이전 121개), 13개 신규 도구, 10개 신규 브라우저 UX, 22개 신규 단위 테스트.

---

## Grasp란?

**Grasp**는 모든 GitHub 또는 GitLab 저장소 — 클라우드 또는 셀프 호스팅 — 또는 로컬 코드베이스를 몇 초 안에 인터랙티브 아키텍처 맵으로 변환합니다. **130개의 MCP 도구**(8개의 Resources 및 2개의 가이드 Prompts 포함)가 전체 분석 엔진을 Claude Code, Cursor 및 모든 MCP 호환 에이전트에 노출합니다.

```
URL 붙여넣기 / 폴더 열기  →  AST 분석 엔진  →  아키텍처 맵 + 130 MCP 도구
```

| | |
|---|---|
| **설치 불필요** | 브라우저에서 100% 실행 — HTML 파일 두 개, 빌드 단계 없음 |
| **데이터 수집 없음** | 코드는 절대 사용자의 컴퓨터를 떠나지 않습니다 |
| **계정 불필요** | URL을 붙여넣고 시작 |
| **오프라인 작동** | 인터넷 없이 로컬 폴더 분석 |
| **35개 언어** | JS/TS, Python, Go, Java, Rust, C/C++, C#, Ruby, Swift, Kotlin, Scala, Dart, Elixir, Erlang, Haskell, OCaml, F#, Clojure, Julia, Lua, R, Perl, Shell, PowerShell, Groovy, Zig, V, Nim, Crystal, VBA, Ada/SPARK, Vue, Svelte, PHP |
| **130개 MCP 도구** | 의존성 그래프, 보안, **OSV.dev SCA 취약점 스캔**, DORA, brain store, Kuzu graph schema v3, communities, ORM tracker, git change impact, 아키텍처 드리프트 감지, 테스트 커버리지 갭 맵, 조직 대시보드, PR impact action, MCP Resources/Prompts, `grasp setup` 에디터 자동 구성 |
| **11개 AI 제공자** *(+ 라우터를 통한 무제한)* | 직접: Anthropic Claude (3개 모델), OpenAI (GPT-4o + o-시리즈), Google Gemini (3), Mistral (2), Groq (3), DeepSeek (chat + reasoner), Ollama (로컬), LM Studio (로컬), 사용자 정의 OpenAI 호환 엔드포인트. 라우터: OpenRouter (slug를 통해 200+ 모델) 및 Together AI (50+ 오픈소스 모델). **대화 중 전환 가능**, **기본적으로 완전히 꺼져 있음** (채팅 패널 닫힘 = 네트워크 호출 없음), **API 키는 `localStorage`에만 저장** — Grasp에는 프록시나 텔레메트리가 없습니다. |
| **10개 그래프 뷰** | Force graph, 3D, arch, treemap, matrix, tree (dendrogram), flow (sankey), bundle, cluster (disjoint), heatmap |
| **Grasp Brain** | SQLite + Kuzu 영구 저장소 — 한 번 인덱싱, 즉시 쿼리. FTS5 + 384D 벡터 임베딩 + Cypher 그래프 쿼리 |
| **공급망 서명됨** | 모든 릴리스에 SLSA Level 2 npm provenance + Cosign keyless Docker 서명 |

---

## 스크린샷

### 🕸️ 의존성 그래프 — 파일이 정확히 어떻게 연결되는지 확인

<img src="docs/screenshots/graph.png" alt="Grasp dependency graph view" width="100%"/>

### 🏛️ 아키텍처 다이어그램 — 레이어별 코드베이스

<img src="docs/screenshots/arch.png" alt="Grasp architecture diagram view" width="100%"/>

### 📦 트리맵 — 라인 수에 따른 파일 크기

<img src="docs/screenshots/treemap.png" alt="Grasp treemap view" width="100%"/>

### 🏢 팀 대시보드 — 모든 저장소의 상태를 한눈에

<img src="docs/screenshots/team-dashboard.png" alt="Grasp team dashboard" width="100%"/>

---

## 빠른 시작

### 옵션 1 — 브라우저 (설정 불필요)

```bash
git clone https://github.com/ashfordeOU/grasp.git
open index.html           # 메인 앱
open team-dashboard.html  # 팀 대시보드
```

빌드 단계 없음. `npm install` 없음. **HTML 파일 두 개.**

### 옵션 2 — CLI

```bash
npm install -g grasp-mcp-server

grasp ./my-project        # 로컬 폴더 분석
grasp facebook/react      # GitHub 저장소 분석
grasp .                   # 현재 디렉토리 분석
grasp . --watch           # 라이브 모드 — 파일 저장 시마다 브라우저 리로드
grasp . --timeline        # 타임 트래블 — 최근 30개 커밋을 스크러버로
grasp . --report          # 터미널 전용 리포트 + JSON 출력
grasp . --format=sarif    # GitHub Code Scanning용 SARIF 내보내기
grasp . --pr-comment      # GitHub PR 댓글 markdown을 stdout에 출력
grasp . --check           # grasp.yml 아키텍처 규칙 적용 (CI 게이트)
```

### 옵션 3 — IDE 확장

| IDE | 설치 |
|-----|---------|
| **VS Code** | [Install (.vsix)](https://github.com/ashfordeOU/grasp/releases/latest) — `grasp-vscode-3.18.0.vsix`를 다운로드하고 **Extensions: Install from VSIX…** (`Cmd+Shift+P`) 실행 |
| **JetBrains** | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) — Settings → Plugins에서 **Grasp** 검색 |
| **Raycast** | [Raycast Store](https://www.raycast.com/ashfordeOU/grasp) — 또는 Raycast 확장 스토어에서 **Grasp** 검색 |
| **Zed** | [Zed Extensions](https://zed.dev/extensions?query=grasp) — 또는 Zed → Extensions에서 **grasp** 검색 |

### 옵션 4 — 브라우저 확장

| 브라우저 | 설치 |
|---------|---------|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) — ID: `grasp@ashforde.org` |
| **Safari** | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) — [사이드로드 지침](#safari-sideload) 참조 |

모든 GitHub 및 GitLab 페이지에 플로팅 **Grasp** 버튼이 나타납니다. 온디맨드 권한 부여를 통해 셀프 호스팅 GitLab, GitHub Enterprise 및 모든 사용자 정의 호스트를 지원합니다.

---

### 배포 채널 한눈에 보기

태그된 모든 릴리스는 모든 채널에 자동으로 게시됩니다:

| 채널 | 상태 | 링크 |
|---------|--------|------|
| **npm** (`grasp-mcp-server`) | [![npm](https://img.shields.io/npm/v/grasp-mcp-server?style=flat-square)](https://www.npmjs.com/package/grasp-mcp-server) | `npm install -g grasp-mcp-server` |
| **MCP Registry** | 등재됨 | [modelcontextprotocol.io](https://mcpregistry.com) |
| **Docker** (`ghcr.io/ashfordeou/grasp`) | [![ghcr](https://img.shields.io/badge/ghcr.io-latest-blue?style=flat-square)](https://github.com/ashfordeOU/grasp/pkgs/container/grasp) | `docker pull ghcr.io/ashfordeou/grasp:latest` |
| **VS Code** | Releases에 `.vsix` | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest) |
| **JetBrains** | Marketplace | [Plugin ID 31362](https://plugins.jetbrains.com/plugin/31362-grasp--code-architecture-visualizer) |
| **Raycast** | Store (PR 제출됨) | [raycast.com/ashfordeOU/grasp](https://www.raycast.com/ashfordeOU/grasp) |
| **Zed** | Extension (PR 제출됨) | [zed.dev/extensions](https://zed.dev/extensions?query=grasp) |
| **Chrome** | Web Store | [CWS listing](https://chromewebstore.google.com/detail/grasp-%E2%80%94-code-architecture/pipmlammandfhfbodllcjolgeolkhapj) |
| **Firefox** | AMO (등재됨) | [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/grasp-code-architecture) |
| **Safari** | 사이드로드 (macOS 13+) | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitLab bot image** | `ghcr.io/ashfordeou/grasp-gitlab-bot` | 릴리스마다 자동 푸시 |
| **GitLab tunnel agent** | Releases에 바이너리 | [GitHub Releases](https://github.com/ashfordeOU/grasp/releases) |
| **GitHub Release** | 서명됨 + 체크섬 | [Releases page](https://github.com/ashfordeOU/grasp/releases) |

### AI 도구 통합 *(어시스턴트가 MCP 또는 확장을 통해 Grasp를 호출)*

| AI 도구 | 설치 방법 | 비고 |
|---------|----------------|-------|
| **Claude Code** | `claude mcp add grasp -- npx -y grasp-mcp-server` | 네이티브 MCP — 130개 도구 + 8개 Resources + 2개 Prompts 모두 |
| **Cursor** | `~/.cursor/mcp.json`에 `grasp-mcp-server` 추가 | 네이티브 MCP |
| **Cline / Roo Code / Kilo Code** | VS Code 설정의 MCP 구성 | 네이티브 MCP |
| **Windsurf** | MCP 구성 | 네이티브 MCP |
| **Codex / OpenCode / Trae / Droid** | MCP 구성 | 네이티브 MCP — `grasp setup`이 모두 자동 구성 |
| **Gemini CLI / Grok CLI** | MCP 구성 | 네이티브 MCP |
| **GitHub Copilot Chat** | `grasp-copilot-extension` 설치 | Copilot이 Copilot Extension API를 통해 Grasp 호출 — 채팅에서 `@grasp` 멘션 |
| **Continue** | `continue-provider` 패키지 | Continue context provider로서의 Grasp |
| **Amazon Q Developer** | `amazon-q-plugin` | Q의 채팅에서 Grasp 노출 |
| **GPT Actions / Custom GPTs** | `gpt-actions` 패키지 | OpenAI Actions schema용 REST로 노출 |
| **Aider / Sweep / 모든 도구** | `grasp-mcp-server` npm 패키지 사용 | 도구 독립 stdio JSON-RPC |

<details>
<summary id="safari-sideload">🧭 Safari 사이드로드 지침</summary>

```bash
curl -sL https://github.com/ashfordeOU/grasp/releases/latest/download/grasp-safari-extension.zip \
  -o /tmp/grasp-safari.zip \
  && unzip -q /tmp/grasp-safari.zip -d /tmp/grasp-safari \
  && mv /tmp/grasp-safari/Grasp.app /Applications/ \
  && open /Applications/Grasp.app
```

그런 다음 Safari에서: **설정 → 확장 → Grasp 활성화**. 표시되지 않으면 먼저 **Safari → 개발 → 서명되지 않은 확장 허용**을 활성화하세요.

</details>

---

## 작동 방식

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

## 시각화

### 그래프 유형

| 뷰 | 설명 |
|------|-------------|
| 🕸️ **Graph** | Force-directed 의존성 그래프 — 드래그, 줌, 다중 선택 |
| 🔮 **3D Graph** | 3차원 force graph — 회전, 팬, 줌 |
| 🏛️ **Arch** | 레이어별 아키텍처 다이어그램 |
| 📦 **Treemap** | 라인 수에 따른 파일 크기, 폴더별 그룹화 |
| 📊 **Matrix** | 모든 의존성을 보여주는 인접 행렬 |
| 🌳 **Tree** | 계층적 클러스터 덴드로그램 |
| 🌊 **Flow** | 폴더 수준 Sankey 의존성 플로우 |
| 🎯 **Bundle** | 호 기반 연결의 원형 레이아웃 |
| 🔮 **Cluster** | 폴더별로 분리된 force 그래프 |

### 색상 모드

| 모드 | 표시 내용 |
|------|---------------|
| 📁 **Folder** | 디렉토리 구조 |
| 🏗️ **Layer** | 아키텍처 레이어 (UI, Services, Utils 등) |
| 🔥 **Churn** | 커밋 빈도 — 빨강 = 가장 많이 변경된 핫스팟 |
| ⚡ **Complexity** | 순환 복잡도 (녹색 → 노랑 → 빨강) |
| 💥 **Blast** | 선택된 파일의 blast radius 영향 |
| 🌊 **Depth** | 최대 중괄호 중첩 깊이 |
| 🔎 **Dup** | 중복 코드 밀도 — 빨강 = 많은 클론 |
| 👤 **Owner** | 최고 기여자 — bus-factor 위험 발견 |
| 🐛 **Issues** | 파일별 연결된 GitHub Issues |
| 🧪 **Coverage** | 테스트 커버리지 — 테스트되지 않은 파일 강조 |
| 📦 **Bundle** | 번들 크기 기여도 |
| 🌐 **API Surface** | 공개 파일 노출 |
| ⚡ **Runtime** | 라이브 트레이스의 실제 호출 빈도 |
| 🔒 **Safety** | 안전 게이트 커버리지 (녹색 = 게이트됨, 빨강 = 게이트되지 않음) |
| 🧪 **Boundary** | 연구/생산 경계 드리프트 |
| 🧪 **Eval Coverage** | eval/test 스크립트의 커버리지 |

---

## 코드 인텔리전스

### 📊 헬스 스코어
데드 코드, 순환 의존성, 결합 메트릭 및 보안 문제를 기반으로 한 즉각적인 **A–F 등급**. 시각적 막대와 함께 점수(0–100)로 표시됩니다.

### 🔐 보안 스캐너
하드코딩된 시크릿 및 API 키, SQL 인젝션 위험, 위험한 `eval()` 사용, 프로덕션에 남겨진 디버그 문장의 자동 감지.

### 🛡️ 의존성 취약점 스캐너 *(v3.17.0)*
모든 분석에서 [OSV.dev](https://osv.dev) 무료 공개 CVE 데이터베이스에 대해 선언된 의존성을 스캔합니다. `package.json` (`package-lock.json` 해석 포함), `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml` (`Cargo.lock` 해석 포함), `pom.xml`을 지원합니다. CVSS 점수와 수정 버전 제안을 포함한 심각도 분류 결과. 우측 패널의 새로운 **VULN** 탭, 새로운 `grasp_vulnerabilities` MCP 도구, 치명적/높음 발견에서 1로 종료하는 새로운 `grasp vulns <path>` CLI(CI 친화적). 헬스 스코어는 치명적당 –5, 높음당 –3을 차감합니다. **100% 클라이언트 측** — OSV 요청은 브라우저에서 OSV.dev로 직접 가며, Grasp 서버를 거치지 않습니다. 24시간 localStorage 캐시; 네트워크 장애 시 조용히 저하됩니다.

### 🧩 패턴 감지
Singleton, Factory, Observer/Event 패턴, React 훅 및 안티패턴 (God Objects, 높은 결합)을 자동으로 식별합니다.

### 💥 Blast Radius 분석
*"이 파일을 변경하면 무엇이 깨질까?"* — 임의의 파일을 선택하면 영향을 받는 모든 다운스트림 파일이 그래프에 강조 표시됩니다.

### 🔥 활동 히트맵
파일을 커밋 빈도로 채색합니다. GitHub 저장소(API를 통해)와 **로컬 저장소**(`git log`을 통해 — 인터넷 불필요) 모두에서 작동합니다.

### 🔎 중복 및 유사성 감지
**Dup** 색상 모드는 정확히 또는 거의 중복된 코드가 있는 파일을 강조 표시합니다. `grasp_similarity` MCP 도구는 타깃 리팩토링을 위한 순위가 매겨진 중복 클러스터를 반환합니다.

### 👥 코드 소유권
git 히스토리에서 파일별 최고 기여자를 라인 백분율 분석과 함께 보여줍니다. GitHub Blame으로 한 번에 점프합니다.

### 📋 PR 영향 분석
PR URL을 붙여넣으면 어떤 파일이 영향을 받는지 확인하고 병합 전 제안된 변경의 blast radius를 계산합니다.

### 💰 기술 부채 정량화
구성 가능한 추정치를 사용하여 모든 아키텍처 문제를 개발자 시간으로 변환합니다 — 순환 의존 = 4h, god 파일 = 16h, 중대 보안 = 8h — 결합 승수 포함. 헬스 패널과 팀 대시보드에 표시됩니다.

### 🔗 공유 가능한 임베드
`⋯ → 🔗 Embed`를 클릭하면 즉시 붙여넣을 수 있는 `<iframe>`, README 배지, React 스니펫 및 직접 링크가 제공됩니다 — 문서, 위키 또는 대시보드에서 라이브 헬스 리포트를 공유합니다.

### 🎯 연결 신뢰도 점수 *(v3.16.0)*
모든 파일 간 연결은 0–1로 점수 매겨집니다: 명시적 정적 import = 1.0, 같은 폴더 = 0.8, 폴더 간 추론 = 0.6, 저빈도 = 0.4. force graph는 신뢰도를 엣지 불투명도로 오버레이합니다 — ⚙ 설정에서 슬라이더를 사용하여 저신뢰도 엣지를 필터링하세요.

### 🔍 그래프 쿼리 모달 *(v3.16.0)*
🔍 도구 모음 버튼을 클릭하면 그래프를 떠나지 않고 브라우저에서 파일, 함수 및 엣지를 검색할 수 있습니다. 매치는 라이브로 업데이트됩니다 — 임의의 파일 결과를 클릭하여 그래프에서 해당 위치로 점프하세요.

### ƒ() 함수 수준 캔버스 *(v3.16.0)*
`ƒ()` 버튼을 토글하여 force graph를 파일 수준에서 함수 수준 노드로 전환하세요 — 개별 함수 호출 관계를 보여주며, 성능을 위해 300개 노드로 제한됩니다.

### 🗄️ DB Coupling 탭 *(v3.16.0)*
우측 패널의 **🗄️ DB** 탭은 ORM 패턴(Django, TypeORM, 원시 SQL)에 대해 파일 콘텐츠를 스캔하여 어떤 파일이 어떤 테이블을 참조하는지 매핑합니다. god 테이블과 고결합 파일을 즉시 발견하세요.

### 🎯 Good First Issues 탭 *(v3.16.0)*
**🎯 GFI** 탭은 격리되고 복잡도가 낮으며 테스트되지 않은 파일을 표면화합니다 — 신규 엔지니어 또는 AI 코딩 에이전트에 이상적인 기여 대상입니다.

### 🔐 PII 감지 및 보안 하위 카테고리 *(v3.16.0)*
Security 탭에 이제 발견 사항을 필터링하기 위한 하위 카테고리 알약 — **ALL / SECRETS / INJECTION / PII / EVAL** — 이 있습니다. PII 알약은 소스 파일에서 이메일, 전화번호, SSN, 신용카드 및 API 키 패턴을 스캔합니다.

### 📸 아키텍처 드리프트 감지 *(v3.17.0)*
코드베이스 아키텍처를 스냅샷하고 시간에 따른 드리프트를 감지합니다 — 자동으로.

```bash
grasp snapshot ./my-project --name before-refactor
# ... 변경 ...
grasp drift ./my-project          # 드리프트가 CRITICAL이면 1로 종료 (CI 친화적)
```

| MCP 도구 | 설명 |
|----------|-------------|
| `grasp_snapshot` | 현재 헬스 스코어, 결합 메트릭, 순환 의존 및 상위 10개 핫스팟을 명명된 스냅샷으로 저장 |
| `grasp_diff_snapshots` | 두 스냅샷 비교 — 헬스 델타, 새로운 순환 의존, 결합이 20% 이상 증가한 파일, 드리프트 수준(STABLE / DEGRADED / CRITICAL) 반환 |

스냅샷은 `~/.grasp/brain.db`에 저장되며 분석 세션 전반에 걸쳐 유지됩니다.

### 🧪 테스트 커버리지 갭 맵 *(v3.17.0)*
프로덕션 사고를 일으킬 가능성이 가장 높은 함수 — 가장 높은 호출 수, 제로 테스트 커버리지 — 를 찾습니다.

```bash
grasp_coverage_gaps  # MCP를 통해 — call_count DESC로 정렬된 uncovered_functions 반환
```

의존성 그래프에 **🧪 Coverage 오버레이** 토글이 추가됩니다 — 미커버 함수는 빨강, 부분 커버는 호박색, 커버됨은 녹색으로 렌더링됩니다. 커버리지는 정적 분석으로 추정됩니다: Grasp는 테스트 파일(`*.test.*`, `*.spec.*`, `test_*`, `*_test.*`)을 감지하고 참조하는 소스 함수를 추적합니다.

| MCP 도구 | 설명 |
|----------|-------------|
| `grasp_coverage_gaps` | `uncovered_functions`(호출 수로 정렬), `risky_uncovered`(높은 churn + 테스트 없음), 디렉토리별 `coverage_by_module`, `overall_coverage_estimate`를 반환 |

### 🏢 조직 수준 대시보드 *(v3.17.0)*
하나의 명령으로 전체 GitHub 조직을 분석합니다:

```bash
grasp org my-github-org --token ghp_xxx --format html   # 자체 포함 HTML 대시보드
grasp org my-github-org --format json                   # CI 소비 가능한 JSON
grasp org my-github-org --format md                     # 위키용 Markdown
```

모든 저장소(최대 500개, 5개 동시) 전반에 걸쳐 헬스 등급, 보안 발견, 가장 churn이 많은 파일 및 언어 분포를 집계합니다. HTML 출력은 Chart.js를 인라인으로 임베드합니다 — 외부 의존성 없음.

| MCP 도구 | 설명 |
|----------|-------------|
| `grasp_org_summary` | 조직의 상위 20개 저장소까지 분석 — 집계 헬스 등급, 등급 분포, 심각도별 총 보안 발견, 상위 churn 파일, 언어 분류 반환 |

### 🤖 PR Impact GitHub Action *(v3.17.0)*
모든 풀 리퀘스트에 자동 아키텍처 영향 분석을 추가합니다:

```yaml
# .github/workflows/grasp-pr-impact.yml
- uses: ashfordeOU/grasp/.github/actions/grasp-pr-impact@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-risk-to-comment: LOW      # LOW / MEDIUM / HIGH / CRITICAL
    fail-on-risk: CRITICAL        # 이 위험 수준에서 CI 검사 실패
```

이 액션은 다음을 보여주는 구조화된 PR 댓글을 게시합니다:
- 색상 코딩이 있는 **위험 배지**(LOW / MEDIUM / HIGH / CRITICAL)
- 함수 수준 blast radius와 함께 변경된 파일
- 영향을 받은 실행 프로세스(스텝 카운트 포함)
- `git blame`에서 제안된 리뷰어(영향을 받은 파일당 상위 2명의 기여자)
- 테스트 커버리지 갭: 어떤 변경된 함수에 그것을 다루는 테스트 파일이 없는지

---

## AI Chat — 15개 제공자

전체 코드베이스를 알고 있는 내장 AI 어시스턴트. *"왜 auth.ts가 핫스팟인가?"*, *"리팩토링하기에 가장 안전한 파일은?"* 또는 *"이 호출 체인의 보안 문제 설명"* — 답변은 라이브 의존성 그래프, 보안 발견 및 아키텍처 레이어를 참조합니다.

| 제공자 | 모델 |
|----------|--------|
| **Anthropic** | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-4o, GPT-4o mini, o3-mini, o1 |
| **Google Gemini** | Gemini 2.0 Flash, 1.5 Pro, 1.5 Flash |
| **Mistral** | Mistral Small, Mistral Large |
| **Groq** | Llama 3.3 70B, 3.1 8B, Gemma 2 9B |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner |
| **OpenRouter** | 모든 모델 slug (한 키로 100+ 모델) |
| **Together AI** | 모든 모델 slug |
| **Ollama** | 로컬 모델 (키 불필요) |
| **LM Studio** | 모든 포트의 로컬 모델 |
| **Custom** | 모든 OpenAI 호환 베이스 URL |

**기능:**
- 다중 턴 대화 메모리 — 페이지 새로고침 간에 `localStorage`에 유지됨
- 선택된 파일 컨텍스트 — 파일 선택 시 레이어, 함수, 복잡도 및 문제가 자동으로 주입됨
- 풍부한 코드베이스 컨텍스트 — 메타데이터가 포함된 상위 80개 파일, 모든 문제, 보안 발견, 순환 의존, 레이어 분류
- 구문 강조된 코드 블록이 있는 Markdown 렌더링
- API 키는 브라우저에만 머무르며, 선택한 제공자 외에는 어디로도 전송되지 않습니다

---

## Grasp Brain — 영구적 아키텍처 인텔리전스 *(v3.16.0)*

Grasp Brain은 함께 작동하는 두 개의 영구 저장소를 결합합니다:

- **SQLite Brain** (`~/.grasp/brain.db`) — 파일 메타데이터, 결합, 보안 및 이슈 인덱스. 함수에 대한 FTS5 전체 텍스트 인덱스와 인-프로세스 384D 벡터 임베딩 저장소(Xenova/all-MiniLM-L6-v2 — 클라우드 의존성 없음)를 포함합니다. 한 번 인덱싱, 즉시 쿼리.
- **Kuzu Graph DB** (`~/.grasp/graph/`) — Cypher 쿼리 지원이 있는 네이티브 그래프 데이터베이스. 전체 함수 호출 그래프, 파일 import 및 타입 관계를 순회 가능한 속성 그래프로 저장합니다.

한 번 인덱싱하면 즉시 쿼리할 수 있습니다 — 재분석 불필요. 모든 함수는 참여하는 실행 프로세스(엔트리 포인트로부터의 BFS)로 태그되므로, 검색 결과에는 플로우별로 매치를 그룹화하는 `processes[]` 필드가 포함됩니다.

### 작동 방식

```
grasp index ./my-project    →  분석이 ~/.grasp/brain.db에 저장됨
grasp context src/api.ts    →  저장된 인덱스에서 즉시 파일 컨텍스트
grasp diff ./my-project     →  저장된 베이스라인과 현재 상태 비교
grasp daemon ./my-project   →  변경 감시, 자동 재인덱스
```

### CLI 하위 명령

```bash
grasp index <path>           # 저장소를 분석하고 brain에 유지
grasp context <src> <file>   # 모든 파일에 대한 풍부한 컨텍스트 가져오기
grasp setup [path]           # Claude Code / Cursor / Windsurf에 훅 설치
grasp diff <path>            # brain 베이스라인과 현재 분석 비교
grasp daemon <path>          # 디렉토리 감시 및 변경 시 자동 재인덱스
grasp drift [path]           # 스냅샷 + 마지막 스냅샷과 diff; CRITICAL에서 1 종료
grasp org <github-org>       # 조직 수준 대시보드 (--format json|html|md --token ghp_xxx)
```

### Ask Grasp — 자연어 아키텍처 쿼리

브라우저 앱(Ask Grasp 패널)과 `grasp_ask` MCP 도구 모두 코드베이스에 대한 평이한 영어 질문을 지원합니다. `grasp_ask`는 구조적 의도를 직접 인식합니다; 개방형 쿼리의 경우 **하이브리드 시맨틱 검색** — Reciprocal Rank Fusion으로 병합된 BM25 전체 텍스트 + 384D 벡터 임베딩 — 으로 폴백합니다.

질문 답변 레이어 없이 순수한 시맨틱 검색을 위해서는 `grasp_search`를 직접 사용하세요 — 결과에는 각 매치가 속하는 실행 플로우를 보여주는 `processes[]` 필드가 포함됩니다.

| 질문 | 얻는 것 |
|----------|--------------|
| *"가장 복잡한 파일은?"* | 순환 복잡도로 순위가 매겨진 파일 |
| *"결합 핫스팟 보여줘"* | 가장 높은 결합 fan-in + fan-out이 있는 파일 |
| *"보안 문제가 있나?"* | 코드베이스 전체의 모든 보안 발견 |
| *"auth.ts의 blast radius는?"* | 전체 전이 영향 목록 |
| *"데이터 액세스를 처리하는 레이어는?"* | 파일 예제와 함께 레이어 분류 |
| *"전체 등급은?"* | 헬스 스코어, 등급, 문제 요약 |
| *"가장 churn이 많은 파일은?"* | 커밋 빈도 순위 |
| *"순환 의존이 있나?"* | 심각도가 있는 사이클 목록 |

### Registry — 모든 인덱싱된 저장소

`grasp_registry_list` 및 `grasp_registry_status`는 전체 Brain 인덱스를 노출합니다:

```bash
# MCP를 통해
grasp_registry_list          # 모든 저장소: 헬스 등급, 파일, 함수, 활성 세션
grasp_registry_status        # 집계: 인덱싱된 수, 세션 수, 등급 분포

# HTTP를 통해 (MCP 서버가 --http로 실행될 때)
curl http://localhost:7332/api/v1/registry
```

팀 대시보드의 **🗂️ Registry 패널**은 로드 시 자동으로 가져옵니다 — session_id 불필요.

### Arch Diff

`grasp diff`(및 `grasp_arch_diff` MCP 도구)는 현재 코드베이스를 저장된 brain 베이스라인과 비교하여 다음을 표면화합니다:
- 등급 저하(악화된 파일: A→B, B→C 등)
- 헬스 스코어 델타
- 베이스라인 이후 도입된 새로운 보안 문제

### 에디터 훅 (`grasp setup`)

저장소에서 `.claude/`, `.cursor/`, `.windsurf/`를 감지하고 모든 액션 전에 AI 코딩 어시스턴트에 코드베이스 컨텍스트를 자동으로 제공하는 pre-tool-use 훅을 설치합니다. 또한 아키텍처 요약과 함께 `CLAUDE.md` 및 `AGENTS.md`를 작성합니다.

---

## 팀 & 협업

### 🏢 팀 대시보드

여러 저장소의 상태를 하나의 뷰에서 추적합니다. 모든 공개(또는 토큰을 사용한 비공개) GitHub 저장소를 추가하여 다음을 확인:

- 헬스 스코어, 등급, 파일, 문제, 순환 의존, 보안 발견, 아키텍처 레이어
- **Pattern count, Env var issues, Feature flag count** — 새로운 v3.13.0 컬럼
- **DORA 메트릭 미니 카드** — 저장소별 Deploy Frequency, Lead Time, Change Fail Rate, MTTR(확장 가능한 행)
- **🗂️ Registry 패널** — 라이브 헬스 등급과 세션 상태가 있는 모든 Brain 인덱싱 저장소
- 커밋 활동(7일 / 30일) 및 CI 상태(✅/❌/⏳)
- 커밋 속도 스파크라인, 개발자-일수 단위의 기술 부채
- 전체 테이블을 **CSV 또는 JSON**으로 내보내기. 📁 Open Folder(File System Access API)로 로컬 폴더 열기.

### 🔄 라이브 팀 협업

Grasp의 CLI는 전체 팀을 위한 실시간 협업 서버를 호스팅합니다:

```bash
npx grasp --host=0.0.0.0 --room-secrets=backend:pass1,frontend:pass2
#   → main app:       http://server-ip:7331/
#   → team dashboard: http://server-ip:7331/dashboard
#   → health check:   http://server-ip:7331/api/health
```

- **WebSocket 동기화** — 워크스페이스 변경이 연결된 모든 팀원에게 즉시 전파
- **명명된 룸** — `?sync_room=backend-team`이 각 팀의 워크스페이스를 격리
- **존재 표시기** — Sync 패널에서 누가 온라인인지 확인
- **공유 링크** — ⎘ Copy team link 또는 👁 Copy read-only link
- **읽기 전용 모드** — 관찰자용 `?readonly=1`
- **암호 보호** — `--room-secrets=room:password`
- **REST API** — `GET /api/health` · `GET /api/rooms` · `GET/PUT /api/workspace/:room`

> **LAN 호스팅:** 동일한 네트워크의 누구나 `http://server-ip:7331/dashboard`에 접근 가능 — 클라우드 불필요.

### 🏢 Monorepo & 워크스페이스 지원

Grasp는 monorepo의 하위 패키지(`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`)를 자동으로 감지합니다. **Workspace** 사이드바를 통해 단일 패키지로 필터링할 수 있습니다 — 모든 그래프, 트리맵 및 메트릭이 즉시 업데이트됩니다.

### ⏮️ 타임 트래블 아키텍처 스크러버

`grasp . --timeline`을 실행하여 마지막 30개의 git 커밋을 스크러버 패널로 로드합니다. 슬라이더를 임의의 커밋으로 드래그 — 변경된 노드가 그래프에서 노란색으로 빛나서 시간에 따라 아키텍처가 어떻게 진화하는지 볼 수 있습니다.

### 📡 라이브 감시 모드

실시간 SSE 동기화가 있는 로컬 개발 서버를 위해 `grasp . --watch`를 실행합니다. 모든 파일 저장이 브라우저 그래프를 자동으로 다시 로드합니다 — 연결되어 있는 동안 `LIVE` 배지가 표시됩니다.

---

## 산업 버티컬

### ✈️ 항공우주 / 안전 중요

| 기능 | 설명 |
|---------|-------------|
| **요구사항 추적성** | 요구사항 CSV 업로드 — Grasp가 `@REQ-NNN` 태그를 스캔하고 커버리지 %, 누락 및 미지정 파일을 보여줍니다. 원클릭 컴플라이언스 매트릭스 내보내기. |
| **MISRA / 안전 모드** | `⋯ → 🔧 Safety Mode` — MISRA C/C++ 및 Ada 위반 감지: init 후 동적 할당, 재귀 호출, `goto`, `abort()`/`exit()`. |
| **DO-178C / ECSS 인증 내보내기** | 원클릭 인증 증거 패키지: 인벤토리, 추적성 매트릭스, 복잡도, MISRA 위반, 보안 발견 — JSON 및 인쇄 가능한 HTML. |
| **이상 조사** | 파일 선택 → 🔍 Anomaly Investigation — caller, callee, 전이 blast radius, 최근 커밋, 호출 경로의 보안, 평이한 영어 요약. |
| **소프트웨어 재사용 평가** | Interface Compatibility, Dependencies, Safety Level, Architecture Fitness, Security, Complexity 전반의 신호등 매트릭스. |
| **교차 언어 호출 그래프** | Ada→C `pragma Import`, Python `ctypes`/`cffi`, JS→WASM 경계. |
| **유산 소프트웨어 계보** | 기원 미션 매니페스트 오버레이, 제로 델타 인증 단축키 식별. |
| **ICD 매퍼** | Interface Control Document 항목을 내보낸 함수에 매칭, 미구현 인터페이스 플래그. |
| **ECSS-E-ST-40C 컴플라이언스** | DI-01, DI-04, DI-07, DI-10, DI-15 컴플라이언스 요구사항 점검. |

### 🧠 AI 연구

| 기능 | 설명 |
|---------|-------------|
| **안전 제약 추적기** | 안전 게이트(필터, 새니타이저) 표시 — 모든 entry→output 경로 추적 및 모든 게이트를 우회하는 경로 플래그. 새로운 **Safety** 색상 모드. |
| **연구/생산 경계** | 연구 vs 생산 폴더 정의 — 연구 코드에서 import하는 생산 파일을 플래그. |
| **Jupyter Notebook 지원** | 의존성 그래프의 `.ipynb` — 코드 셀 추출, import 파싱, 재현성 문제 플래그. |
| **훈련 실행 Diff** | 두 개의 YAML/JSON 구성 업로드 — 하이퍼파라미터 diff 및 변경된 각 키를 읽는 파일 찾기. |
| **Eval 커버리지 맵** | eval 스크립트 자동 감지 및 어떤 model/training 코드를 실행하는지 추적. eval 커버리지가 없는 안전 게이트는 critical로 플래그됩니다. |
| **ML 파이프라인 DAG** | PyTorch, TensorFlow, JAX, HuggingFace 패턴 감지 — Data→Model→Training→Eval→Checkpoint DAG 렌더링. |

### 🏢 엔터프라이즈

| 기능 | 설명 |
|---------|-------------|
| **SBOM 생성** | npm, pip, Cargo, Go modules용 CycloneDX 1.4 또는 SPDX 2.3 JSON. OSV API를 통한 선택적 CVE 강화. |
| **DORA 메트릭** | GitHub Actions의 Deployment Frequency, Lead Time, Change Failure Rate, MTTR. Elite/High/Medium/Low 분류. |
| **AI 기반 ADR 생성** | 코드베이스 컨텍스트 + 선택적 PR diff를 사용한 원클릭 MADR 형식 Architecture Decision Records. |
| **PII 데이터 플로우 추적기** | 사용자 표시 PII 소스 파일에서의 BFS — 모든 다운스트림 소비자 표시. |
| **직무 분리** | 트랜잭션을 시작하고 승인하는 파일 감지 (SOX/FDA 컴플라이언스). |
| **규제 변경 영향** | GDPR/HIPAA/SOX/PCI-DSS 조항 변경에 대한 키워드-에서-blast radius. |
| **금융 / 트레이딩** | 레이턴시 핫스팟 감지 — 블로킹 I/O, GC 압박, 잠금 경합, 루프 내 할당. |
| **금융 모델 위험** | 하드코딩된 매개변수, 누락된 NaN 점검, 제로 가드가 없는 나누기. |

---

## AI 에이전트용 — MCP 서버

Grasp는 전체 분석 엔진을 Claude Code, Cursor 및 모든 MCP 호환 에이전트를 위한 호출 가능한 도구로 노출하는 **Model Context Protocol (MCP) 서버**를 제공합니다.

### 설정

```bash
# 설치
npm install -g grasp-mcp-server

# 또는 설치 없이 실행
npx grasp-mcp-server
```

`~/.claude/claude_mcp_settings.json`에 추가:

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

GitHub 저장소 및 로컬 디렉토리에서 작동합니다. GitLab, Docker 및 셀프 호스팅 옵션은 [`mcp/README.md`](mcp/README.md)를 참조하세요.

### 도구 참조

**Core Analysis**

| 도구 | 기능 |
|------|-------------|
| `grasp_analyze` | 모든 저장소 또는 로컬 경로의 전체 분석 — 후속 쿼리를 위한 `session_id` 반환 |
| `grasp_sessions` | 활성 세션 목록 (7일 유지, 재시작 후에도 살아남음) |
| `grasp_diff` | 두 스냅샷 비교 — 분석 간 무엇이 변했는가? |
| `grasp_watch` | 디렉토리 재분석 및 이전 실행과 diff |
| `grasp_rules_check` | `grasp.yml` 아키텍처 규칙 실행 및 위반 보고 |
| `grasp_config_check` | 아키텍처 규칙에 대한 세션 검증 — 위반 반환 |

**File & Code Intelligence**

| 도구 | 기능 |
|------|-------------|
| `grasp_file_deps` | 이 파일이 의존하는 것은? |
| `grasp_dependents` | 이 파일을 변경하면 무엇이 깨질까? |
| `grasp_cycles` | 순환 의존이 있는가? |
| `grasp_architecture` | 이 코드베이스에는 어떤 레이어가 있는가? |
| `grasp_hotspots` | 건드리기 가장 위험한 파일은? |
| `grasp_metrics` | 파일별 라인, 복잡도, fan-in/fan-out |
| `grasp_find_path` | 파일 A는 파일 B와 어떻게 연결되는가? |
| `grasp_patterns` | 어떤 디자인 패턴이 사용 중인가? |
| `grasp_unused` | 데드 코드 — 정의되었지만 호출되지 않음 |
| `grasp_explain` | 모든 파일 또는 함수의 평이한 영어 설명 |
| `grasp_refactor` | 파일 또는 세션에 대한 단계별 리팩토 계획 |
| `grasp_suggest` | 효과 대비 노력 비율로 순위가 매겨진 리팩토 제안 |
| `grasp_onboard` | 코드베이스 영역에 들어오는 신규 엔지니어를 위한 정렬된 읽기 경로 |
| `grasp_types` | 타입 어노테이션 커버리지 — 타입이 부족한 high fan-in 파일 우선순위화 |
| `grasp_similarity` | 순위가 매겨진 중복 클러스터 및 코드 클론 그룹 |
| `grasp_stale` | 활성이지만 버려진 파일 — 낮은 churn, high fan-in, 테스트 대응물 없음 |
| `grasp_change_risk` | 변경된 파일 세트에 대한 위험 점수 0–100 |

**Security & Compliance**

| 도구 | 기능 |
|------|-------------|
| `grasp_security` | 하드코딩된 시크릿, 인젝션 위험, 위험한 패턴 |
| `grasp_sbom` | CycloneDX 1.4 또는 SPDX 2.3 JSON의 SBOM |
| `grasp_sarif` | GitHub Code Scanning용 SARIF 2.1.0 내보내기 |
| `grasp_license` | 의존성 라이선스 — copyleft 및 알 수 없음 플래그 |
| `grasp_pii_trace` | PII 소스 파일에서 모든 소비자로의 BFS 추적 |
| `grasp_duties` | 직무 분리 — 시작하고 승인하는 파일 |
| `grasp_reg_impact` | 규제 변경 blast radius (GDPR/HIPAA/SOX/PCI-DSS) |
| `grasp_env_vars` | 모든 env var 읽기 — 미문서화 및 테스트 전용 변수 플래그 |
| `grasp_feature_flags` | 모든 feature flag 읽기 (LaunchDarkly, GrowthBook, env-var 플래그) |

**Team & DevOps**

| 도구 | 기능 |
|------|-------------|
| `grasp_pr_comment` | 변경 파일에 대한 blast radius가 있는 PR 헬스 댓글 생성 |
| `grasp_pr_review` | 고심각도 라인에서 GitHub PR에 인라인 리뷰 댓글 게시 |
| `grasp_commits` | 최근 7일 및 30일 커밋 수 |
| `grasp_ci_status` | 최신 GitHub Actions 실행 — passing/failing/in-progress |
| `grasp_dora` | DORA 메트릭 — Deployment Frequency, Lead Time, CFR, MTTR |
| `grasp_adr` | AI 기반 MADR 형식 Architecture Decision Record |
| `grasp_embed` | 공유용 iframe, README 배지, React 스니펫 생성 |
| `grasp_timeline` | 커밋별 변경 파일 + co-change 매트릭스가 있는 마지막 N 커밋 |
| `grasp_contributors` | 파일별 소유권, bus-factor, 최고 기여자 |
| `grasp_coverage` | 테스트 커버리지 오버레이 — 어떤 파일에 테스트가 없는가? |
| `grasp_issues` | GitHub Issues를 언급하는 파일에 매핑 |
| `grasp_jira_issues` | 프로젝트 키를 통해 Jira 이슈를 소스 파일에 매핑 |
| `grasp_service_graph` | OTEL / 사용자 정의 추적 JSON에서 서비스 수준 의존성 그래프 |
| `grasp_deps_dev` | deps.dev를 통한 에코시스템 의존자 — 이 저장소에 의존하는 패키지 수 |

**Brain / Intelligence** *(v3.16.0)*

| 도구 | 기능 |
|------|-------------|
| `grasp_brain_index` | 저장소 분석 및 로컬 SQLite brain에 유지 |
| `grasp_brain_status` | brain에 무엇이 인덱싱되어 있고 언제? |
| `grasp_context` | 풍부한 파일 컨텍스트 — 레이어, 복잡도, 결합, 보안, 의존자, 의존성 |
| `grasp_arch_diff` | brain 베이스라인과 현재 상태 비교 — 저하 감지 |
| `grasp_ask` | 아키텍처에 대해 자연어 질문 |

**Graph Core** *(Kuzu — v3.16.0)*

| 도구 | 기능 |
|------|-------------|
| `graph_query` | 영구 함수/파일 호출 그래프에 대해 읽기 전용 Cypher 쿼리 실행 |
| `call_chain` | 임의의 함수에 대한 caller 및 callee 체인을 구성 가능한 깊이까지 추적 |
| `type_propagation` | 동일한 반환 타입을 공유하는 모든 함수와 호출 인접 항목 찾기 |
| `function_graph` | 임의의 명명된 함수를 중심으로 한 Mermaid / DOT / JSON 서브그래프 렌더링 |

**Advanced Analysis**

| 도구 | 기능 |
|------|-------------|
| `grasp_dead_packages` | `package.json`에 있지만 import되지 않는 npm deps |
| `grasp_runtime_calls` | 라이브 런타임 추적을 정적 엣지와 병합 — 실제 hot 경로 |
| `grasp_db_coupling` | ORM/SQL-에서-테이블 결합 맵 — god 테이블, 고결합 파일 |
| `grasp_migration_plan` | 패키지/모듈 교체를 위한 위상 정렬된 단계적 계획 |
| `grasp_api_surface` | OpenAPI, GraphQL, Express/FastAPI 라우트의 통합 API 표면 |
| `grasp_events` | 이벤트 emitter와 subscriber — 고립된 emit, 유령 subscription |
| `grasp_perf` | N+1 쿼리, 동기 I/O, 루프 내 JSON 직렬화 |
| `grasp_bundle` | 번들 크기 트리맵 — 크기 카테고리별 가장 큰 파일 |
| `grasp_dep_impact` | 모든 파일에 걸친 의존성 업그레이드의 영향 |
| `grasp_cross_repo` | 두 세션 비교 — 공유 파일, 분기된 함수 |
| `grasp_diagram` | 의존성 그래프에서 Mermaid 플로우차트 또는 C4 다이어그램 생성 |

**Aerospace / Safety-Critical Vertical**

| 도구 | 기능 |
|------|-------------|
| `grasp_req_trace` | 요구사항 추적성 — CSV에 대해 `@REQ-NNN` 태그 스캔 |
| `grasp_anomaly` | 이상 조사 — BFS blast radius, 호출 체인의 보안, 평이한 영어 요약 |
| `grasp_reuse` | 소프트웨어 재사용 평가 — Red/Amber/Green 호환성 매트릭스 |
| `grasp_safety_trace` | 안전 제약 추적기 — 모든 안전 게이트를 우회하는 경로 찾기 |
| `grasp_multilang` | 교차 언어 호출 그래프 (Ada→C, Python→C, JS→WASM) |
| `grasp_heritage` | 유산 소프트웨어 계보 — 제로 델타 인증 단축키 |
| `grasp_icd` | ICD 매퍼 — Interface Control Document 항목을 코드에 매칭 |
| `grasp_ecss` | ECSS-E-ST-40C 컴플라이언스 검사기 (DI-01, DI-04, DI-07, DI-10, DI-15) |

**AI Research Vertical**

| 도구 | 기능 |
|------|-------------|
| `grasp_run_diff` | 훈련 실행 diff — 변경된 하이퍼파라미터 및 영향을 받은 코드 |
| `grasp_eval_coverage` | eval 커버리지 맵 — eval 커버리지가 없는 안전 게이트가 critical로 플래그됨 |

**Multi-Repo / Platform**

| 도구 | 기능 |
|------|-------------|
| `grasp_org_graph` | 저장소 간 엣지가 있는 조직 수준 다중 저장소 의존성 그래프 |
| `grasp_api_diff` | 호환성 깨는 API 변경 감지기 — 제거/변경된 내보낸 심볼 |
| `grasp_plugins` | 확장 포인트 맵 — 플러그인 인터페이스, 훅 포인트, 전략 패턴 |
| `grasp_semver` | 시맨틱 버저닝 강제 — 변경 세트에 대한 semver bump 검증 |
| `grasp_abi_diff` | ABI/API 안정성 검사기 — 안정성 점수 0–100 |
| `grasp_subsystems` | 커널/OS 서브시스템 경계 맵 |
| `grasp_kconfig` | Kconfig/빌드 시간 조건부 분석 — CONFIG_* 사용 맵 |
| `grasp_irq` | IRQ/인터럽트 의존성 그래프 — 핸들러의 블로킹 호출, 할당 |
| `grasp_patch_impact` | 패치 시리즈 영향 분석기 — blast radius + 복잡도로 패치 순위 매기기 |
| `grasp_good_first_issues` | Good first issue 생성기 — 격리된, 낮은 복잡도, 테스트되지 않은 파일 |
| `grasp_api_stability` | 두 세션 간 API 안정성 점수 (0–100) |
| `grasp_fork_diff` | 포크 분기 분석 — 분기/동일/포크 전용 파일 |
| `grasp_latency` | 금융/트레이딩 레이턴시 핫스팟 감지 |
| `grasp_model_risk` | 금융 모델 위험 감사 |

**Code Intelligence *(v3.16.0)***

| 도구 | 기능 |
|------|-------------|
| `grasp_diff_symbols` | `git diff` 헝크를 함수에 매핑 — 병합 전 PR의 blast radius |
| `grasp_exec_flow` | STEP_IN_PROCESS 엣지 + Mermaid 차트가 있는 임의의 엔트리 포인트에서의 BFS 실행 플로우 |
| `grasp_skillmd` | 분석 세션에서 자동 생성된 `SKILL.md` / `CLAUDE.md` 스니펫 |
| `grasp_hooks` | `.claude/settings.json` PostToolUse 훅 + `.cursor/rules/grasp.mdc` 생성 |
| `grasp_mro` | 메서드 해결 순서 — C3 선형화 (Python), Ruby/Java 계층용 MRO |
| `grasp_communities` | Leiden/Louvain 커뮤니티 감지 — 경계가 있는 컨텍스트 및 마이크로서비스 후보 식별 |
| `grasp_contracts` | 다중 저장소 계약 분석 — 제공자 내보내기 vs 소비자 사용, 위반 + 커버리지 % |

**Analysis Intelligence *(v3.16.0)***

| 도구 | 기능 |
|------|-------------|
| `grasp_confidence` | 모든 파일 간 연결을 0–1로 점수화 (명시적 import=1.0, 같은 폴더=0.8, 폴더 간=0.6, 저빈도=0.4) |
| `grasp_wiki` | markdown 위키 자동 생성: index.md + 폴더별 페이지 + caller 수로 정렬된 api.md |
| `grasp_registry_list` | 헬스 등급, 파일/함수 수, 활성 세션 ID와 함께 모든 Brain 인덱싱 저장소 목록 |
| `grasp_registry_status` | 레지스트리 상태: 인덱싱 수, 세션 수, 등급 분포 |
| `grasp_resolve_receiver` | 모든 클래스 메서드에 대한 구체 클래스 해결 — Python, JS, Java, Ruby에서 `self`/`this`가 가리키는 것 |

**Semantic Search, Rename & Routes *(v3.16.0)***

| 도구 | 기능 |
|------|-------------|
| `grasp_search` | 하이브리드 시맨틱 검색 — Reciprocal Rank Fusion으로 병합된 BM25 FTS5 + 384D 벡터 임베딩 (Xenova/all-MiniLM-L6-v2). 결과에는 실행 플로우로 그룹화된 `processes[]` 포함. 여러 저장소에 걸친 `@groupName` 팬아웃 지원 |
| `grasp_rename` | 모든 참조를 찾기 위해 brain store 엣지를 사용하는 그래프 인식 전체 코드베이스 심볼 이름 변경. `apply: false` (기본값)는 dry-run diff 반환; `apply: true`는 디스크에 변경 사항 작성 |
| `grasp_route_map` | HTTP 라우트 정의 (Express/Fastify/Hono, FastAPI/Flask, Gin) 스캔 — 각 라우트를 파일 위치와 함께 핸들러 함수에 매핑 |
| `grasp_api_impact` | 라우트 또는 핸들러 이름이 주어지면 brain 그래프 엣지를 사용하여 모든 caller, 다운스트림 서비스 및 blast radius 반환 |
| `grasp_tool_map` | MCP 도구 정의 (`server.tool` / `server.registerTool`) 및 gRPC 서비스 정의 스캔 — 서비스 계약 맵 반환 |
| `grasp_shape_check` | 임의의 함수에 대해 brain 인덱스에서 모든 호출 사이트의 매개변수 타입 및 반환 타입 추적; 호출 사이트 불일치 플래그 |
| `grasp_group_add` | 다중 저장소 `@groupName` 팬아웃을 위해 `~/.grasp/groups.json`의 명명된 그룹에 저장소 소스 추가 |
| `grasp_group_list` | `~/.grasp/groups.json`에서 모든 명명된 그룹 및 멤버 저장소 목록 |

**Graph Intelligence *(v3.16.0)***

| 도구 | 설명 |
|---|---|
| `grasp_graph_schema` | Kuzu schema v3 인트로스펙션 — 노드/엣지 테이블 정의 (File, Function, Class, Interface, Method, Constructor, TestFile + TESTS와 COVERS를 포함한 12개 엣지 타입)와 라이브 행 수 |
| `grasp_type_propagation` | import 그래프의 Kahn 위상 정렬을 통한 파일 간 타입 추론; 신뢰도 0–1의 상위 추론 타입 반환 |
| `grasp_orm_map` | ORM 쿼리 추적기 — Prisma, TypeORM, Sequelize, SQLAlchemy; 호출 사이트, 작업, 빈도와 함께 모델별로 그룹화된 결과 |
| `grasp_detect_changes` | Git diff → 심볼 영향: 변경 파일, 영향받은 함수, 영향받은 프로세스 플로우, 위험 수준 `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` |
| `grasp_generate_agents_md` | brain 세션에서 풍부한 AGENTS.md 생성 — 기능적 커뮤니티, 실행 프로세스, 헬스 등급, 상위 문제 |
| `grasp_generate_skills` | 커뮤니티별 `.claude/skills/generated/<community>.md` 파일 — 키 파일, 엔트리 포인트, 영역 간 deps |

**MCP Resources *(v3.16.0)*** — 직접 리소스 액세스를 위한 8개의 라이브 `grasp://` URI: `grasp://repos` · `grasp://setup` · `grasp://repo/{id}/context` · `grasp://repo/{id}/clusters` · `grasp://repo/{id}/processes` · `grasp://repo/{id}/schema` · `grasp://repo/{id}/cluster/{name}` · `grasp://repo/{id}/process/{name}`

**MCP Prompts *(v3.16.0)*** — `detect_impact` (변경 → 심볼 → 프로세스 → 위험 → 테스트 범위) · `generate_map` (저장소 → 분석 → 다이어그램 → 커뮤니티 → 위키)

---

## CI/CD 통합

### GitHub Actions — 자동 PR 댓글

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

워크플로우는 모든 PR에 댓글을 게시하고 업데이트합니다:

| 메트릭 | 값 |
|--------|-------|
| **Health Score** | `████████░░` **82/100** |
| **Grade** | 🟢 **A** |
| **Files** | 142 (891 functions) |
| **Architecture Issues** | 3 |
| **Circular Deps** | 0 ✓ |
| **Security** | 0 ✓ |
| **Changed Files** | 이 PR의 코드 파일 5개 |

### 아키텍처 규칙 (`grasp.yml`)

```yaml
rules:
  - min_health_score: 70       # 점수가 70 미만으로 떨어지면 CI 실패
  - max_blast_radius: 20       # 20개 이상에 영향을 미치는 모든 파일을 플래그
```

로컬에서 `grasp . --check`로 실행하거나 [GitHub Actions 템플릿](docs/examples/grasp-check.yml)을 사용하세요.

### CLI 기반 CI 게이트

```bash
grasp . --report   # grasp-report.json 작성, exit 0 = 통과, exit 1 = 실패
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

전체 내보내기 스키마는 [docs/api-schema.md](docs/api-schema.md)를 참조하세요.

### SARIF 업로드 (GitHub Code Scanning)

```bash
grasp . --format=sarif   # grasp-results.sarif 작성
```

```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: grasp-results.sarif
```

---

## 고급 기능

### ⚡ 명령 팔레트
`Cmd+K` (Mac) / `Ctrl+K` (Windows) — 파일 검색, 함수로 이동, 문제로 탐색. 결과를 선택하면 그래프가 해당 노드로 팬됩니다.

### 🔍 경로 찾기
세부 정보 패널에서 두 파일을 선택하여 그들 사이의 가장 짧은 의존 체인을 찾습니다.

### 🏛️ 아키텍처 규칙 엔진
사용자 정의 `FORBIDDEN` 의존 규칙 정의 (예: `utils → services`는 FORBIDDEN). 위반은 문제로 플래그되고 세션 전반에 걸쳐 유지됩니다.

### 📅 히스토리 & 스냅샷
모든 분석은 자동으로 저장됩니다. 우측 패널에서 **HISTORY**를 클릭하면 D3 스파크라인 및 범위 슬라이더로 시간 경과에 따른 헬스 스코어를 비교할 수 있습니다.

### 🚫 사용자 정의 무시 패턴
`⋯ → 🚫 Ignore Patterns` — 디렉토리 제외 추가 (예: `generated/`, `__mocks__/`). 세션 전반에 걸쳐 유지됩니다. 내장 기본값(`node_modules`, `dist`, `.git`)은 제거할 수 없습니다.

### 📤 리포트 내보내기
JSON, Markdown, Plain Text, SVG, SARIF 2.1.0. 전체 스키마는 [docs/api-schema.md](docs/api-schema.md)에 있습니다.

### 🤖 AI 코딩 도구 지원
Grasp는 모든 주요 AI 코딩 도구와 MCP를 통해 작동합니다: **Claude Code, Cursor, Cline, Roo Code, Kilo Code, OpenCode, Trae, Grok CLI, Codex CLI, Droid**

도구별 설정 가이드는 [`ai-tools/`](./ai-tools/)를 참조하세요.

### 🔖 헬스 배지

```markdown
![Grasp Health](https://grasp.ashforde.org/badge/owner/repo.svg)
```

### PR의 @grasp-bot
모든 PR에 `@grasp-bot analyze` 댓글 — Grasp가 인라인으로 전체 헬스 리포트를 게시합니다.

---

## VS Code 확장

> **설치:** [GitHub Releases](https://github.com/ashfordeOU/grasp/releases/latest)에서 `grasp-vscode-3.18.0.vsix`를 다운로드하고 VS Code에서 **Extensions: Install from VSIX…** (`Cmd+Shift+P`)를 실행하세요.

- 시작 시 워크스페이스 자동 분석, 파일 저장 시 재분석 (2초 디바운스)
- 상태 표시줄에 활성 파일에 대한 `↑ N deps  ↓ M dependents` 표시
- 모든 에디터 전환에서 활성 파일로 팬
- 보안 문제 및 arch 위반을 **Problems 패널** (구불구불한 선)에 표시
- 패널 헤더에 4개의 색상 모드 버튼: Layer / Folder / Churn / Complexity
- 패널 헤더의 헬스 스코어 배지
- 모든 노드를 더블 클릭하여 에디터에서 파일 열기
- 모든 파일 우클릭 → **Grasp: Analyze File**로 즉시 세부 정보
- 방향 링크: 파랑 = 발신 import, 녹색 = 수신 의존자
- 풍부한 툴팁: 복잡도, churn 수, 파일별 최고 기여자

---

## 키보드 단축키

| 키 | 동작 |
|-----|--------|
| `Enter` | 저장소 분석 |
| `Cmd+K` / `Ctrl+K` | 명령 팔레트 열기 |
| `+` / `-` | 줌 인/아웃 |
| `Shift+클릭` | 다중 노드 선택 |
| `Escape` | 모달 / 명령 팔레트 닫기 |
| `T` | 테마 순환 |
| `?` | 도움말 모달 열기 |

---

## 19개 테마

호버 피커 및 클릭하여 순환할 수 있는 전체 테마 시스템:

**Dark** · **Light** · **Matrix** · **Amber Terminal** · **Dracula** · **Nord** · **Tokyo Night** · **Catppuccin** · **Gruvbox** · **Obsidian Gold** · **Midnight Diamond** · **Carbon** · **Noir** · **Synthwave** · **Ocean Depth** · **Forest** · **Sunset** · **High Contrast** · **Solarized Light**

테마 선택은 세션 전반에 걸쳐 유지되며 Grasp와 Team Dashboard 간에 공유됩니다.

---

## 지원 언어

JavaScript · TypeScript · Python · Go · Java · Rust · C · C++ · C# · Ruby · PHP · Swift · Kotlin · Scala · Vue · Svelte · Dart · Elixir · Erlang · Haskell · Lua · R · Julia · Perl · Shell · PowerShell · F# · OCaml · Clojure · Elm · VBA · Groovy · Ada · Zig

---

## GitHub API 속도 제한

| 인증 | 시간당 요청 |
|------|--------------|
| 토큰 없음 | 60 |
| Personal Access Token | 5,000 |
| GitHub App | 설치당 5,000 |

---

## 아키텍처

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
│                              │  Kuzu  —  Schema v3                  │   │
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

**브라우저 앱:** 설치할 의존성 제로. React 18, D3.js 7, CDN의 Babel. Tree-sitter WASM 문법은 지연 로드되며 IndexedDB에 캐시됩니다.

**MCP 서버:** Node.js 18+. 16개 언어에 걸친 AST 기반 함수 추출 및 순환 복잡도를 위한 네이티브 tree-sitter 바인딩: Python, Go, Java, Kotlin, Rust, C, C++, C#, Ruby, JavaScript, TypeScript, TSX, Swift, PHP, Scala, Zig.

**Brain store:** 두 개의 영구 저장소 — `~/.grasp/brain.db`의 SQLite (파일 메타데이터, 결합, 보안)와 `~/.grasp/graph/`의 Kuzu graph DB (함수 호출 그래프, import, 반환 타입 엣지 — Cypher를 통해 쿼리 가능).

**IDE 확장:** VS Code (`vscode-extension/`), JetBrains (`jetbrains-plugin/`), Zed, Neovim, Vim, Emacs, Eclipse, Continue — 모두 동일한 MCP 서버에 의해 백업됨.

**브라우저 확장:** Chrome, Firefox, Safari (`browser-extension/`, `safari-extension/`) — MV3, GitHub 및 GitLab 페이지에 플로팅 Grasp 버튼 주입.

---

## 버전 & 자동 업데이트

`index.html`과 `team-dashboard.html` 모두 푸터에 현재 버전(`v3.18.0`)을 표시합니다. 로드 시 npm 레지스트리에서 새 릴리스를 조용히 확인합니다. 발견되면 해제 가능한 토스트가 나타납니다:

- **Update Now** — GitHub에서 새 HTML을 가져와 다운로드하고 즉시 적용
- **Later** — 24시간 동안 스누즈

서버 없음, 백그라운드 프로세스 없음.

---

## 개인정보 보호 & 보안

**코드는 사용자의 컴퓨터에 머무릅니다.**

**브라우저 앱:**
- 브라우저에서 100% 실행 — 서버 없음, 프록시 없음
- GitHub/GitLab API 호출은 브라우저에서 제공자로 직접 이동
- 토큰은 `localStorage`에만 존재 — 선택한 Git 제공자 외에는 어디에도 전송되지 않음
- 분석 없음, 추적 없음, 계정 없음
- 전체 앱은 [하나의 오픈 소스 HTML 파일](index.html) — 직접 감사하세요

**MCP 서버:**
- 하위 프로세스로 로컬 실행 — GitHub/GitLab API 외에는 발신 연결 없음
- 텔레메트리 없음, 데이터 수집 없음
- 로컬 디렉토리 분석은 메모리에서 읽고 폐기됨; Brain store는 사용자의 `~/.grasp/brain.db`에 머무름

**공급망:**
- 모든 npm 릴리스는 GitHub Actions OIDC를 통해 [SLSA provenance](https://slsa.dev) (Level 2)로 서명됨
- 모든 Docker 이미지(`ghcr.io/ashfordeou/grasp`)는 Cosign keyless 서명으로 서명되며 [Sigstore Rekor](https://rekor.sigstore.dev) 공개 원장에 기록됨

설치 전 검증:

```bash
# npm 패키지
npm install -g @sigstore/verify  # 일회성
sigstore verify npm grasp-mcp-server@3.18.0

# Docker 이미지
cosign verify \
  --certificate-identity-regexp="https://github.com/ashfordeOU/grasp/.github/workflows/publish.yml" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/ashfordeou/grasp:v3.18.0
```

---

## 기여

설정, 코드 구조 및 PR 체크리스트는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

**버그를 발견하셨나요?** [이슈 열기](https://github.com/ashfordeOU/grasp/issues)

**언어 추가?** Tree-sitter 문법 소스는 `mcp/src/extractors/`에 있습니다 — 새 언어 파일에 대한 기존 패턴을 따르세요.

**MCP 도구 추가?** 기존 `server.registerTool` 패턴에 따라 `mcp/src/index.ts`에 등록하세요. `mcp/tests/`에 테스트를 추가하세요.

---

## 라이선스

**Elastic License 2.0** — Copyright (c) 2026 Ashforde OÜ.

사용, 수정 및 셀프 호스팅 무료. Grasp를 호스팅 또는 관리 서비스로 제공하거나, 저작권 표시를 제거하거나, 다른 브랜드로 재배포할 수 없습니다. 전체 조건은 [LICENSE](LICENSE)를 참조하세요.

---

<div align="center">

**130개 MCP 도구 · 35개 언어 · 11개 AI 제공자 + 200+ 모델 · 설치 불필요 · 데이터 수집 없음**

*의존성 그래프, 보안 스캐너, DORA 메트릭 및 Grasp Brain — 코드를 작성하는 모든 곳에서.*

</div>
