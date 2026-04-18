package com.ashforde.grasp

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent

/**
 * Runs on project open:
 *  1. If analyzeOnSave is enabled, registers a VFS listener that triggers
 *     re-analysis whenever a source file is saved.
 *  2. Optionally kicks off an initial analysis immediately.
 */
class GraspStartupActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        val service = GraspProjectService.getInstance(project)
        val settings = GraspSettings.getInstance()

        // Register file-save listener
        val connection = project.messageBus.connect()
        connection.subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun after(events: List<VFileEvent>) {
                if (!settings.analyzeOnSave) return
                val hasSourceChange = events.any { event ->
                    val path = event.path
                    SOURCE_EXTENSIONS.any { path.endsWith(it) }
                }
                if (hasSourceChange && service.state != GraspProjectService.State.RUNNING) {
                    service.analyze()
                }
            }
        })
    }

    companion object {
        private val SOURCE_EXTENSIONS = setOf(
            ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
            ".py", ".go", ".kt", ".java", ".rs", ".rb",
            ".cs", ".php", ".swift", ".dart"
        )
    }
}
