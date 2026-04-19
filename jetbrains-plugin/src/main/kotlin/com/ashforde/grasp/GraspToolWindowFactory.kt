package com.ashforde.grasp

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.openapi.application.ApplicationManager
import javax.swing.*
import java.awt.BorderLayout
import java.awt.FlowLayout

/**
 * Creates the Grasp tool window (right-side panel).
 * Shows the dependency graph via embedded browser (JCEF) when available,
 * with a fallback text panel showing the analysis summary.
 */
class GraspToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val service = GraspProjectService.getInstance(project)
        val panel = GraspPanel(project, service, toolWindow)
        val content = ContentFactory.getInstance().createContent(panel.component, "", false)
        toolWindow.contentManager.addContent(content)
    }

    override fun shouldBeAvailable(project: Project) = true
}

/**
 * Main panel content for the Grasp tool window.
 */
class GraspPanel(
    private val project: Project,
    private val service: GraspProjectService,
    private val toolWindow: ToolWindow,
) {
    val component: JComponent = JPanel(BorderLayout())

    private val headerPanel = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))
    private val analyzeButton = JButton("⟳ Analyze")
    private val statusLabel = JLabel("Not analyzed")
    private val contentPanel = JPanel(BorderLayout())
    private var jcefBrowser: JBCefBrowser? = null

    init {
        // Header bar
        headerPanel.add(analyzeButton)
        headerPanel.add(statusLabel)
        component.add(headerPanel, BorderLayout.NORTH)
        component.add(contentPanel, BorderLayout.CENTER)

        analyzeButton.addActionListener { triggerAnalysis() }

        service.addListener { result ->
            ApplicationManager.getApplication().invokeLater {
                updateUI(result)
            }
        }

        service.addFocusListener { relPath ->
            ApplicationManager.getApplication().invokeLater {
                jcefBrowser?.cefBrowser?.executeJavaScript(
                    "window.postMessage({type:'focusFile',path:'${relPath.replace("'", "\\'")}'},'*');",
                    jcefBrowser?.cefBrowser?.url, 0
                )
            }
        }

        showPlaceholder()
    }

    fun triggerAnalysis() {
        analyzeButton.isEnabled = false
        statusLabel.text = "Analyzing…"
        service.analyze { result ->
            analyzeButton.isEnabled = true
            updateUI(result)
        }
    }

    private fun updateUI(result: GraspProjectService.AnalysisResult?) {
        when (service.state) {
            GraspProjectService.State.RUNNING -> {
                statusLabel.text = "Analyzing…"
                showPlaceholder()
            }
            GraspProjectService.State.DONE -> {
                if (result != null) {
                    statusLabel.text = "Health: ${result.healthScore}/100 (${result.healthGrade})"
                    showGraphOrSummary(result)
                }
            }
            GraspProjectService.State.ERROR -> {
                statusLabel.text = "Error — ${service.lastError?.take(60)}"
                showError(service.lastError ?: "Unknown error")
            }
            else -> {}
        }
    }

    private fun showPlaceholder() {
        contentPanel.removeAll()
        val label = JLabel(
            "<html><div style='text-align:center;padding:40px;'>" +
            "<b style='font-size:24px'>⬡</b><br><br>" +
            "Click <b>Analyze</b> to visualize this project's<br>" +
            "architecture, dependencies, and health score." +
            "</div></html>",
            SwingConstants.CENTER
        )
        contentPanel.add(label, BorderLayout.CENTER)
        contentPanel.revalidate()
        contentPanel.repaint()
    }

    private fun showError(msg: String) {
        contentPanel.removeAll()
        val label = JLabel(
            "<html><div style='padding:20px;color:#ff5f5f;'>" +
            "❌ Analysis failed:<br><code>${msg.take(300)}</code>" +
            "<br><br>Make sure the Grasp CLI is installed:<br><code>npm install -g grasp-mcp-server</code>" +
            "</div></html>"
        )
        contentPanel.add(JBScrollPane(label), BorderLayout.CENTER)
        contentPanel.revalidate()
        contentPanel.repaint()
    }

    private fun showGraphOrSummary(result: GraspProjectService.AnalysisResult) {
        contentPanel.removeAll()

        // Try to embed the Grasp browser UI via JCEF
        val graspUrl = buildGraspUrl(result.reportPath)
        if (graspUrl != null && JBCefApp.isSupported()) {
            val browser = JBCefBrowser(graspUrl)
            jcefBrowser = browser
            contentPanel.add(browser.component, BorderLayout.CENTER)
        } else {
            jcefBrowser = null
            // Fallback: text summary
            contentPanel.add(buildSummaryPanel(result), BorderLayout.CENTER)
        }

        contentPanel.revalidate()
        contentPanel.repaint()
    }

    private fun buildGraspUrl(reportPath: String): String? {
        val reportFile = java.io.File(reportPath)
        if (!reportFile.exists()) return null
        // Find index.html relative to the plugin installation or project
        val projectDir = project.basePath ?: return null
        val candidates = listOf(
            java.io.File(projectDir, "node_modules/.bin/../grasp-mcp-server/index.html"),
            java.io.File(System.getProperty("user.home"), ".npm/_npx/grasp/index.html"),
        )
        val indexHtml = candidates.firstOrNull { it.exists() } ?: return null
        return "file://${indexHtml.absolutePath}?preload=${java.net.URLEncoder.encode(reportPath, "UTF-8")}"
    }

    private fun buildSummaryPanel(result: GraspProjectService.AnalysisResult): JComponent {
        val gradeColor = when {
            result.healthScore >= 80 -> "#22c55e"
            result.healthScore >= 60 -> "#f59e0b"
            else -> "#ff5f5f"
        }
        val html = """
            <html><body style='padding:20px;font-family:monospace;'>
            <h2 style='color:$gradeColor'>${result.healthScore}/100 &nbsp; Grade: ${result.healthGrade}</h2>
            <table style='width:100%;margin-top:12px;border-collapse:collapse;'>
              <tr><td style='color:#888;padding:4px 0;'>Files</td><td>${result.fileCount}</td></tr>
              <tr><td style='color:#888;padding:4px 0;'>Issues</td><td>${result.issueCount}</td></tr>
              <tr><td style='color:#888;padding:4px 0;'>Circular Deps</td><td style='color:${if (result.circularCount > 0) "#ff5f5f" else "#22c55e"}'>${result.circularCount}</td></tr>
              <tr><td style='color:#888;padding:4px 0;'>Security Issues</td><td style='color:${if (result.securityCount > 0) "#ff5f5f" else "#22c55e"}'>${result.securityCount}</td></tr>
              <tr><td style='color:#888;padding:4px 0;'>Report</td><td style='font-size:10px;'>${result.reportPath}</td></tr>
            </table>
            </body></html>
        """.trimIndent()
        return JBScrollPane(JLabel(html))
    }
}
