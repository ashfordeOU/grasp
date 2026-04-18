package com.ashforde.grasp

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

/**
 * Application-level settings for the Grasp plugin.
 * Stored in grasp.xml inside the IDE config directory.
 */
@State(name = "GraspSettings", storages = [Storage("grasp.xml")])
class GraspSettings : PersistentStateComponent<GraspSettings.State> {

    data class State(
        /** Path to the Grasp CLI. "grasp" resolves via PATH. */
        var cliPath: String = "grasp",
        /** Whether to run analysis automatically on file save. */
        var analyzeOnSave: Boolean = true,
        /** Whether to show the health score in the status bar. */
        var showStatusBar: Boolean = true,
        /** Whether to annotate layer violations inline in the editor. */
        var showInlineAnnotations: Boolean = true,
    )

    private var state = State()

    override fun getState(): State = state
    override fun loadState(s: State) { state = s }

    var cliPath: String
        get() = state.cliPath
        set(v) { state.cliPath = v }

    var analyzeOnSave: Boolean
        get() = state.analyzeOnSave
        set(v) { state.analyzeOnSave = v }

    var showStatusBar: Boolean
        get() = state.showStatusBar
        set(v) { state.showStatusBar = v }

    var showInlineAnnotations: Boolean
        get() = state.showInlineAnnotations
        set(v) { state.showInlineAnnotations = v }

    /**
     * Resolve the effective CLI path, falling back to "npx grasp" if the
     * configured path does not exist as an absolute/relative path.
     */
    fun resolveCliPath(): String {
        val path = cliPath.trim()
        if (path.isBlank()) return "npx grasp"
        // If it looks like an absolute or relative path that exists, use it
        val file = java.io.File(path)
        if (file.exists() && file.isFile) return path
        // Otherwise assume it's on PATH (e.g. "grasp" from npm global install)
        return path
    }

    companion object {
        fun getInstance(): GraspSettings =
            ApplicationManager.getApplication().getService(GraspSettings::class.java)
    }
}
