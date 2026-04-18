package com.ashforde.grasp

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.openapi.application.ApplicationManager
import java.awt.event.MouseEvent

/**
 * Registers the Grasp health-score widget in the IDE status bar.
 */
class GraspStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId() = "GraspHealthWidget"
    override fun getDisplayName() = "Grasp Health Score"
    override fun isAvailable(project: Project) = true
    override fun canBeEnabledOn(statusBar: StatusBar) = true

    override fun createWidget(project: Project): StatusBarWidget =
        GraspHealthWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) = widget.dispose()
}

/**
 * Status bar widget that shows the health score (e.g. "⬡ 87 A") and updates
 * whenever the GraspProjectService completes an analysis.
 */
class GraspHealthWidget(private val project: Project) :
    StatusBarWidget,
    StatusBarWidget.TextPresentation {

    private var statusBar: StatusBar? = null
    private val service = GraspProjectService.getInstance(project)
    private val settings = GraspSettings.getInstance()

    init {
        service.addListener { _ ->
            ApplicationManager.getApplication().invokeLater {
                statusBar?.updateWidget(ID())
            }
        }
    }

    override fun ID() = "GraspHealthWidget"

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun dispose() {
        statusBar = null
    }

    // TextPresentation
    override fun getText(): String {
        if (!settings.showStatusBar) return ""
        return when (service.state) {
            GraspProjectService.State.RUNNING -> "⬡ …"
            GraspProjectService.State.DONE -> {
                val r = service.result ?: return "⬡"
                "⬡ ${r.healthScore} ${r.healthGrade}"
            }
            GraspProjectService.State.ERROR -> "⬡ !"
            else -> "⬡"
        }
    }

    override fun getTooltipText(): String? {
        val r = service.result
        return if (r != null)
            "Grasp: Health ${r.healthScore}/100 (${r.healthGrade}) · ${r.issueCount} issues · ${r.circularCount} circular deps"
        else
            "Grasp: click Analyze to scan this project"
    }

    override fun getAlignment() = 0f  // left-align within widget

    override fun getClickConsumer() = com.intellij.util.Consumer<MouseEvent> {
        // Open the Grasp tool window on click
        val toolWindowManager = com.intellij.openapi.wm.ToolWindowManager.getInstance(project)
        toolWindowManager.getToolWindow("Grasp")?.show()
    }
}
