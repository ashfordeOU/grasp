import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.ashforde.grasp"
version = "3.3.3"

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
        version = "3.3.3"

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

        changeNotes = "<ul><li>v3.3.3: Self-hosted GitLab support in Chrome extension — paste any gitlab.company.com URL; one-click enable Grasp button on any custom Git host</li><li>v3.3.2: Inline GitHub token input in rate limit dialog — paste a PAT to get 5,000 req/hr instantly, token stored locally in browser, never transmitted</li><li>v3.3.1: Chrome extension popup fixed (MV3 CSP), smart repo detection, polished floating button</li><li>v3.3.0: Full GitLab parity — MCP analysis (churn, ownership, CI status), GitLab bot server (MR comments, webhooks, commit status), tunnel agent for internal instances, Docker self-hosted deploy, OAuth2</li><li>v3.2.1: Jira integration, service graph from OTEL traces, cross-repo search, real-time collaboration, enterprise license keys, multi-LLM provider support (Mistral, Groq, Ollama), Docker Compose self-hosted deploy</li><li>v3.1.2: 48-tool MCP server, full publish pipeline, VS Code + JetBrains + Docker + MCP registry automation</li><li>v3.1.1: Neovim plugin, GitHub Releases with signed artifacts, LICENSE bundled, CI hardening</li><li>v3.1.0: GitLab support, pro tier API keys, analysis history, Team Dashboard, Slack digest, Cursor integration</li></ul>"

        ideaVersion {
            sinceBuild = "242"
            untilBuild = "243.*"
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
