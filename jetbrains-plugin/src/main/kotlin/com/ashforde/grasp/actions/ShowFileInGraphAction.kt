package com.ashforde.grasp.actions

import com.ashforde.grasp.GraspProjectService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.wm.ToolWindowManager

/**
 * "Show in Grasp Graph" action available in the editor context menu.
 * Focuses the Grasp tool window and (when JCEF is loaded) posts a message
 * to the embedded browser to highlight the current file in the graph.
 */
class ShowFileInGraphAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val virtualFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return
        val basePath = project.basePath ?: return

        val relPath = virtualFile.path.removePrefix(basePath).trimStart('/')

        val toolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindow = toolWindowManager.getToolWindow("Grasp") ?: return

        toolWindow.show {
            // Post message to JCEF browser if analysis is done
            val service = GraspProjectService.getInstance(project)
            if (service.state == GraspProjectService.State.DONE) {
                // The embedded browser listens for window.postMessage({ type:'focusFile', path })
                // This is handled by the browser-side JS in index.html
                // We signal via the service so GraspPanel can relay it after the browser loads
                service.focusFileInGraph(relPath)
            }
        }
    }

    override fun update(e: AnActionEvent) {
        val project = e.project
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabled = project != null && file != null && !file.isDirectory
        e.presentation.isVisible = project != null
    }
}
