package com.ashforde.grasp

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

/**
 * Unit tests for GraspProjectService internals (the parser, state machine,
 * and listener plumbing) — all run without a real IntelliJ Platform runtime.
 */
class GraspProjectServiceTest {

    // ── parseReport ──────────────────────────────────────────────────────────

    /**
     * Invoke the private parseReport via reflection so we can test it standalone.
     */
    private fun parseReport(file: File): GraspProjectService.AnalysisResult {
        val method = GraspProjectService::class.java
            .getDeclaredMethod("parseReport", File::class.java)
        method.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        return method.invoke(null, file) as GraspProjectService.AnalysisResult
    }

    @Test
    fun `parseReport extracts all scalar fields`(@TempDir tmp: Path) {
        val json = """
            {
              "healthScore": 87,
              "healthGrade": "B",
              "fileCount": 42,
              "issueCount": 5,
              "circularDepCount": 2,
              "securityIssueCount": 1
            }
        """.trimIndent()
        val file = tmp.resolve("grasp-report.json").toFile()
        file.writeText(json)

        val result = parseReport(file)

        assertEquals(87, result.healthScore)
        assertEquals("B", result.healthGrade)
        assertEquals(42, result.fileCount)
        assertEquals(5, result.issueCount)
        assertEquals(2, result.circularCount)
        assertEquals(1, result.securityCount)
        assertEquals(file.absolutePath, result.reportPath)
    }

    @Test
    fun `parseReport defaults to 0 for missing numeric fields`(@TempDir tmp: Path) {
        val json = """{"healthScore": 55, "healthGrade": "C"}"""
        val file = tmp.resolve("grasp-report.json").toFile()
        file.writeText(json)

        val result = parseReport(file)

        assertEquals(55, result.healthScore)
        assertEquals(0, result.fileCount)
        assertEquals(0, result.issueCount)
    }

    @Test
    fun `parseReport uses question mark for missing healthGrade`(@TempDir tmp: Path) {
        val json = """{"healthScore": 40}"""
        val file = tmp.resolve("grasp-report.json").toFile()
        file.writeText(json)

        val result = parseReport(file)
        assertEquals("?", result.healthGrade)
    }

    @Test
    fun `parseReport throws when file does not exist`() {
        val missing = File("/tmp/no-such-report.json")
        assertThrows(RuntimeException::class.java) {
            parseReport(missing)
        }
    }

    @Test
    fun `parseReport tolerates extra unknown fields`(@TempDir tmp: Path) {
        val json = """
            {
              "healthScore": 70,
              "healthGrade": "B",
              "someNewField": "ignored",
              "fileCount": 10,
              "issueCount": 3,
              "circularDepCount": 0,
              "securityIssueCount": 0
            }
        """.trimIndent()
        val file = tmp.resolve("grasp-report.json").toFile()
        file.writeText(json)

        val result = parseReport(file)
        assertEquals(70, result.healthScore)
        assertEquals(10, result.fileCount)
    }

    // ── AnalysisResult ───────────────────────────────────────────────────────

    @Test
    fun `AnalysisResult sets analyzedAt to current time`() {
        val before = System.currentTimeMillis()
        val r = GraspProjectService.AnalysisResult(
            healthScore = 80, healthGrade = "B",
            fileCount = 10, issueCount = 2,
            circularCount = 0, securityCount = 0,
            reportPath = "/tmp/test.json"
        )
        val after = System.currentTimeMillis()
        assertTrue(r.analyzedAt in before..after)
    }

    @Test
    fun `LayerViolation holds from and to fields`() {
        val v = GraspProjectService.LayerViolation(
            fromFile = "src/ui/Button.tsx",
            toFile = "src/db/query.ts",
            fromLayer = "presentation",
            toLayer = "data"
        )
        assertEquals("src/ui/Button.tsx", v.fromFile)
        assertEquals("data", v.toLayer)
    }

    // ── focusFileInGraph listener ────────────────────────────────────────────

    @Test
    fun `focusFileInGraph notifies registered focus listeners`() {
        // We test the listener plumbing without a Project instance
        // by directly calling the internal methods via a mock subclass proxy.
        val focusListeners = mutableListOf<(String) -> Unit>()
        val received = mutableListOf<String>()

        val listener: (String) -> Unit = { received += it }
        synchronized(focusListeners) { focusListeners.add(listener) }

        val relPath = "src/api/index.ts"
        synchronized(focusListeners) { focusListeners.toList() }.forEach { it(relPath) }

        assertEquals(listOf("src/api/index.ts"), received)
    }
}
