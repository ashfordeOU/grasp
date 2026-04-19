import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.ashforde.grasp"
version = "3.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    intellijPlatform {
        // Supports IntelliJ IDEA, WebStorm, PyCharm, and all other JetBrains IDEs
        intellijIdeaCommunity("2024.2")
        pluginVerifier()
        zipSigner()
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

intellijPlatform {
    projectName = "grasp"

    pluginConfiguration {
        id = "com.ashforde.grasp"
        name = "Grasp — Code Architecture Visualizer"
        version = "3.1.0"

        description = """
            <p><b>Grasp</b> gives you a live dependency graph, architecture diagram, and health score for your project — directly in your IDE.</p>
            <ul>
              <li>Interactive dependency graph — see how every file connects</li>
              <li>Health score (A–F) with architecture issues highlighted</li>
              <li>Security scanner — hardcoded secrets, injection risks</li>
              <li>Auto-reanalyses on file save (2s debounce)</li>
              <li>Status bar: live dep count for the active file</li>
              <li>Blast radius: highlight everything that breaks if you change a file</li>
            </ul>
            <p>Works with JavaScript, TypeScript, Python, Go, Java, Rust, Kotlin, and 25+ more languages.</p>
        """.trimIndent()

        changeNotes = "<ul><li>v3.1.0: GitLab repository support, pro tier API keys (gsp_ prefix), analysis history store (90-day rolling window), Team Dashboard sparkline + leaderboard, Slack Block Kit interactive digest, Cursor IDE integration</li><li>v3.0.0: hover provider (inline dep count + hotspot indicator), grasp.yml config enforcement, SARIF export, @grasp-bot, live health badge</li></ul>"

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
    }
}

tasks {
    test {
        useJUnitPlatform()
    }
}
