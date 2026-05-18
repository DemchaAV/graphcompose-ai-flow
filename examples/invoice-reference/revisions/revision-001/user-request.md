# User Request

Create an A4 portrait invoice template that reproduces the supplied
reference document. The reference is described in plain English in
[`../../reference/reference.md`](../../reference/reference.md);
treat that description as the authoritative source for the visual
target until the binary `reference.png` is supplied.

The output of this revision should be a maintainable Java template
that consumes a data object (recipient, line items, totals, dates)
and renders an invoice that visually matches the reference: header
with company branding on the left and an `INVOICE` heading on the
right, a soft hero panel showing the total due and due date, a
two-column parties row, a line-items table with a dark navy header
and zebra-striped rows, and a footer with payment instructions and
contact details. Use the GraphCompose 1.6.x skill pack and produce
all the standard revision artifacts (architecture plan, generated
template, test, layout snapshot, visual review, test result, status).
