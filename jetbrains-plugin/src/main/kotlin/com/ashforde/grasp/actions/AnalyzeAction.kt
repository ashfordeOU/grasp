package com.ashforde.grasp.actions

import com.ashforde.grasp.GraspProjectService
import com.ashforde.grasp.GraspToolWindowFactory
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

/**
 * "Analyze with Grasp" action — available in Tools menu and via Ctrl+Shift+G.
 * Focuses the Grasp tool window and triggers analysis.
 */
class AnalyzeAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val toolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindow = toolWindowManager.getToolWindow("Grasp")

        // Show and focus the tool window, then trigger analysis
        if (toolWindow != null) {
            toolWindow.show {
                // Trigger analysis via the service directly
                GraspProjectService.getInstance(project).analyze()
            }
        } else {
            // Fallback: just run analysis without showing window
            GraspProjectService.getInstance(project).analyze()
        }
    }

    override fun update(e: AnActionEvent) {
        val project = e.project
        e.presentation.isEnabled = project != null
        e.presentation.isVisible = true
    }
}
