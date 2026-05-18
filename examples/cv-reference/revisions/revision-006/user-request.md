# User request

Three changes against the approved baseline:

1. References emails were not clickable in revision-005. They have to
   open the default mail client when clicked.
2. The bigger architectural gap: every CV string ("ROSE HARRIS",
   "Sydney, AUS", "Job Title", "John Smith", "Company | 2012", etc.)
   was hard-coded inside `generated-template.java`. A non-Java user
   could not change content without editing source. Lift the content
   out into a separate `cv-data.json` that lives alongside the
   template, define a typed spec record, load it through a spec
   provider — keep the template a pure renderer.
3. Visual transformations like the spaced-uppercase headings
   ("R E F E R E N C E S") were also baked in as literal strings.
   The template must compute that styling from the natural-form data
   strings (`"References"`, `"Rose Harris"`, ...) so editing data
   never produces a styling regression.

The flow has to be end-to-end without breaks: spec → JSON → provider
→ renderer → PDF.
