package com.ashforde.grasp

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Settings panel under Settings → Tools → Grasp Architecture.
 */
class GraspSettingsConfigurable : Configurable {

    private var panel: JPanel? = null
    private val cliPathField = JBTextField()
    private val analyzeOnSaveBox = JBCheckBox("Re-analyze on file save")
    private val showStatusBarBox = JBCheckBox("Show health score in status bar")
    private val showInlineBox = JBCheckBox("Show inline annotations for layer violations")

    override fun getDisplayName() = "Grasp Architecture"

    override fun createComponent(): JComponent {
        panel = FormBuilder.createFormBuilder()
            .addLabeledComponent("CLI path:", cliPathField)
            .addComponent(analyzeOnSaveBox)
            .addComponent(showStatusBarBox)
            .addComponent(showInlineBox)
            .addComponentFillVertically(JPanel(), 0)
            .panel
        return panel!!
    }

    override fun isModified(): Boolean {
        val s = GraspSettings.getInstance()
        return cliPathField.text != s.cliPath ||
            analyzeOnSaveBox.isSelected != s.analyzeOnSave ||
            showStatusBarBox.isSelected != s.showStatusBar ||
            showInlineBox.isSelected != s.showInlineAnnotations
    }

    override fun apply() {
        val s = GraspSettings.getInstance()
        s.cliPath = cliPathField.text.trim()
        s.analyzeOnSave = analyzeOnSaveBox.isSelected
        s.showStatusBar = showStatusBarBox.isSelected
        s.showInlineAnnotations = showInlineBox.isSelected
    }

    override fun reset() {
        val s = GraspSettings.getInstance()
        cliPathField.text = s.cliPath
        analyzeOnSaveBox.isSelected = s.analyzeOnSave
        showStatusBarBox.isSelected = s.showStatusBar
        showInlineBox.isSelected = s.showInlineAnnotations
    }

    override fun disposeUIResources() {
        panel = null
    }
}
