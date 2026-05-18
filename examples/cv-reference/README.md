# Example: cv-reference

A two-page resume/CV template example created from the supplied reference
screenshots.

## Status

`revision-002` is the current renderable draft. It turns the reference into a
semantic GraphCompose template with two pages, a centered title header,
two-column page grids, mint section headings, contact/profile/experience
blocks, full-width mint header rule, measured skill bars, awards, social
links, and references.

The draft is not pixel-perfect yet. It is the baseline that future
revisions can improve.

## Re-render Locally

```powershell
node ..\..\scripts\render-cv-reference.mjs revision-002
```

Outputs:

```text
examples/cv-reference/revisions/revision-002/output.pdf
examples/cv-reference/revisions/revision-002/output.png
examples/cv-reference/revisions/revision-002/output-page-2.png
```

## Layout

```text
examples/cv-reference/
  README.md
  template-project.json
  reference/
    reference.png
    reference-page-1.png
    reference-page-2.png
    reference.md
  render-runner/
    pom.xml
  revisions/
    revision-001/
    revision-002/
```
