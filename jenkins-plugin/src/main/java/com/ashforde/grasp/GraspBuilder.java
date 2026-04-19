package com.ashforde.grasp;

import hudson.Extension;
import hudson.Launcher;
import hudson.model.AbstractBuild;
import hudson.model.AbstractProject;
import hudson.model.BuildListener;
import hudson.tasks.BuildStepDescriptor;
import hudson.tasks.Builder;
import org.kohsuke.stapler.DataBoundConstructor;

import java.io.IOException;

public class GraspBuilder extends Builder {

    private final String threshold;
    private final String repo;

    @DataBoundConstructor
    public GraspBuilder(String threshold, String repo) {
        this.threshold = threshold != null ? threshold : "D";
        this.repo = repo != null ? repo : "";
    }

    public String getThreshold() {
        return threshold;
    }

    public String getRepo() {
        return repo;
    }

    @Override
    public boolean perform(AbstractBuild<?, ?> build, Launcher launcher, BuildListener listener)
            throws InterruptedException, IOException {
        listener.getLogger().println("[Grasp] Running architecture analysis...");
        listener.getLogger().println("[Grasp] Threshold: " + threshold);

        String repoArg = repo.isEmpty() ? "." : repo;
        int exitCode = launcher.launch()
                .cmds("grasp", "analyze", repoArg, "--threshold", threshold)
                .stdout(listener)
                .pwd(build.getWorkspace())
                .join();

        if (exitCode != 0) {
            listener.getLogger().println("[Grasp] Analysis failed or grade below threshold.");
            return false;
        }
        listener.getLogger().println("[Grasp] Analysis passed.");
        return true;
    }

    @Extension
    public static final class DescriptorImpl extends BuildStepDescriptor<Builder> {

        @Override
        public boolean isApplicable(Class<? extends AbstractProject> jobType) {
            return true;
        }

        @Override
        public String getDisplayName() {
            return "Grasp Architecture Check";
        }
    }
}
