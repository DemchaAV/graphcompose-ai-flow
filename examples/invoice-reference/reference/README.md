# Reference

The visual reference for this example.

In a real run this folder contains `reference.png` (or `reference.pdf` plus
a rendered preview). The Visual Analyzer Agent reads that image and writes
[`../revisions/revision-001/visual-analysis.md`](../revisions/revision-001/visual-analysis.md).

For the Phase 3 documentation example, the reference image itself is not
shipped. [`reference.md`](reference.md) is a written description of the
same target document so that the example's `visual-analysis.md`,
`architecture-plan.md`, and `generated-template.java` remain reproducible
and reviewable without a binary input.

When a real `reference.png` is added later, the textual description should
remain — it acts as a sanity check that the analyzer agent describes the
same document a human would.
