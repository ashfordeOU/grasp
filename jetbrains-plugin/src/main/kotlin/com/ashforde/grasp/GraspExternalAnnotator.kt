package com.ashforde.grasp

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.ExternalAnnotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFile

/**
 * Annotates files that participate in layer violations or circular dependencies
 * by adding a warning-level gutter/inline marker.
 *
 * Lifecycle: collectInformation → doAnnotate → apply
 */
class GraspExternalAnnotator :
    ExternalAnnotator<GraspExternalAnnotator.FileInfo, GraspExternalAnnotator.Annotations>() {

    data class FileInfo(
        val projectBasePath: String,
        val filePath: String,
        val service: GraspProjectService,
    )

    data class Annotation(val message: String, val range: TextRange)
    data class Annotations(val items: List<Annotation>)

    // Phase 1: gather info on the EDT (fast, no analysis)
    override fun collectInformation(file: PsiFile, editor: Editor, hasErrors: Boolean): FileInfo? {
        val project = file.project
        val basePath = project.basePath ?: return null
        val settings = GraspSettings.getInstance()
        if (!settings.showInlineAnnotations) return null
        return FileInfo(
            projectBasePath = basePath,
            filePath = file.virtualFile?.path ?: return null,
            service = GraspProjectService.getInstance(project),
        )
    }

    // Phase 2: run in background thread (can be slow)
    override fun doAnnotate(info: FileInfo): Annotations {
        val result = info.service.result ?: return Annotations(emptyList())
        if (info.service.state != GraspProjectService.State.DONE) return Annotations(emptyList())

        val relPath = info.filePath.removePrefix(info.projectBasePath).trimStart('/')
        val messages = mutableListOf<String>()

        // Layer violations
        result.layerViolations
            .filter { it.fromFile == relPath || it.toFile == relPath }
            .forEach { v ->
                messages += "Grasp: layer violation — ${v.fromLayer} → ${v.toLayer} (${v.fromFile} → ${v.toFile})"
            }

        // Circular dependencies
        result.circularDeps
            .filter { cycle -> cycle.any { it == relPath } }
            .forEach { cycle ->
                messages += "Grasp: circular dependency — ${cycle.joinToString(" → ")}"
            }

        if (messages.isEmpty()) return Annotations(emptyList())

        // Annotate at the very first character (offset 0) — coarse-grained file-level marker
        return Annotations(messages.map { Annotation(it, TextRange(0, 1)) })
    }

    // Phase 3: apply annotations back on the EDT
    override fun apply(file: PsiFile, annotationResult: Annotations, holder: AnnotationHolder) {
        if (annotationResult.items.isEmpty()) return
        annotationResult.items.forEach { ann ->
            holder.newAnnotation(HighlightSeverity.WARNING, ann.message)
                .range(ann.range)
                .create()
        }
    }
}
