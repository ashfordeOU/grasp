package com.ashforde.grasp;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IResourceChangeEvent;
import org.eclipse.core.resources.IResourceChangeListener;
import org.eclipse.core.resources.IResourceDelta;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.jobs.Job;
import org.eclipse.ui.IViewPart;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.PlatformUI;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.stream.Collectors;

public class Activator implements BundleActivator {

    public static final String PLUGIN_ID = "com.ashforde.grasp";
    private static final Set<String> CODE_EXTENSIONS = Set.of(
        "java", "ts", "js", "tsx", "jsx", "py", "c", "cpp", "h", "go", "rs"
    );

    private static Activator plugin;
    private IResourceChangeListener listener;

    @Override
    public void start(BundleContext context) throws Exception {
        plugin = this;
        listener = event -> {
            try {
                event.getDelta().accept(delta -> {
                    IResource resource = delta.getResource();
                    if (delta.getKind() == IResourceDelta.CHANGED
                            && (delta.getFlags() & IResourceDelta.CONTENT) != 0
                            && resource instanceof IFile) {
                        String ext = resource.getFileExtension();
                        if (ext != null && CODE_EXTENSIONS.contains(ext)) {
                            String projectPath = resource.getProject()
                                    .getLocation().toOSString();
                            scheduleAnalysis(projectPath);
                        }
                    }
                    return true;
                });
            } catch (CoreException e) {
                // ignore — workspace may be closing
            }
        };
        ResourcesPlugin.getWorkspace().addResourceChangeListener(
            listener, IResourceChangeEvent.POST_CHANGE);
    }

    private void scheduleAnalysis(String projectPath) {
        Job job = new Job("Grasp: analysing " + projectPath) {
            @Override
            protected IStatus run(IProgressMonitor monitor) {
                try {
                    ProcessBuilder pb = new ProcessBuilder(
                        "npx", "grasp-mcp-server", "analyze", projectPath, "--format", "json"
                    );
                    pb.redirectErrorStream(true);
                    Process proc = pb.start();
                    String output;
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
                        output = reader.lines().collect(Collectors.joining("\n"));
                    }
                    int exitCode = proc.waitFor();
                    final String result = exitCode == 0 ? output : "Analysis failed (exit " + exitCode + "): " + output;
                    PlatformUI.getWorkbench().getDisplay().asyncExec(() -> {
                        try {
                            IWorkbenchPage page = PlatformUI.getWorkbench()
                                .getActiveWorkbenchWindow().getActivePage();
                            IViewPart view = page.findView(GraspView.ID);
                            if (view instanceof GraspView graspView) {
                                graspView.update(result);
                            }
                        } catch (Exception ignored) {
                            // view may not be open
                        }
                    });
                } catch (Exception e) {
                    // npx not on PATH or server not installed — silently skip
                }
                return Status.OK_STATUS;
            }
        };
        job.setSystem(true);
        job.schedule();
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        if (listener != null) {
            ResourcesPlugin.getWorkspace().removeResourceChangeListener(listener);
            listener = null;
        }
        plugin = null;
    }

    public static Activator getDefault() {
        return plugin;
    }
}
