# User request

On page 2, AWARDS and REFERENCES rendered as a 260pt-wide two-column
grid sitting inside the ~301pt Main column. That left ~41pt of empty
space on the right of the grid — the right column of awards /
references ended well before the page-right margin. The user's
schematic (the bottom-half of page 2 split into three equal columns:
sidebar | awards-left | awards-right) makes the intent explicit:
awards and references should fill the entire Main column,
half-and-half, with the divide between the two columns sitting at the
center of Main.

Fix: bump `GRID_COLUMN_WIDTH` from 130 to 150 so the two columns add
up to 300pt (≈ Main width of 301.5pt). Visual gap between content
stays 28pt via the existing left-cell right-padding mechanism.
