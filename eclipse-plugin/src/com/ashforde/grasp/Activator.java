package com.ashforde.grasp;

import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

public class Activator implements BundleActivator {

    public static final String PLUGIN_ID = "com.ashforde.grasp";
    private static Activator plugin;

    @Override
    public void start(BundleContext context) throws Exception {
        plugin = this;
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        plugin = null;
    }

    public static Activator getDefault() {
        return plugin;
    }
}
