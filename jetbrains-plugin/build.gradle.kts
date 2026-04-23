import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.ashforde.grasp"
version = "3.9.3"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    intellijPlatform {
        // Supports IntelliJ IDEA, WebStorm, PyCharm, and all other JetBrains IDEs
        intellijIdeaCommunity("2024.2")
        pluginVerifier()
        zipSigner()
        instrumentationTools()
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

intellijPlatform {
    projectName = "grasp"

    pluginConfiguration {
        id = "com.ashforde.grasp"
        name = "Grasp - Code Architecture Visualizer"
        version = "3.9.3"

        description = """
            <p><b>Grasp</b> gives you a live dependency graph, architecture diagram, and health score for your project — directly in your IDE.</p>
            <ul>
              <li>Interactive dependency graph — see how every file connects</li>
              <li>Architecture diagram — your codebase by layer (Config → Utils → Services → UI)</li>
              <li>Health score (A–F) — circular deps, security issues, and architecture violations highlighted</li>
              <li>Security scanner — hardcoded secrets, injection risks, dangerous eval()</li>
              <li>Auto-reanalyses on file save (2s debounce)</li>
              <li>Status bar — live dep count and health grade for the active file</li>
              <li>Blast radius — highlight everything that breaks if you change a file</li>
            </ul>
            <p>Works with JavaScript, TypeScript, Python, Go, Java, Rust, Kotlin, and 25+ more languages.</p>
            <p><b>Requires the free Grasp CLI:</b> <code>npm install -g grasp-mcp-server</code></p>
        """.trimIndent()

        changeNotes = "<ul><li>v3.9.3: Grasp Cloud — SQLite persistent session storage (30-day TTL), GitHub OAuth flow, org workspace sync, Stripe Checkout billing redirect, async job queue for analysis, CI webhooks (commit status pending→success on push), cloud Docker Compose deploy</li><li>v3.8.2: ESA Part 2, Phase 2 — Heritage software genealogy overlay (grasp_heritage): heritage coverage %, delta complexity, zero-delta certification shortcut candidates; ICD mapper (grasp_icd): match Interface Control Document entries to code functions, flags unimplemented and undocumented interfaces; Heritage Manifest entry in ⋯ menu</li><li>v3.8.0: Open Source Vertical, Part 3 — Fork divergence analysis with merge blast radius estimation (grasp_fork_diff); OpenSSF Scorecard auto-fetched after GitHub repo analysis; contributor impact score weighted by fan-in of owned files</li><li>v3.7.1: Open Source Vertical, Part 1 — Good first issue generator (grasp_good_first_issues): finds isolated, low-complexity, untested files and generates GitHub issue draft text; GitHub App webhook handler with push + PR event processing; Good First Issues entry in ⋯ menu</li><li>v3.6.2: OS / Kernel Vertical, Part 2 — Patch series blast radius ranking for kernel/OS code review (grasp_patch_impact); Patch Impact entry in ⋯ menu</li><li>v3.6.0: OS / Kernel Vertical, Part 1 — Kernel/OS subsystem boundary map with cross-subsystem dependency detection (grasp_subsystems), ABI/API stability checker: compare exported symbols between sessions, detect breaking changes (grasp_abi_diff); Architecture tab: Subsystems section (shown for C/C++ repos)</li><li>v3.5.2: Finance Vertical + Compliance REST API — PII data flow tracer (grasp_pii_trace), Separation of Duties validator (grasp_duties), Regulatory change impact mapper (grasp_reg_impact), Finance latency hotspot detection (grasp_latency), Financial model risk auditor (grasp_model_risk); HTTP compliance report API on :7332 with /report/sbom|dora|do178c|pii-audit|model-risk endpoints</li><li>v3.4.2: Elastic/Platform vertical — Org-Level Multi-Repo Graph (grasp_org_graph), Breaking API Change Detector (grasp_api_diff), Plugin Extension-Point Map (grasp_plugins), Semantic Versioning Enforcer (grasp_semver); Compare APIs button in Sessions panel</li><li>v3.3.20: Enterprise vertical — SBOM generation (CycloneDX 1.4 / SPDX 2.3), DORA metrics (GitHub API: deployment frequency, lead time, CFR, tier), Technical Debt quantification (~dev-days in Actions tab + health panel), AI-powered ADR generation (MADR format, Claude API or template); grasp_sbom/grasp_dora/grasp_adr MCP tools</li><li>v3.3.17: AI Research vertical part 2 — Training Run Diff (compare two configs JSON/YAML + find affected files), Eval Coverage Map (BFS trace eval scripts coverage), ML Pipeline DAG (detect PyTorch/TF/JAX/HuggingFace stages, data leakage detection); grasp_run_diff and grasp_eval_coverage MCP tools</li><li>v3.3.16: AI Research vertical — Safety Constraint Tracer (mark safety gates + trace ungated paths), Research/Production Boundary Enforcer (boundary rule violations + color mode), Jupyter Notebook support (ipynb parsing, cell extraction, reproducibility checks)</li><li>v3.3.15: ESA vertical part 2 — Anomaly Investigation Mode (callers, callees, blast radius, security chain, JSON export), Software Reuse Assessor (Interface/Dependencies/Security/Architecture compatibility matrix); grasp_anomaly and grasp_reuse MCP tools</li><li>v3.3.14: ESA vertical part 1 — Requirement Traceability (CSV upload, coverage matrix, Compliance tab), MISRA C/C++/Ada safety detection (dynamic memory, goto, recursion, abort/exit), DO-178C certification report (9-section JSON/HTML evidence package); grasp_req_trace MCP tool</li><li>v3.3.13: Pattern suggestions — Patterns tab now shows a Suggested section with high-confidence recommendations (Strategy, Factory, Observer) detected from live file content; suggested patterns show a How-to guidance box; detected patterns show factual descriptions instead of generic advice</li><li>v3.3.12: Fix force graph auto fit-to-view — cancelled flag prevents React cleanup from triggering premature fit; adaptive charge strength prevents node explosion on large repos (213+ nodes now fit at ~0.6x scale instead of 0.045x); node positions reset on re-render</li><li>v3.3.11: Fix auto fit-to-view (tick-based trigger replaces sim.on end which was cancelled by React cleanup); fix fit button broken by incorrect 0.6 minimum scale floor</li><li>v3.3.10: Auto fit-to-view on load for all graph types (force, arch, 3D); minimap enabled by default; larger node radius baseline for better readability at any zoom level</li><li>v3.3.9: Analysis accuracy improvements — eliminated false-positive circular dependencies via import-aware connection filtering; fixed security scanner false positives (console.log in CLI, TODO/FIXME in comment lines only); raised god-file and coupling thresholds; health score now reaches 100/A on well-structured repos</li><li>v3.3.8: Security scanner improvements — eliminated false positives for shell env-var references, documentation files, and self-referential eval() patterns; split integrations CI into two focused workflows</li><li>v3.3.6: Safari extension — available on Mac App Store; macOS 13+, MV3 service worker, shared TS source with Chrome and Firefox builds</li><li>v3.3.5: Firefox extension — available on Firefox Add-ons (AMO); supports GitHub and GitLab, custom hosts, and all existing features</li><li>v3.3.4: Compatibility update — removed until-build restriction to support JetBrains IDE 253 and all future releases</li><li>v3.3.3: Self-hosted GitLab support in Chrome extension — paste any gitlab.company.com URL; one-click enable Grasp button on any custom Git host</li><li>v3.3.2: Inline GitHub token input in rate limit dialog — paste a PAT to get 5,000 req/hr instantly, token stored locally in browser, never transmitted</li><li>v3.3.1: Chrome extension popup fixed (MV3 CSP), smart repo detection, polished floating button</li><li>v3.3.0: Full GitLab parity — MCP analysis (churn, ownership, CI status), GitLab bot server (MR comments, webhooks, commit status), tunnel agent for internal instances, Docker self-hosted deploy, OAuth2</li><li>v3.2.1: Jira integration, service graph from OTEL traces, cross-repo search, real-time collaboration, enterprise license keys, multi-LLM provider support (Mistral, Groq, Ollama), Docker Compose self-hosted deploy</li><li>v3.1.2: 48-tool MCP server, full publish pipeline, VS Code + JetBrains + Docker + MCP registry automation</li><li>v3.1.1: Neovim plugin, GitHub Releases with signed artifacts, LICENSE bundled, CI hardening</li><li>v3.1.0: GitLab support, pro tier API keys, analysis history, Team Dashboard, Slack digest, Cursor integration</li></ul>"

        ideaVersion {
            sinceBuild = "242"
        }
    }

    signing {
        certificateChain = System.getenv("PLUGIN_CERTIFICATE_CHAIN")
        privateKey = System.getenv("PLUGIN_PRIVATE_KEY")
        password = System.getenv("PLUGIN_PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = System.getenv("PUBLISH_TOKEN")
        hidden = false
    }
}

tasks {
    test {
        useJUnitPlatform()
    }
}
