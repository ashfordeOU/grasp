package com.ashforde.grasp

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Unit tests for GraspSettings state logic and resolveCliPath().
 */
class GraspSettingsTest {

    private fun makeSettings(cliPath: String): GraspSettings {
        val s = GraspSettings()
        s.cliPath = cliPath
        return s
    }

    @Test
    fun `resolveCliPath returns blank path as npx grasp`() {
        val s = makeSettings("  ")
        assertEquals("npx grasp", s.resolveCliPath())
    }

    @Test
    fun `resolveCliPath returns name-only path unchanged when not a real file`() {
        val s = makeSettings("grasp")
        assertEquals("grasp", s.resolveCliPath())
    }

    @Test
    fun `resolveCliPath returns existing absolute path unchanged`() {
        val tmp = File.createTempFile("grasp-cli", null)
        tmp.deleteOnExit()
        val s = makeSettings(tmp.absolutePath)
        assertEquals(tmp.absolutePath, s.resolveCliPath())
    }

    @Test
    fun `resolveCliPath returns non-existent absolute path unchanged (assumed on PATH)`() {
        val s = makeSettings("/usr/local/bin/grasp")
        assertEquals("/usr/local/bin/grasp", s.resolveCliPath())
    }

    @Test
    fun `default state values are correct`() {
        val s = GraspSettings()
        assertEquals("grasp", s.cliPath)
        assertTrue(s.analyzeOnSave)
        assertTrue(s.showStatusBar)
        assertTrue(s.showInlineAnnotations)
    }

    @Test
    fun `loadState round-trips through getState`() {
        val s = GraspSettings()
        val loaded = GraspSettings.State(
            cliPath = "/opt/bin/grasp",
            analyzeOnSave = false,
            showStatusBar = false,
            showInlineAnnotations = false,
        )
        s.loadState(loaded)
        assertEquals("/opt/bin/grasp", s.cliPath)
        assertFalse(s.analyzeOnSave)
        assertFalse(s.showStatusBar)
        assertFalse(s.showInlineAnnotations)
        assertEquals(loaded, s.state)
    }
}
