package com.ashforde.grasp;

import org.junit.Test;
import static org.junit.Assert.*;

public class GraspViewTest {

    @Test
    public void testPluginId() {
        assertEquals("com.ashforde.grasp", Activator.PLUGIN_ID);
    }

    @Test
    public void testViewId() {
        assertEquals("com.ashforde.grasp.view", GraspView.ID);
    }
}
