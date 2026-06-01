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
 * <h2>Mint Editorial CV</h2>
 *
 * Two-page editorial-style resume / CV template for a graphic designer.
 * Centered identity header with a full-width mint accent rule, two-column
 * body grids on page 1, a sidebar + main split on page 2 where AWARDS
 * and REFERENCES fill the entire Main column as a half-and-half grid,
 * Iconify-backed contact and social glyphs, filled-badge social icons,
 * and bundled {@code Poppins} typography from the GraphCompose Google
 * Fonts library.
 *
 * <h3>Relational geometry</h3>
 *
 * Layout dimensions are DERIVED from a small set of base constants
 * (page width, side margin, column gap, sidebar weight). Change one
 * base constant and every dependent width recomputes — the awards
 * grid, the sidebar width, the skill bars, and the page-2 row
 * weights all follow without per-region retuning. This is the
 * canonical pattern documented in
 * {@code prompts/template-coder-agent.md} under "Relational
 * geometry over pixel constants".
 *
 * <pre>{@code
 *   FULL_PAGE_WIDTH + PAGE_MARGIN_SIDE + COLUMN_GAP → USABLE_WIDTH
 *   USABLE_WIDTH × SIDEBAR_WEIGHT                    → SIDEBAR_WIDTH = SKILL_BAR_WIDTH
 *   USABLE_WIDTH × MAIN_WEIGHT                        → MAIN_WIDTH
 *   MAIN_WIDTH / 2                                    → GRID_COLUMN_WIDTH
 * }</pre>
 *
 * <h3>Usage</h3>
 *
 * <pre>{@code
 * try (DocumentSession session = GraphCompose.document(Path.of("out.pdf"))
 *         .pageSize(DocumentPageSize.A4)
 *         .create()) {
 *
 *     // Option 1: drive the template from the bundled cv-data.example.json
 *     // (set graphcompose.revision.dir to the folder that holds the JSON
 *     // and the assets/ subfolder).
 *     System.setProperty("graphcompose.revision.dir",
 *             "templates/mint-editorial-cv");
 *     MintEditorialCvSpec spec = MintEditorialCvSpecProvider.create();
 *
 *     // Option 2: build the spec by hand from your own data sources.
 *     // MintEditorialCvSpec spec = new MintEditorialCvSpec(...);
 *
 *     new MintEditorialCvTemplate().compose(session, spec);
 *     session.buildPdf();
 * }
 * }</pre>
 *
 * <h3>Dependencies</h3>
 *
 * <ul>
 *   <li>{@code io.github.demchaav:graph-compose:1.6.7} (or compatible 1.6.x; pre-1.6.7 pins continue to resolve via JitPack as {@code com.github.DemchaAV:GraphCompose:vX.Y.Z})</li>
 *   <li>{@code com.fasterxml.jackson.core:jackson-databind:2.17.2} —
 *       only needed if you load the spec from JSON via
 *       {@link MintEditorialCvSpecProvider}. Build the spec by hand and
 *       Jackson is optional.</li>
 * </ul>
 *
 * <h3>Asset resolution</h3>
 *
 * Icons are read from {@code <revision.dir>/assets/icons/} at render
 * time. The {@code revision.dir} property is set by
 * {@code scripts/render-cv-reference.mjs} during the flow; when you
 * embed this template in another project, set the property to whatever
 * folder holds {@code cv-data.json} and the {@code assets/} subfolder
 * (typically the directory containing this template's
 * {@code data/cv-data.example.json}).
 *
 * <h3>Fonts</h3>
 *
 * The template uses {@code FontName.POPPINS} for both heading and body.
 * Poppins is part of the GraphCompose bundled Google Fonts list
 * (see {@code DefaultFonts.googleFamilies()}), so it loads from the
 * library JAR — the bundle ships NO {@code .ttf} files for it.
 * {@code template.json#fonts} carries the manifest entry so downstream
 * tools can audit which fonts the bundle needs.
 *
 * <p>To swap typography:</p>
 *
 * <ul>
 *   <li><b>Any bundled Google family</b> — change
 *       {@link #HEADING_FONT} and {@link #BODY_FONT} to
 *       {@code FontName.LATO}, {@code FontName.FIRA_SANS}, etc.
 *       No registration required.</li>
 *   <li><b>Standard 14 (Helvetica / Times / Courier)</b> — use
 *       {@code FontName.HELVETICA} (etc.). Always available.</li>
 *   <li><b>A custom non-bundled family</b> — drop the
 *       {@code .ttf}/{@code .otf} files into {@code assets/fonts/},
 *       register via {@code FontFamilyDefinition.files(...)} +
 *       {@code FontLibrary.addFont(...)}, then point
 *       {@link #HEADING_FONT} at {@code FontName.of("Inter")}.</li>
 * </ul>
 *
 * <h3>Customization points</h3>
 *
 * <ul>
 *   <li><b>Content</b> — edit {@code data/cv-data.example.json}. The
 *       schema is mirrored in {@link MintEditorialCvSpec}.</li>
 *   <li><b>Theme tokens</b> — {@link #ACCENT}, {@link #BLACK},
 *       {@link #MUTED}, {@link #RULE}.</li>
 *   <li><b>Typography</b> — {@link #HEADING_FONT}, {@link #BODY_FONT}.</li>
 *   <li><b>Page geometry (base constants)</b> —
 *       {@link #FULL_PAGE_WIDTH}, {@link #PAGE_MARGIN_TOP},
 *       {@link #PAGE_MARGIN_SIDE}, {@link #PAGE_MARGIN_BOTTOM},
 *       {@link #PAGE_GAP}, {@link #COLUMN_GAP}. Every page-level width
 *       derives from these.</li>
 *   <li><b>Column proportions</b> — {@link #SIDEBAR_WEIGHT} (and the
 *       implicit {@code MAIN_WEIGHT = 1 - SIDEBAR_WEIGHT}). Bump
 *       SIDEBAR_WEIGHT and {@link #SIDEBAR_WIDTH},
 *       {@link #MAIN_WIDTH}, {@link #GRID_COLUMN_WIDTH} re-derive in
 *       one place.</li>
 *   <li><b>Genuinely independent dimensions</b> —
 *       {@link #SKILL_MARKER_HEIGHT}, {@link #GRID_COLUMN_GAP}, the
 *       {@link #ICONS} table entries. These are visual choices, not
 *       derived ratios.</li>
 * </ul>
 *
 * <h3>Spaced-uppercase styling rule</h3>
 *
 * Every section heading and label in the reference uses spaced
 * uppercase. The template applies the transformation at render time
 * via {@link #letterSpace(String)}; the JSON carries natural-case
 * strings ("Rose Harris", "Contact", "Awards"). Render a field via
 * {@code body(...)} instead of {@link #heading} / {@link #label}
 * when you want to keep its natural case.
 *
 * <h3>Clickable links</h3>
 *
 * <ul>
 *   <li>{@code contact[].url} wraps the contact row in a
 *       {@link DocumentLinkOptions}.</li>
 *   <li>{@code social[].url} wraps both the icon and the visible label
 *       so the entire row is one click target.</li>
 *   <li>{@code references[].email} becomes a {@code mailto:} link
 *       automatically when non-blank.</li>
 * </ul>
 *
 * <h3>Source provenance</h3>
 *
 * Published from {@code examples/cv-reference/revisions/revision-008}
 * (current APPROVED baseline; supersedes revision-007 which moved
 * Awards/References to fill Main, and revision-004 which was the
 * first APPROVED Mint Editorial CV with hard-coded layout values).
 *
 * @see MintEditorialCvSpec
 * @see MintEditorialCvSpecProvider
 */
public final class MintEditorialCvTemplate {

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

    // === Page geometry (base constants — only these are pixel-typed) ===
    private static final double FULL_PAGE_WIDTH    = 595.0;  // A4 portrait
    private static final double PAGE_MARGIN_TOP    = 54.0;
    private static final double PAGE_MARGIN_SIDE   = 52.0;
    private static final double PAGE_MARGIN_BOTTOM = 38.0;
    private static final double PAGE_GAP           = 32.0;
    private static final double COLUMN_GAP         = 54.0;

    // === Column proportions (page-2 grid weights) ===
    // Sidebar holds Expertise / Skills / Social; Main holds Experience /
    // Awards / References. Awards and References split Main exactly in
    // half. Change SIDEBAR_WEIGHT (and MAIN_WEIGHT = 1 - SIDEBAR_WEIGHT)
    // to re-balance the layout — every derived width follows.
    private static final double SIDEBAR_WEIGHT = 0.31;
    private static final double MAIN_WEIGHT    = 1.0 - SIDEBAR_WEIGHT;

    // === Derived widths (do not hand-edit; they follow from the base
    // constants above so the layout survives page-size or weight changes
    // without per-region retuning) ===
    private static final double USABLE_WIDTH      =
            FULL_PAGE_WIDTH - 2.0 * PAGE_MARGIN_SIDE - COLUMN_GAP;
    private static final double SIDEBAR_WIDTH     = USABLE_WIDTH * SIDEBAR_WEIGHT;
    private static final double MAIN_WIDTH        = USABLE_WIDTH * MAIN_WEIGHT;
    private static final double SKILL_BAR_WIDTH   = SIDEBAR_WIDTH;
    // Awards / References render as a 2-column TableBuilder inside the
    // Main section of PageTwoGrid. The two grid columns split Main
    // exactly in half; the 28pt visual gap between them comes from the
    // left cell's right-padding inside the cell, so the TABLE itself
    // spans the full Main width with the divide sitting at the half-point.
    private static final double GRID_COLUMN_WIDTH = MAIN_WIDTH / 2.0;
    private static final double GRID_COLUMN_GAP   = 28.0;

    // === Local-pixel constants (genuinely independent dimensions) ===
    private static final double SKILL_MARKER_HEIGHT = 8.0;

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
        row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
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
        row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
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
