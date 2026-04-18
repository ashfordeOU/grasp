import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.ashforde.grasp"
version = "1.0.0"

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
        name = "Grasp Architecture"
        version = "1.0.0"

        description = """
            <p>Grasp analyses your codebase architecture directly inside your IDE.</p>
            <ul>
              <li>🗺️ Interactive dependency graph as a tool window</li>
              <li>⚡ Health score (A–F) in the status bar</li>
              <li>🔄 Circular dependency detection with markers</li>
              <li>🔐 Security issue highlighting in the editor</li>
              <li>📦 Unused dependency detection</li>
              <li>🏗️ Layer violation warnings</li>
            </ul>
        """.trimIndent()

        changeNotes = """
            <ul>
              <li>1.0.0: Initial release — dependency graph, health score, security highlighting</li>
            </ul>
        """.trimIndent()

        ideaVersion {
            sinceBuild = "242"
            untilBuild = "243.*"
        }
    }

    signing {
        certificateChainFile = file("chain.crt")
        privateKeyFile = file("private.pem")
    }

    publishing {
        token = System.getenv("PUBLISH_TOKEN") ?: ""
    }
}

tasks {
    test {
        useJUnitPlatform()
    }
}
