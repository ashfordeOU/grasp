package com.ashforde.grasp

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Icon constants for the Grasp plugin.
 * Icons are loaded from the plugin resources directory.
 */
object GraspIcons {
    /** 13×13 icon used in the tool window stripe. */
    @JvmField
    val ToolWindow: Icon = IconLoader.getIcon("/icons/grasp-toolwindow.svg", GraspIcons::class.java)

    /** 16×16 icon used in the Actions menu. */
    @JvmField
    val Action: Icon = IconLoader.getIcon("/icons/grasp-action.svg", GraspIcons::class.java)
}
