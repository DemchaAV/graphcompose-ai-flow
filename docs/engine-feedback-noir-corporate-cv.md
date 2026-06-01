# Engine Feedback From Noir Corporate CV

This note captures GraphCompose engine/API gaps found while building
`examples/noir-corporate-cv`. It separates real engine work from
template-flow mistakes.

## Not An Engine Gap

Shape-contained content is already supported by the shape container API.
For example, initials inside a circle should be rendered as a child of the
circle:

```java
section.addCircle(118, color, circle -> circle
        .center(label("CV", style)));
```

The earlier `CV` workaround in this flow used a sibling paragraph with a
negative margin. That was a template-flow defect, not a GraphCompose defect.
The flow now requires `ShapeContainer.center(...)`, `position(...)`, or an
equivalent documented shape anchor helper for shape-owned content.

## Engine/API Backlog

1. **LayerStack + row content composition**

   The attempted page-wide top band used a semantic `LayerStack`:

   ```text
   PageSurfaceStack
     layer 0: full-width dark top surface
     layer 1: normal content layer with sidebar/main RowBuilder
   ```

   Render failed because GraphCompose rejected a row inside the stacked
   content layer:

   ```text
   Row 'NoirCorporateCv[0]/PageSurfaceStack[0]/ContentLayer[1]/MainGrid[0]' cannot contain a nested horizontal row; use a section column instead.
   ```

   Desired direction: allow row-based content in layer-stack content layers,
   or provide a page-level background-band API.

2. **Page-level background bands**

   CV, proposal, and portfolio references often use background surfaces that
   cross content-grid boundaries. A declarative API would avoid using content
   rows as background paint:

   ```java
   page.topBand(height, color);
   page.backgroundBand(y, height, color);
   ```

3. **Page capacity tolerance / fill primitives**

   A full A4-height surface hit a small capacity mismatch:

   ```text
   requires outer height 842.0 but page capacity is 841.88977
   ```

   Desired direction: expose actual available page height, add a small
   tolerance for full-page surfaces, or provide `fillPage()` /
   `fillRemainingHeight()` primitives.

4. **Glyph fallback / shape-based glyph primitives**

   The filled circle glyph failed in the active PDF font path:

   ```text
   could not find the glyphId for the character: ?, codePoint: 9679 (0x25CF)
   ```

   Desired direction: glyph preflight, font fallback, or semantic primitives
   such as `inlineDot(...)`, `ratingDots(...)`, and timeline markers rendered
   as shapes instead of font glyphs.

5. **Timeline primitive**

   Work-experience timelines currently require bullets plus
   `LineBuilder.vertical(...)` and margin tuning.

   Desired direction:

   ```java
   section.addTimeline(timeline -> timeline
       .item(marker, connector, content)
       .item(marker, connector, content)
       .item(marker, noConnector, content));
   ```

6. **Heading bar primitive**

   Dark section bars are currently easiest to express as one-cell tables.
   A dedicated section-header primitive would be clearer:

   ```java
   section.headingBar("WORK EXPERIENCE", bar -> bar
       .fill(DARK)
       .padding(...)
       .textAnchor(DocumentTableTextAnchor.CENTER_LEFT));
   ```

7. **Inline horizontal layout**

   Small repeated patterns such as `label + dot meter`, `icon + text`, and
   `marker + title` need a lightweight inline/flex row that is not the same as
   a full nested `RowBuilder`.
