package com.ashforde.grasp;

import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Label;
import org.eclipse.ui.part.ViewPart;

public class GraspView extends ViewPart {

    public static final String ID = "com.ashforde.grasp.view";

    private Label statusLabel;

    @Override
    public void createPartControl(Composite parent) {
        statusLabel = new Label(parent, SWT.WRAP);
        statusLabel.setText("Grasp — Run Tools > Analyze with Grasp to analyse your project.");
    }

    @Override
    public void setFocus() {
        if (statusLabel != null) {
            statusLabel.setFocus();
        }
    }

    public void updateStatus(String status) {
        if (statusLabel != null && !statusLabel.isDisposed()) {
            statusLabel.setText(status);
        }
    }
}
