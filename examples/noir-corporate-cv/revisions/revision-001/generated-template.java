package com.demcha.examples.cv;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.image.DocumentImageData;
import com.demcha.compose.document.node.InlineImageAlignment;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

/**
 * First generated draft for the supplied single-page corporate CV
 * reference. The template uses semantic GraphCompose flow primitives
 * (page flow, rows with column weights, sections, paragraphs, lists,
 * lines, inline images) and avoids raw coordinates.
 *
 * <p>Revision-001 is a STRUCTURAL DRAFT. The dark aubergine sidebar
 * plate, the dark identity card hosting the {@code CV} circle, and
 * the dark section-header bars in the main column are intentionally
 * rendered as plain bold spaced-uppercase text on the white page —
 * the panel-fill primitive and the rounded-shape primitive are
 * scheduled for revision-002+ once {@code backgrounds-and-panels}
 * and {@code shapes-and-containers} are wired into this template.
 *
 * <p>Layout dimensions derive from a small set of base constants
 * (page width, side margin, column gap, sidebar weight). Hardcoded
 * pixel values are reserved for genuinely independent dimensions
 * (icon point sizes, heading-rule thickness, work-experience marker
 * connector length).
 */
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

    private record IconSpec(String fileName, double pointSize) {
    }

    private static final Map<String, IconSpec> ICONS = Map.ofEntries(
            Map.entry("location", new IconSpec("location.png", 10.0)),
            Map.entry("email",    new IconSpec("email.png",    10.0)),
            Map.entry("phone",    new IconSpec("phone.png",    10.0)),
            Map.entry("website",  new IconSpec("website.png",  10.0)),
            Map.entry("music",    new IconSpec("music.png",    13.0)),
            Map.entry("book",     new IconSpec("book.png",     13.0)),
            Map.entry("travel",   new IconSpec("travel.png",   13.0)));

    private static final FontName HEADING_FONT = FontName.POPPINS;
    private static final FontName BODY_FONT = FontName.POPPINS;

    // === Theme tokens ===
    private static final DocumentColor ACCENT = DocumentColor.rgb(61, 46, 63);   // dark aubergine
    private static final DocumentColor BLACK  = DocumentColor.rgb(24, 24, 24);
    private static final DocumentColor MUTED  = DocumentColor.rgb(90, 90, 90);
    private static final DocumentColor RULE   = DocumentColor.rgb(198, 188, 174);

    // === Page geometry (base constants — only these are pixel-typed) ===
    private static final double FULL_PAGE_WIDTH    = 595.0;  // A4 portrait
    private static final double PAGE_MARGIN_TOP    = 36.0;
    private static final double PAGE_MARGIN_SIDE   = 36.0;
    private static final double PAGE_MARGIN_BOTTOM = 36.0;
    private static final double COLUMN_GAP         = 28.0;

    // === Column proportions ===
    private static final double SIDEBAR_WEIGHT = 0.33;
    private static final double MAIN_WEIGHT    = 1.0 - SIDEBAR_WEIGHT;

    // === Derived widths (do not hand-edit) ===
    private static final double USABLE_WIDTH =
            FULL_PAGE_WIDTH - 2.0 * PAGE_MARGIN_SIDE - COLUMN_GAP;
    private static final double SIDEBAR_WIDTH = USABLE_WIDTH * SIDEBAR_WEIGHT;
    private static final double MAIN_WIDTH    = USABLE_WIDTH * MAIN_WEIGHT;

    // === Independent dimensions (visual choices, not derived) ===
    private static final double HEADING_RULE_THICK         = 0.6;
    private static final double WORK_MARKER_CONNECTOR_LEN  = 18.0;
    private static final double WORK_MARKER_THICKNESS      = 0.8;

    private static final String PROFILE_TEXT =
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
                    + "Vivamus est quam, placerat in lacus non, tincidunt vestibulum "
                    + "eros. Sed dapibus dolor id gravida laoreet. Sed imperdiet "
                    + "dignissim metus, ac gravida arcu varius non.";

    /**
     * Compose the CV directly from fixture content. No external business
     * spec is required for this first reference draft; the typed spec
     * split is scheduled for revision-002+.
     *
     * @param document active GraphCompose document session
     */
    public void compose(DocumentSession document) {
        Objects.requireNonNull(document, "document");

        document.pageFlow(page -> page
                .name("NoirCorporateCv")
                .padding(new DocumentInsets(
                        PAGE_MARGIN_TOP,
                        PAGE_MARGIN_SIDE,
                        PAGE_MARGIN_BOTTOM,
                        PAGE_MARGIN_SIDE))
                .spacing(0)
                .addRow("MainGrid", this::renderGrid));
    }

    private void renderGrid(RowBuilder row) {
        row.spacing(COLUMN_GAP);
        row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
        row.addSection("Sidebar", this::renderSidebar);
        row.addSection("Main",    this::renderMain);
    }

    // === Sidebar =====================================================

    private void renderSidebar(SectionBuilder section) {
        section.spacing(22)
                .addSection("Identity", this::renderIdentity)
                .addSection("Contact",  this::renderContact)
                .addSection("Skills",   this::renderSkills)
                .addSection("Languages",this::renderLanguages)
                .addSection("Interest", this::renderInterest);
    }

    private void renderIdentity(SectionBuilder section) {
        // Revision-001 limitation: the dark plum identity card and the
        // dark filled CV circle are deferred to revision-002+ where the
        // backgrounds-and-panels + shapes-and-containers skills will
        // wire in the panel + clipped-shape primitives. For now, the
        // "CV" badge is rendered as bold spaced-uppercase text only.
        section.addParagraph(p -> p
                .text(letterSpace("CV"))
                .textStyle(style(28, ACCENT, DocumentTextDecoration.BOLD))
                .align(TextAlign.CENTER)
                .margin(new DocumentInsets(8, 0, 18, 0)));
    }

    private void renderContact(SectionBuilder section) {
        sidebarHeading(section, "Contact");
        iconLine(section, "location", "1231 Main Street, Your City");
        iconLine(section, "email",    "your@email.com");
        iconLine(section, "phone",    "012 345 6789");
        iconLine(section, "website",  "www.yourcompany.com");
    }

    private void renderSkills(SectionBuilder section) {
        sidebarHeading(section, "Skills");
        ratingRow(section, "Valuable skill", 0.8);
        ratingRow(section, "Valuable skill", 0.6);
        ratingRow(section, "Valuable skill", 0.7);
        ratingRow(section, "Valuable skill", 0.5);
    }

    private void renderLanguages(SectionBuilder section) {
        sidebarHeading(section, "Languages");
        ratingRow(section, "Language (Native)", 1.0);
        ratingRow(section, "Some Language",     0.6);
        ratingRow(section, "Another Language",  0.4);
    }

    private void renderInterest(SectionBuilder section) {
        sidebarHeading(section, "Interest");
        iconLine(section, "music",  "Music");
        iconLine(section, "book",   "Book");
        iconLine(section, "travel", "Traveling");
    }

    // === Main column =================================================

    private void renderMain(SectionBuilder section) {
        section.spacing(20)
                .addSection("NameBar",              this::renderNameBar)
                .addSection("ProfessionalProfile",  this::renderProfile)
                .addSection("Education",            this::renderEducation)
                .addSection("WorkExperience",       this::renderWorkExperience);
    }

    private void renderNameBar(SectionBuilder section) {
        // Revision-001 limitation: the dark aubergine name-bar fill is
        // deferred to revision-002+ once the backgrounds-and-panels
        // skill is wired in. For now the bar is rendered as stacked
        // bold spaced-uppercase headings on the page-white background.
        section.spacing(2)
                .addParagraph(p -> p
                        .text(letterSpace("Name Surename"))
                        .textStyle(style(22, ACCENT, DocumentTextDecoration.BOLD))
                        .margin(new DocumentInsets(0, 0, 4, 0)))
                .addParagraph(p -> p
                        .text(letterSpace("Your Job Position"))
                        .textStyle(style(10, MUTED, DocumentTextDecoration.DEFAULT))
                        .margin(new DocumentInsets(0, 0, 6, 0)));
    }

    private void renderProfile(SectionBuilder section) {
        mainHeading(section, "Professional Profile");
        body(section, PROFILE_TEXT);
    }

    private void renderEducation(SectionBuilder section) {
        mainHeading(section, "Education");
        educationItem(section, "2015 – 2019",
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
                        + "Maecenas iaculis eros at erat pellentesque, at ultrices "
                        + "libero blandit.");
        educationItem(section, "2012 – 2015",
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
                        + "Donec interdum et tellus sit amet ornare. Sed dapibus "
                        + "dolor id gravida laoreet.");
    }

    private void renderWorkExperience(SectionBuilder section) {
        mainHeading(section, "Work Experience");
        experienceItem(section, "Your Job Position | 2024", "Company name",
                List.of(
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                        "Vivamus est quam, placerat in lacus non, tincidunt vestibulum eros.",
                        "Sed dapibus dolor id gravida laoreet.",
                        "Sed imperdiet dignissim metus, ac gravida arcu varius non."));
        experienceItem(section, "Your Job Position | 2021", "Company name",
                List.of(
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                        "Maecenas iaculis eros at erat pellentesque, at ultrices libero blandit.",
                        "Donec interdum et tellus sit amet ornare."));
        experienceItem(section, "Your Job Position | 2019", "Company name",
                List.of(
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                        "Praesent hendrerit nisl a libero placerat, pellentesque malesuada tellus.",
                        "Fusce purus mauris, pharetra a laoreet eget, pretium id metus."));
    }

    // === Item helpers ================================================

    private void educationItem(SectionBuilder section, String years, String text) {
        section.addParagraph(p -> p
                .text(years)
                .textStyle(style(9.5, ACCENT, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 4, 0)));
        section.addParagraph(p -> p
                .text(text)
                .textStyle(bodyStyle())
                .lineSpacing(1.22)
                .margin(new DocumentInsets(0, 0, 12, 0)));
    }

    private void experienceItem(SectionBuilder section,
                                String title,
                                String company,
                                List<String> highlights) {
        // Entry marker (filled bullet + horizontal connector) rendered
        // inline at the start of the title paragraph. Revision-002+
        // will lift the marker into a layered shape primitive.
        section.addParagraph(p -> p
                .text("•   " + letterSpace(title))
                .textStyle(style(10, BLACK, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 3, 0)));
        section.addParagraph(p -> p
                .text(company)
                .textStyle(style(8.5, MUTED, DocumentTextDecoration.DEFAULT))
                .margin(new DocumentInsets(0, 0, 6, 18)));
        section.addList(list -> list
                .bullet()
                .items(highlights)
                .textStyle(smallStyle())
                .lineSpacing(1.20)
                .margin(new DocumentInsets(0, 0, 14, 22)));
    }

    private void iconLine(SectionBuilder section, String iconToken, String value) {
        IconSpec spec = requireSpec(iconToken);
        DocumentImageData iconData = DocumentImageData.fromPath(
                ICONS_DIR.resolve(spec.fileName()));
        section.addParagraph(p -> p
                .name("Icon_" + iconToken)
                .textStyle(smallStyle())
                .inlineImage(iconData, spec.pointSize(), spec.pointSize(),
                        InlineImageAlignment.CENTER, 0.0, null)
                .inlineText("   " + value, smallStyle(), null)
                .margin(new DocumentInsets(0, 0, 9, 0)));
    }

    private void ratingRow(SectionBuilder section, String name, double level) {
        section.addParagraph(p -> p
                .text(name)
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 3, 0)));
        section.addParagraph(p -> p
                .text(dotMeter(level))
                .textStyle(style(9, ACCENT, DocumentTextDecoration.DEFAULT))
                .margin(new DocumentInsets(0, 0, 10, 0)));
    }

    private void sidebarHeading(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(letterSpace(text))
                .textStyle(style(10.5, ACCENT, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 4, 0)));
        section.addLine(line -> line
                .horizontal(SIDEBAR_WIDTH)
                .thickness(HEADING_RULE_THICK)
                .color(RULE)
                .margin(new DocumentInsets(0, 0, 12, 0)));
    }

    private void mainHeading(SectionBuilder section, String text) {
        // Revision-001 limitation: dark filled section bars are
        // deferred. The heading is rendered as bold spaced-uppercase
        // text in the accent color with a thin underline rule.
        section.addParagraph(p -> p
                .text(letterSpace(text))
                .textStyle(style(11, ACCENT, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 4, 0)));
        section.addLine(line -> line
                .horizontal(MAIN_WIDTH)
                .thickness(HEADING_RULE_THICK + 0.4)
                .color(ACCENT)
                .margin(new DocumentInsets(0, 0, 12, 0)));
    }

    private void body(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(text)
                .textStyle(bodyStyle())
                .lineSpacing(1.25)
                .margin(new DocumentInsets(0, 0, 8, 0)));
    }

    // === Style + format helpers ======================================

    private static IconSpec requireSpec(String token) {
        IconSpec spec = ICONS.get(token);
        if (spec == null) {
            throw new IllegalStateException("missing icon spec for token: " + token
                    + ". Update assets-manifest.json and the ICONS table.");
        }
        return spec;
    }

    /**
     * 5-step rating meter. Fills {@code round(level * 5)} dark dots
     * (U+2022 BULLET) and leaves the rest as open dots (lowercase
     * letter {@code o}). Revision-001 uses font-safe characters
     * because Poppins does not carry the BLACK / WHITE CIRCLE glyphs
     * (U+25CF, U+25CB). Revision-002+ replaces this with a pair of
     * pre-rasterized dot PNGs rendered inline so the meter reads as
     * filled / open circles regardless of the body font.
     *
     * <pre>{@code
     *   dotMeter(0.0) -> "o o o o o"
     *   dotMeter(0.5) -> "• • • o o"  // 3 filled (rounded up from 2.5)
     *   dotMeter(1.0) -> "• • • • •"
     * }</pre>
     */
    static String dotMeter(double level) {
        double clamped = Math.max(0.0, Math.min(1.0, level));
        int filled = (int) Math.round(clamped * 5.0);
        StringBuilder sb = new StringBuilder(9);
        for (int i = 0; i < 5; i++) {
            sb.append(i < filled ? '•' : 'o');
            if (i < 4) {
                sb.append(' ');
            }
        }
        return sb.toString();
    }

    /**
     * Visual transformation that converts a natural-form string into
     * the spaced-uppercase form used by every section heading and
     * identity badge in the reference. Single space between letters
     * within a word, double space between words.
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

    private static DocumentTextStyle labelStyle() {
        return style(8.0, BLACK, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle bodyStyle() {
        return style(8.4, BLACK, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle smallStyle() {
        return style(8.0, MUTED, DocumentTextDecoration.DEFAULT);
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
