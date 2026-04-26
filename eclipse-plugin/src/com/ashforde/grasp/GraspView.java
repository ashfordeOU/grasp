package com.ashforde.grasp;

import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Label;
import org.eclipse.ui.part.ViewPart;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class GraspView extends ViewPart {

    public static final String ID = "com.ashforde.grasp.view";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Label statusLabel;

    @Override
    public void createPartControl(Composite parent) {
        statusLabel = new Label(parent, SWT.WRAP);
        statusLabel.setText("Grasp — save a source file to trigger analysis.");
    }

    @Override
    public void setFocus() {
        if (statusLabel != null) statusLabel.setFocus();
    }

    /** Called from background Job with raw JSON or error text from the CLI. */
    public void update(String rawJson) {
        if (statusLabel == null || statusLabel.isDisposed()) return;
        String display;
        try {
            JsonNode root = MAPPER.readTree(rawJson);
            JsonNode summary = root.path("summary");
            String grade = summary.path("healthGrade").asText("?");
            int score = summary.path("healthScore").asInt(0);
            int files = summary.path("fileCount").asInt(0);
            int issues = summary.path("issueCount").asInt(0);
            display = String.format("Grasp  Grade: %s  Score: %d/100  Files: %d  Issues: %d",
                grade, score, files, issues);
        } catch (Exception e) {
            display = "Grasp: " + rawJson.lines().findFirst().orElse("unknown error");
        }
        final String text = display;
        statusLabel.getDisplay().asyncExec(() -> {
            if (!statusLabel.isDisposed()) statusLabel.setText(text);
        });
    }

    /** @deprecated Use {@link #update(String)} instead */
    @Deprecated
    public void updateStatus(String status) {
        update(status);
    }
}
