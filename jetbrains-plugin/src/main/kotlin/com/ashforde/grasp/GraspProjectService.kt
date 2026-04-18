package com.ashforde.grasp

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * Project-level service that holds the latest Grasp analysis state and
 * runs the CLI in the background when triggered.
 *
 * Subscribers can listen for analysis completion via [addListener].
 */
@Service(Service.Level.PROJECT)
class GraspProjectService(private val project: Project) {

    private val log = thisLogger()

    data class LayerViolation(val fromFile: String, val toFile: String, val fromLayer: String, val toLayer: String)

    data class AnalysisResult(
        val healthScore: Int,
        val healthGrade: String,
        val fileCount: Int,
        val issueCount: Int,
        val circularCount: Int,
        val securityCount: Int,
        val reportPath: String,  // absolute path to grasp-report.json
        val layerViolations: List<LayerViolation> = emptyList(),
        val circularDeps: List<List<String>> = emptyList(),
        val analyzedAt: Long = System.currentTimeMillis(),
    )

    enum class State { IDLE, RUNNING, DONE, ERROR }

    private val _result = AtomicReference<AnalysisResult?>(null)
    private val _state = AtomicReference(State.IDLE)
    private val _error = AtomicReference<String?>(null)
    private val listeners = mutableListOf<(AnalysisResult?) -> Unit>()
    private val focusListeners = mutableListOf<(String) -> Unit>()
    private var analysisJob: Job? = null

    val result: AnalysisResult? get() = _result.get()
    val state: State get() = _state.get()
    val lastError: String? get() = _error.get()

    fun addListener(listener: (AnalysisResult?) -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun removeListener(listener: (AnalysisResult?) -> Unit) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    fun addFocusListener(listener: (String) -> Unit) {
        synchronized(focusListeners) { focusListeners.add(listener) }
    }

    fun focusFileInGraph(relPath: String) {
        synchronized(focusListeners) { focusListeners.toList() }.forEach { it(relPath) }
    }

    /**
     * Run Grasp CLI analysis asynchronously. Cancels any in-progress run first.
     * Calls [onDone] on the EDT with the result (or null on error).
     */
    fun analyze(onDone: ((AnalysisResult?) -> Unit)? = null) {
        analysisJob?.cancel()
        _state.set(State.RUNNING)
        _error.set(null)
        notifyListeners(null)

        analysisJob = CoroutineScope(Dispatchers.IO).launch {
            try {
                val projectDir = project.basePath ?: return@launch
                val reportFile = File(projectDir, "grasp-report.json")
                val settings = GraspSettings.getInstance()

                // Build CLI command
                val cli = settings.resolveCliPath()
                val cmd = listOf(cli, "--report", ".")
                log.info("Grasp: running ${cmd.joinToString(" ")} in $projectDir")

                val proc = ProcessBuilder(cmd)
                    .directory(File(projectDir))
                    .redirectErrorStream(true)
                    .start()

                val exitCode = withTimeout(120_000L) { proc.waitFor() }
                val output = proc.inputStream.bufferedReader().readText()
                log.debug("Grasp CLI output: $output")

                if (exitCode != 0 && !reportFile.exists()) {
                    throw RuntimeException("Grasp CLI exited with $exitCode. Output: ${output.take(500)}")
                }

                // Parse the JSON report
                val parsed = parseReport(reportFile)
                _result.set(parsed)
                _state.set(State.DONE)
                _error.set(null)

                withContext(Dispatchers.Main) {
                    notifyListeners(parsed)
                    onDone?.invoke(parsed)
                }
            } catch (e: CancellationException) {
                _state.set(State.IDLE)
            } catch (e: Exception) {
                log.warn("Grasp analysis failed: ${e.message}", e)
                _state.set(State.ERROR)
                _error.set(e.message)
                withContext(Dispatchers.Main) {
                    notifyListeners(null)
                    onDone?.invoke(null)
                }
            }
        }
    }

    private fun parseReport(file: File): AnalysisResult {
        if (!file.exists()) throw RuntimeException("Report file not found: ${file.path}")
        val text = file.readText()
        // Minimal JSON parsing without external deps
        fun extractInt(key: String): Int {
            val regex = Regex(""""$key"\s*:\s*(\d+)""")
            return regex.find(text)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        }
        fun extractString(key: String): String {
            val regex = Regex(""""$key"\s*:\s*"([^"]+)"""")
            return regex.find(text)?.groupValues?.get(1) ?: ""
        }
        return AnalysisResult(
            healthScore = extractInt("healthScore"),
            healthGrade = extractString("healthGrade").ifBlank { "?" },
            fileCount = extractInt("fileCount"),
            issueCount = extractInt("issueCount"),
            circularCount = extractInt("circularDepCount"),
            securityCount = extractInt("securityIssueCount"),
            reportPath = file.absolutePath,
        )
    }

    private fun notifyListeners(result: AnalysisResult?) {
        synchronized(listeners) { listeners.toList() }.forEach { it(result) }
    }

    companion object {
        fun getInstance(project: Project): GraspProjectService =
            project.getService(GraspProjectService::class.java)
    }
}
