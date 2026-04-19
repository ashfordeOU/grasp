package com.ashforde.grasp;

import org.junit.Test;
import static org.junit.Assert.*;

public class GraspBuilderTest {

    @Test
    public void testDefaultThreshold() {
        GraspBuilder builder = new GraspBuilder(null, null);
        assertEquals("D", builder.getThreshold());
    }

    @Test
    public void testCustomThreshold() {
        GraspBuilder builder = new GraspBuilder("A", "org/repo");
        assertEquals("A", builder.getThreshold());
        assertEquals("org/repo", builder.getRepo());
    }
}
