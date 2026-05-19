package com.demcha.examples.cv;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.image.DocumentImageData;
import com.demcha.compose.document.image.DocumentImageFitMode;
import com.demcha.compose.document.node.DocumentLinkOptions;
import com.demcha.compose.document.node.InlineImageAlignment;
import com.demcha.compose.document.node.ParagraphNode;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.document.table.DocumentTableCell;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.font.FontName;

import com.demcha.examples.cv.MintEditorialCvSpec.Award;
import com.demcha.examples.cv.MintEditorialCvSpec.ContactEntry;
import com.demcha.examples.cv.MintEditorialCvSpec.EducationEntry;
import com.demcha.examples.cv.MintEditorialCvSpec.ExperienceEntry;
import com.demcha.examples.cv.MintEditorialCvSpec.Reference;
import com.demcha.examples.cv.MintEditorialCvSpec.Skill;
import com.demcha.examples.cv.MintEditorialCvSpec.SocialLink;

/**
 * "Mint Editorial CV" — revision-006 of the canonical CV reference template.
 *
 * <p>Diff vs revision-005 (approved revision-004 + clickable social links):
 * every piece of variable content has moved out of the Java source into
 * {@code cv-data.json} alongside the template. The compose method now takes a
 * {@link MintEditorialCvSpec} that {@link MintEditorialCvSpecProvider} loads
 * via Jackson at render time; the template is a pure renderer.</p>
 *
 * <p>The {@link #letterSpace(String)} helper turns the data-side natural-form
 * strings ({@code "Rose Harris"}, {@code "Contact"}, {@code "Awards"}) into
 * the spaced-uppercase form the reference uses
 * ({@code "R O S E  H A R R I S"}, {@code "C O N T A C T"},
 * {@code "A W A R D S"}). Visual transformations live in the template; data
 * carries the readable form.</p>
 *
 * <p>Reference emails are now wrapped in {@code mailto:} links —
 * {@code Reference#emailLink()} produces the URI when the spec entry has a
 * non-blank {@code email} field.</p>
 */
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

    /**
     * Per-token icon spec mirrored from {@code assets-manifest.json}. The
     * point sizes match the manifest's {@code pointSize} field — the
     * Template Coder agent keeps these in sync.
     */
    private static final Map<String, IconSpec> ICONS = Map.ofEntries(
            Map.entry("phone",           new IconSpec("phone.png",            9.0)),
            Map.entry("email",           new IconSpec("email.png",            9.0)),
            Map.entry("location",        new IconSpec("location.png",         9.0)),
            Map.entry("website",         new IconSpec("website.png",          9.0)),
            Map.entry("twitter",         new IconSpec("twitter.png",         13.0)),
            Map.entry("facebook",        new IconSpec("facebook.png",        13.0)),
            Map.entry("pinterest",       new IconSpec("pinterest.png",       13.0)),
            Map.entry("linkedin",        new IconSpec("linkedin.png",        13.0)),
            Map.entry("expertise-badge", new IconSpec("expertise-badge.png", 38.0)));

    private static final FontName HEADING_FONT = FontName.POPPINS;
    private static final FontName BODY_FONT = FontName.POPPINS;

    private static final DocumentColor ACCENT = DocumentColor.rgb(139, 207, 190);
    private static final DocumentColor BLACK = DocumentColor.rgb(24, 24, 24);
    private static final DocumentColor MUTED = DocumentColor.rgb(82, 82, 82);
    private static final DocumentColor RULE = DocumentColor.rgb(70, 70, 70);

    private static final double PAGE_MARGIN_TOP = 54.0;
    private static final double PAGE_MARGIN_SIDE = 52.0;
    private static final double PAGE_MARGIN_BOTTOM = 38.0;
    private static final double PAGE_GAP = 32.0;
    private static final double COLUMN_GAP = 54.0;
    private static final double FULL_PAGE_WIDTH = 595.0;
    private static final double SIDEBAR_WIDTH = 136.0;
    private static final double SKILL_BAR_WIDTH = SIDEBAR_WIDTH;
    private static final double SKILL_MARKER_HEIGHT = 8.0;
    // Awards / References render as a 2-column TableBuilder inside the Main
    // section of PageTwoGrid. The Main inner width = 0.69 * (FULL_PAGE_WIDTH
    // - 2*PAGE_MARGIN_SIDE - COLUMN_GAP) = 0.69 * 437 ≈ 301.5pt. Splitting
    // that exactly in half ⇒ each grid column = ~150pt. The 28pt visual gap
    // between the two columns is taken from the left column's
    // right-padding inside the cell, so the table itself spans the full
    // Main width with the divide sitting at the half-point.
    private static final double GRID_COLUMN_WIDTH = 150.0;
    private static final double GRID_COLUMN_GAP = 28.0;

    private record IconSpec(String fileName, double pointSize) {
    }

    /**
     * Compose the CV from the supplied spec. Every visible string in the PDF
     * traces back to a field in {@code spec}; the template only owns layout,
     * theme tokens, and the spaced-uppercase styling rule.
     *
     * @param document active GraphCompose document session
     * @param spec     content spec loaded from {@code cv-data.json}
     */
    public void compose(DocumentSession document, MintEditorialCvSpec spec) {
        Objects.requireNonNull(document, "document");
        Objects.requireNonNull(spec, "spec");

        document.pageFlow(page -> page
                .name("MintEditorialCv")
                .padding(new DocumentInsets(
                        PAGE_MARGIN_TOP,
                        PAGE_MARGIN_SIDE,
                        PAGE_MARGIN_BOTTOM,
                        PAGE_MARGIN_SIDE))
                .spacing(PAGE_GAP)
                .addSection("Header", section -> renderHeader(section, spec))
                .addLine(line -> line
                        .name("HeaderRule")
                        .horizontal(FULL_PAGE_WIDTH)
                        .thickness(6)
                        .color(ACCENT)
                        .margin(new DocumentInsets(
                                18,
                                -PAGE_MARGIN_SIDE,
                                28,
                                -PAGE_MARGIN_SIDE)))
                .addRow("PageOneGrid", row -> renderPageOne(row, spec))
                .addPageBreak(pageBreak -> pageBreak.name("PageTwo"))
                .addRow("PageTwoGrid", row -> renderPageTwo(row, spec)));
    }

    private void renderHeader(SectionBuilder section, MintEditorialCvSpec spec) {
        section.spacing(8)
                .addParagraph(p -> p
                        .text(letterSpace(spec.header().name()))
                        .textStyle(style(30, BLACK, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text(letterSpace(spec.header().title()))
                        .textStyle(style(9, ACCENT, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()));
    }

    private void renderPageOne(RowBuilder row, MintEditorialCvSpec spec) {
        row.spacing(COLUMN_GAP);
        row.weights(0.31, 0.69);
        row.addSection("Sidebar", section -> section
                .spacing(26)
                .addSection("Contact",   inner -> renderContact(inner, spec))
                .addSection("Interests", inner -> renderInterests(inner, spec))
                .addSection("Education", inner -> renderEducation(inner, spec)));
        row.addSection("Main", section -> section
                .spacing(30)
                .addSection("Profile",    inner -> renderProfile(inner, spec))
                .addSection("Experience", inner -> renderExperience(inner, spec.experiencePage1())));
    }

    private void renderPageTwo(RowBuilder row, MintEditorialCvSpec spec) {
        row.spacing(COLUMN_GAP);
        row.weights(0.31, 0.69);
        row.addSection("Sidebar", section -> section
                .spacing(25)
                .addSection("Expertise", inner -> renderExpertise(inner, spec))
                .addSection("Skills",    inner -> renderSkills(inner, spec))
                .addSection("Social",    inner -> renderSocial(inner, spec)));
        row.addSection("Main", section -> section
                .spacing(29)
                .addSection("Experience",  inner -> renderExperience(inner, spec.experiencePage2()))
                .addSection("Awards",      inner -> renderAwards(inner, spec))
                .addSection("References",  inner -> renderReferences(inner, spec)));
    }

    private void renderContact(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Contact");
        for (ContactEntry entry : spec.contact()) {
            iconLine(section, entry.icon(), entry.value(),
                    entry.linkUrl().map(DocumentLinkOptions::new).orElse(null));
        }
    }

    private void renderInterests(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Interests");
        for (String entry : spec.interests()) {
            label(section, entry);
        }
    }

    private void renderEducation(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Education");
        for (EducationEntry entry : spec.education()) {
            educationItem(section, entry);
        }
    }

    private void renderProfile(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Profile");
        body(section, spec.profile());
    }

    private void renderExperience(SectionBuilder section, List<ExperienceEntry> entries) {
        heading(section, "Experience");
        for (ExperienceEntry entry : entries) {
            experienceItem(section, entry);
        }
    }

    private void renderExpertise(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Expertise");
        IconSpec badge = ICONS.get("expertise-badge");
        section.addImage(image -> image
                .name("ExpertiseBadge")
                .source(ICONS_DIR.resolve(badge.fileName()))
                .size(badge.pointSize(), badge.pointSize())
                .fitMode(DocumentImageFitMode.CONTAIN)
                .margin(new DocumentInsets(0, 0, 20, 0)));
        for (String entry : spec.expertise()) {
            label(section, entry);
        }
    }

    private void renderSkills(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Skills");
        for (Skill skill : spec.skills()) {
            skill(section, skill.name(), skill.level());
        }
    }

    private void renderSocial(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Social");
        for (SocialLink link : spec.social()) {
            iconLine(section, link.icon(), link.label(),
                    link.linkUrl().map(DocumentLinkOptions::new).orElse(null));
        }
    }

    private void renderAwards(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "Awards");
        List<Award> entries = spec.awards();
        if (entries.isEmpty()) {
            return;
        }
        DocumentTableStyle labelLeft       = cellStyle(labelStyle(), 4, GRID_COLUMN_GAP);
        DocumentTableStyle labelRight      = cellStyle(labelStyle(), 4, 0);
        DocumentTableStyle subLeftInner    = cellStyle(smallStyle(), 18, GRID_COLUMN_GAP);
        DocumentTableStyle subRightInner   = cellStyle(smallStyle(), 18, 0);
        DocumentTableStyle subLeftLast     = cellStyle(smallStyle(), 0, GRID_COLUMN_GAP);
        DocumentTableStyle subRightLast    = cellStyle(smallStyle(), 0, 0);

        section.addTable(table -> {
            table.name("AwardsGrid")
                    .columns(DocumentTableColumn.fixed(GRID_COLUMN_WIDTH),
                             DocumentTableColumn.fixed(GRID_COLUMN_WIDTH))
                    .padding(DocumentInsets.zero())
                    .margin(DocumentInsets.zero());

            int pairs = (entries.size() + 1) / 2;
            for (int pairIndex = 0; pairIndex < pairs; pairIndex++) {
                Award left = entries.get(pairIndex * 2);
                Award right = pairIndex * 2 + 1 < entries.size()
                        ? entries.get(pairIndex * 2 + 1)
                        : null;
                boolean lastPair = pairIndex == pairs - 1;
                table.rowCells(
                        gridText(letterSpace(left.name()), labelLeft),
                        gridText(right == null ? "" : letterSpace(right.name()), labelRight));
                table.rowCells(
                        gridText(left.meta(), lastPair ? subLeftLast : subLeftInner),
                        gridText(right == null ? "" : right.meta(),
                                lastPair ? subRightLast : subRightInner));
            }
        });
    }

    private void renderReferences(SectionBuilder section, MintEditorialCvSpec spec) {
        heading(section, "References");
        List<Reference> entries = spec.references();
        if (entries.isEmpty()) {
            return;
        }
        DocumentTableStyle nameLeft         = cellStyle(labelStyle(), 3,  GRID_COLUMN_GAP);
        DocumentTableStyle nameRight        = cellStyle(labelStyle(), 3,  0);
        DocumentTableStyle subLeft          = cellStyle(smallStyle(), 0,  GRID_COLUMN_GAP);
        DocumentTableStyle subRight         = cellStyle(smallStyle(), 0,  0);
        DocumentTableStyle subLeftEntryEnd  = cellStyle(smallStyle(), 18, GRID_COLUMN_GAP);
        DocumentTableStyle subRightEntryEnd = cellStyle(smallStyle(), 18, 0);

        section.addTable(table -> {
            table.name("ReferencesGrid")
                    .columns(DocumentTableColumn.fixed(GRID_COLUMN_WIDTH),
                             DocumentTableColumn.fixed(GRID_COLUMN_WIDTH))
                    .padding(DocumentInsets.zero())
                    .margin(DocumentInsets.zero());

            int pairs = (entries.size() + 1) / 2;
            for (int pairIndex = 0; pairIndex < pairs; pairIndex++) {
                Reference left = entries.get(pairIndex * 2);
                Reference right = pairIndex * 2 + 1 < entries.size()
                        ? entries.get(pairIndex * 2 + 1)
                        : null;
                boolean lastPair = pairIndex == pairs - 1;

                table.rowCells(
                        gridText(letterSpace(left.name()), nameLeft),
                        gridText(right == null ? "" : letterSpace(right.name()), nameRight));
                table.rowCells(
                        gridText(left.company(), subLeft),
                        gridText(right == null ? "" : right.company(), subRight));
                table.rowCells(
                        gridText(prefixed("P: ", left.phone()), subLeft),
                        gridText(right == null ? "" : prefixed("P: ", right.phone()), subRight));
                // 18pt bottom padding on email when ANOTHER pair follows;
                // 0pt on the email of the last pair so the table does not
                // gain phantom trailing space. Mirrors the inner-vs-last
                // distinction the awards table makes for its meta row.
                DocumentTableStyle emailLeftStyle  = lastPair ? subLeft  : subLeftEntryEnd;
                DocumentTableStyle emailRightStyle = lastPair ? subRight : subRightEntryEnd;
                table.rowCells(
                        emailCell(left, emailLeftStyle),
                        right == null
                                ? gridText("", emailRightStyle)
                                : emailCell(right, emailRightStyle));
            }
        });
    }

    private DocumentTableCell emailCell(Reference reference, DocumentTableStyle cellStyle) {
        if (reference.email().isBlank()) {
            return gridText("", cellStyle);
        }
        String visibleText = prefixed("E: ", reference.email());
        DocumentLinkOptions link = reference.emailLink()
                .map(DocumentLinkOptions::new)
                .orElse(null);
        if (link == null) {
            return gridText(visibleText, cellStyle);
        }
        // Composed-cell path: wrap the email in a ParagraphNode with an
        // inline link run so PDF readers turn the visible "E: foo@bar"
        // text into a clickable mailto: rectangle. Plain-text cells
        // cannot carry per-cell link annotations, so we build a
        // ParagraphNode via the public ParagraphBuilder and feed it
        // into DocumentTableCell.node(...) — the working composed-cell
        // pattern verified against the v1.6 PDF backend (paragraph cells
        // render, section cells do not).
        ParagraphNode linkedParagraph = new ParagraphBuilder()
                .name("ReferenceEmail")
                .textStyle(smallStyle())
                .align(TextAlign.LEFT)
                .inlineText(visibleText, smallStyle(), link)
                .build();
        return DocumentTableCell.node(linkedParagraph).withStyle(cellStyle);
    }

    private void experienceItem(SectionBuilder section, ExperienceEntry entry) {
        section.addParagraph(p -> p
                .text(letterSpace(entry.jobTitle()))
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text(entry.meta())
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 18, 0)));
        body(section, entry.body());
        if (!entry.highlights().isEmpty()) {
            section.addList(list -> list
                    .bullet()
                    .items(entry.highlights())
                    .textStyle(smallStyle())
                    .lineSpacing(1.18)
                    .margin(new DocumentInsets(3, 0, 22, 28)));
        }
    }

    private void educationItem(SectionBuilder section, EducationEntry entry) {
        section.addParagraph(p -> p
                .text(letterSpace(entry.degree()))
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text(entry.school())
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text(entry.years())
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    private void iconLine(SectionBuilder section, String iconToken, String value,
                          DocumentLinkOptions link) {
        IconSpec spec = requireSpec(iconToken);
        DocumentImageData iconData = DocumentImageData.fromPath(
                ICONS_DIR.resolve(spec.fileName()));
        section.addParagraph(p -> p
                .name("Icon_" + iconToken)
                .textStyle(smallStyle())
                .inlineImage(iconData, spec.pointSize(), spec.pointSize(),
                        InlineImageAlignment.CENTER, 0.0, link)
                .inlineText("   " + value, smallStyle(), link)
                .margin(new DocumentInsets(0, 0, lineGap(spec.pointSize()), 0)));
    }

    private static double lineGap(double iconPointSize) {
        return iconPointSize > 11.0 ? 9.0 : 13.0;
    }

    private static IconSpec requireSpec(String token) {
        IconSpec spec = ICONS.get(token);
        if (spec == null) {
            throw new IllegalStateException("missing icon spec for token: " + token
                    + ". Update assets-manifest.json and the ICONS table.");
        }
        return spec;
    }

    private void skill(SectionBuilder section, String name, double value) {
        section.addParagraph(p -> p
                .text(letterSpace(name))
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 8, 0)));
        skillBar(section, value);
    }

    private void skillBar(SectionBuilder section, double value) {
        double markerLeft = Math.max(0.0, Math.min(1.0, value)) * SKILL_BAR_WIDTH;
        section.addLine(line -> line
                .horizontal(SKILL_BAR_WIDTH)
                .color(RULE)
                .thickness(0.65)
                .margin(DocumentInsets.zero()));
        section.addLine(line -> line
                .vertical(SKILL_MARKER_HEIGHT)
                .color(BLACK)
                .thickness(1.2)
                .margin(new DocumentInsets(-4.35, 0, 12, markerLeft)));
    }

    private void heading(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(letterSpace(text))
                .textStyle(style(11.5, ACCENT, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    private void label(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(letterSpace(text))
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 14, 0)));
    }

    private void body(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(text)
                .textStyle(bodyStyle())
                .lineSpacing(1.22)
                .margin(new DocumentInsets(0, 0, 12, 0)));
    }

    private static DocumentTableCell gridText(String text, DocumentTableStyle style) {
        return DocumentTableCell.text(text == null ? "" : text).withStyle(style);
    }

    private static String prefixed(String prefix, String value) {
        return value == null || value.isBlank() ? "" : prefix + value;
    }

    /**
     * Visual transformation that converts a natural-form string into the
     * spaced-uppercase form used by every heading and label in the
     * reference. Single space between letters within a word, double space
     * between words.
     *
     * <pre>{@code
     * letterSpace("Rose Harris")       -> "R O S E  H A R R I S"
     * letterSpace("Arts & Entertainment") -> "A R T S  &  E N T E R T A I N M E N T"
     * letterSpace("Contact")           -> "C O N T A C T"
     * }</pre>
     */
    static String letterSpace(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder(text.length() * 2);
        boolean firstCharOfRun = true;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == ' ') {
                out.append("  ");
                firstCharOfRun = true;
                continue;
            }
            if (!firstCharOfRun) {
                out.append(' ');
            }
            out.append(Character.toUpperCase(ch));
            firstCharOfRun = false;
        }
        return out.toString();
    }

    /**
     * No-border, no-fill table cell style. Sets a zero-width stroke and a
     * white fill so the engine's 1pt black default cell border is
     * suppressed. {@code rightPadding} drives the column gap on the LEFT
     * column only — keep RIGHT column padding at zero.
     */
    private static DocumentTableStyle cellStyle(DocumentTextStyle textStyle,
                                                double bottomPadding,
                                                double rightPadding) {
        return DocumentTableStyle.builder()
                .textStyle(textStyle)
                .padding(new DocumentInsets(0, rightPadding, bottomPadding, 0))
                .stroke(DocumentStroke.of(DocumentColor.WHITE, 0))
                .fillColor(DocumentColor.WHITE)
                .build();
    }

    private static DocumentTextStyle labelStyle() {
        return style(7.4, BLACK, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle bodyStyle() {
        return style(7.4, BLACK, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle smallStyle() {
        return style(7.2, MUTED, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle style(double size,
                                           DocumentColor color,
                                           DocumentTextDecoration decoration) {
        return DocumentTextStyle.builder()
                .fontName(decoration == DocumentTextDecoration.BOLD ? HEADING_FONT : BODY_FONT)
                .size(size)
                .color(color)
                .decoration(decoration)
                .build();
    }
}
