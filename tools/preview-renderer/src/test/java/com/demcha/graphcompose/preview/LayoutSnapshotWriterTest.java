package com.demcha.graphcompose.preview;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The layout snapshot is the one artifact this renderer produces that is not
 * pixels, and the whole point of it is that it is <em>measured</em> rather than
 * described. That puts two obligations on the writer, and they are what is
 * asserted here.
 *
 * <p>First, it must never cost a render. A GraphCompose without the snapshot API
 * has to keep rendering, because the PDF is the deliverable and the snapshot is
 * diagnostics.</p>
 *
 * <p>Second, it must not describe the payload from a field list written here.
 * Serialisation is driven by the record's own components, so a component the
 * engine adds later — per-page fragment bounds, row weights — appears without a
 * change to this code. A hand-written list would silently omit it, and nothing
 * would notice until someone went looking for a number that was never there.</p>
 */
class LayoutSnapshotWriterTest {

    // Stand-ins for the engine's records. They are shaped like the real ones and
    // loaded from this classloader, which is enough: the writer only ever asks a
    // value for its record components.
    record Insets(double top, double right, double bottom, double left) { }

    record Node(String path, String entityName, int depth, double placementX, Insets padding) { }

    record Snapshot(String formatVersion, int totalPages, List<Node> nodes) { }

    /** A session shaped like {@code DocumentSession}: one no-arg accessor. */
    static class SessionWithSnapshot {
        public Snapshot layoutSnapshot() {
            return new Snapshot("2.0", 1, List.of(
                    new Node("Root/Sidebar", "Sidebar", 1, 17.0, new Insets(24.3, 17, 0, 17))));
        }
    }

    /** A GraphCompose old enough not to have the call at all. */
    static class SessionWithoutSnapshot {
        public void buildPdf() {
        }
    }

    static class SessionReturningNull {
        public Snapshot layoutSnapshot() {
            return null;
        }
    }

    static class SessionThatThrows {
        public Snapshot layoutSnapshot() {
            throw new IllegalStateException("session is closed");
        }
    }

    @Test
    void writesEveryRecordComponentWithoutBeingToldWhatTheyAre() throws Exception {
        String json = LayoutSnapshotWriter
                .capture(new SessionWithSnapshot(), SessionWithSnapshot.class, "2026-08-26T10:00:00Z")
                .orElseThrow();

        assertTrue(json.contains("\"formatVersion\": \"2.0\""), json);
        assertTrue(json.contains("\"totalPages\": 1"), json);
        assertTrue(json.contains("\"path\": \"Root/Sidebar\""), json);
        assertTrue(json.contains("\"entityName\": \"Sidebar\""), json);
        // Nested records are walked, not stringified.
        assertTrue(json.contains("\"padding\""), json);
        assertTrue(json.contains("\"top\": 24.3"), json);
    }

    @Test
    void addsTheTwoFieldsThatBelongToTheHarnessRatherThanTheEngine() throws Exception {
        String json = LayoutSnapshotWriter
                .capture(new SessionWithSnapshot(), SessionWithSnapshot.class, "2026-08-26T10:00:00Z")
                .orElseThrow();

        // Which render produced this file, and which library measured it. A
        // revision folder holds artifacts from more than one pass, and a diff
        // across revisions has to tell a layout change from a library upgrade.
        assertTrue(json.contains("\"capturedAt\": \"2026-08-26T10:00:00Z\""), json);
        assertTrue(json.contains("\"graphComposeVersion\""), json);
        assertTrue(json.endsWith("}\n"), "must end with a single trailing newline");
    }

    @Test
    void numbersAreWrittenSoADiffCanReadThem() throws Exception {
        // Double.toString gives 1.0E-4 for small values and 42.0 for whole ones.
        // The first cannot be compared by eye; the second churns against an
        // integer written by any other producer.
        record Odd(double small, double whole, double negative) { }
        class Session {
            public Odd layoutSnapshot() {
                return new Odd(0.0001, 42.0, -4.35);
            }
        }
        String json = LayoutSnapshotWriter.capture(new Session(), Session.class, "t").orElseThrow();

        assertTrue(json.contains("\"small\": 0.0001"), json);
        assertTrue(json.contains("\"whole\": 42"), json);
        assertTrue(json.contains("\"negative\": -4.35"), json);
        assertFalse(json.contains("E-"), "scientific notation is unreadable in a diff: " + json);
    }

    @Test
    void aGraphComposeWithoutTheApiIsNotAnError() throws Exception {
        // Older pinned lines still render; they simply produce no snapshot.
        assertEquals(Optional.empty(),
                LayoutSnapshotWriter.capture(new SessionWithoutSnapshot(), SessionWithoutSnapshot.class, "t"));
    }

    @Test
    void aNullSnapshotIsAbsenceRatherThanTheStringNull() throws Exception {
        assertEquals(Optional.empty(),
                LayoutSnapshotWriter.capture(new SessionReturningNull(), SessionReturningNull.class, "t"));
    }

    @Test
    void aFailingCallIsRaisedRatherThanSwallowed() {
        // A version difference is empty; a call that exists and breaks is a real
        // defect, and the caller decides whether it costs the render.
        boolean threw = false;
        try {
            LayoutSnapshotWriter.capture(new SessionThatThrows(), SessionThatThrows.class, "t");
        } catch (Exception expected) {
            threw = true;
        }
        assertTrue(threw, "a broken layoutSnapshot() must not read as 'this version has none'");
    }

    @Test
    void anEmptyDocumentIsStillValidJson() throws Exception {
        record Empty(String formatVersion, int totalPages, List<Node> nodes) { }
        class Session {
            public Empty layoutSnapshot() {
                return new Empty("2.0", 0, List.of());
            }
        }
        String json = LayoutSnapshotWriter.capture(new Session(), Session.class, "t").orElseThrow();
        assertTrue(json.contains("\"nodes\": []"), json);
    }

    @Test
    void textIsEscapedSoAQuotedNameCannotBreakTheFile() throws Exception {
        record Named(String entityName) { }
        class Session {
            public Named layoutSnapshot() {
                return new Named("say \"hi\"\nthen\tstop");
            }
        }
        String json = LayoutSnapshotWriter.capture(new Session(), Session.class, "t").orElseThrow();
        assertTrue(json.contains("say \\\"hi\\\"\\nthen\\tstop"), json);
    }
}
