package com.demcha.examples.cv;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.image.DocumentImageData;
import com.demcha.compose.document.image.DocumentImageFitMode;
import com.demcha.compose.document.node.DocumentLinkOptions;
import com.demcha.compose.document.node.InlineImageAlignment;
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

/**
 * "Mint Editorial CV" — revision-005 of the canonical CV reference template.
 *
 * <p>Diff vs revision-004 (the approved baseline): the Social section's four
 * entries are now real clickable hyperlinks. Both the inline badge image and
 * the visible label run carry the same {@link DocumentLinkOptions} so a click
 * anywhere along the row opens the profile URL in the PDF reader. URLs sit in
 * the {@link #SOCIAL_LINKS} table; the {@link #iconLine} helper now has an
 * optional URL overload that wraps the existing inline-image + inline-text
 * pattern in link metadata.</p>
 *
 * <p>Inherited from revision-004:</p>
 * <ul>
 *   <li>Expertise badge {@code mdi:check-circle-outline} at 38pt.</li>
 *   <li>Social icons {@code entypo-social:*-with-circle} at 13pt.</li>
 *   <li>Awards and References as real two-column {@code TableBuilder} grids
 *       inside the Main column.</li>
 *   <li>Per-icon document point sizes mirrored from
 *       {@code assets-manifest.json}.</li>
 *   <li>{@code Poppins} (bundled Google Fonts) for heading and body roles.</li>
 * </ul>
 */
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

    /**
     * Per-token icon spec mirrored from {@code assets-manifest.json}. The
     * Template Coder agent populates this table from the manifest; the Java
     * code does not parse JSON at runtime by design — the flow's "machine
     * readability" is in the manifest, not in the rendered binary.
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

    /**
     * Hyperlinks for the Social section. Each URL must include a scheme
     * ({@code https://...}) — GraphCompose's {@link DocumentLinkOptions}
     * rejects scheme-less URIs.
     */
    private static final Map<String, String> SOCIAL_LINKS = Map.of(
            "twitter",   "https://twitter.com/roseharris",
            "facebook",  "https://facebook.com/roseharris",
            "pinterest", "https://pinterest.com/roseharris",
            "linkedin",  "https://linkedin.com/in/roseharris");

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
    private static final double GRID_COLUMN_WIDTH = 130.0;
    private static final double GRID_COLUMN_GAP = 28.0;

    private static final String BODY_TEXT =
            "Aenean molestie, enim in mattis sagittis, orci turpis tincidunt elit, "
                    + "non hendrerit erat ante sed augue. Donec interdum et tellus sit "
                    + "amet ornare. Sed dapibus dolor id gravida laoreet. Sed imperdiet "
                    + "dignissim metus, ac gravida arcu varius non. Maecenas iaculis "
                    + "eros at erat pellentesque, at ultrices libero blandit.";

    private static final String EXPERIENCE_TEXT =
            "Nullam tempus ipsum ut tellus luctus, in rhoncus lorem volutpat. Donec "
                    + "lectus metus, euismod sed lorem in, blandit tempus sem. Vivamus "
                    + "est quam, placerat in lacus non, tincidunt vestibulum eros. Nam "
                    + "ante nulla, consectetur et lacus ac, blandit commodo justo. Nulla "
                    + "eget pellentesque lectus. Praesent hendrerit nisl a libero "
                    + "placerat, pellentesque malesuada tellus pellentesque.";

    /**
     * Per-token spec mirrored from {@code assets-manifest.json}: PNG file name
     * inside {@code assets/icons/} and the document-space point size.
     */
    private record IconSpec(String fileName, double pointSize) {
    }

    /**
     * Compose the CV directly from fixture content.
     *
     * @param document active GraphCompose document session
     */
    public void compose(DocumentSession document) {
        Objects.requireNonNull(document, "document");

        document.pageFlow(page -> page
                .name("RoseHarrisCv")
                .padding(new DocumentInsets(
                        PAGE_MARGIN_TOP,
                        PAGE_MARGIN_SIDE,
                        PAGE_MARGIN_BOTTOM,
                        PAGE_MARGIN_SIDE))
                .spacing(PAGE_GAP)
                .addSection("Header", this::renderHeader)
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
                .addRow("PageOneGrid", this::renderPageOne)
                .addPageBreak(pageBreak -> pageBreak.name("PageTwo"))
                .addRow("PageTwoGrid", this::renderPageTwo));
    }

    private void renderHeader(SectionBuilder section) {
        section.spacing(8)
                .addParagraph(p -> p
                        .text("R O S E  H A R R I S")
                        .textStyle(style(30, BLACK, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()))
                .addParagraph(p -> p
                        .text("G R A P H I C  D E S I G N E R")
                        .textStyle(style(9, ACCENT, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()));
    }

    private void renderPageOne(RowBuilder row) {
        row.spacing(COLUMN_GAP);
        row.weights(0.31, 0.69);
        row.addSection("Sidebar", section -> section
                .spacing(26)
                .addSection("Contact", this::renderContact)
                .addSection("Interests", this::renderInterests)
                .addSection("Education", this::renderEducation));
        row.addSection("Main", section -> section
                .spacing(30)
                .addSection("Profile", this::renderProfile)
                .addSection("Experience", this::renderExperiencePageOne));
    }

    private void renderPageTwo(RowBuilder row) {
        row.spacing(COLUMN_GAP);
        row.weights(0.31, 0.69);
        row.addSection("Sidebar", section -> section
                .spacing(25)
                .addSection("Expertise", this::renderExpertise)
                .addSection("Skills", this::renderSkills)
                .addSection("Social", this::renderSocial));
        row.addSection("Main", section -> section
                .spacing(29)
                .addSection("Experience", this::renderExperiencePageTwo)
                .addSection("Awards", this::renderAwards)
                .addSection("References", this::renderReferences));
    }

    private void renderContact(SectionBuilder section) {
        heading(section, "C O N T A C T");
        iconLine(section, "phone", "+61 409 298 398");
        iconLine(section, "email", "hello@email.com");
        iconLine(section, "location", "Sydney, AUS");
        iconLine(section, "website", "www.website.com");
    }

    private void renderInterests(SectionBuilder section) {
        heading(section, "I N T E R E S T S");
        label(section, "P O L I T I C S");
        label(section, "T R A V E L L I N G");
        label(section, "A R T S  &  E N T E R T A I N M E N T");
        label(section, "I L L U S T R A T I O N");
    }

    private void renderEducation(SectionBuilder section) {
        heading(section, "E D U C A T I O N");
        educationItem(section);
        educationItem(section);
        educationItem(section);
    }

    private void renderProfile(SectionBuilder section) {
        heading(section, "P R O F I L E");
        body(section, BODY_TEXT + " Vestibulum porttitor eleifend hendrerit. "
                + "Maecenas iaculis eros at erat pellentesque, at ultrices.");
    }

    private void renderExperiencePageOne(SectionBuilder section) {
        heading(section, "E X P E R I E N C E");
        experienceItem(section);
        experienceItem(section);
    }

    private void renderExpertise(SectionBuilder section) {
        heading(section, "E X P E R T I S E");
        IconSpec badge = ICONS.get("expertise-badge");
        section.addImage(image -> image
                .name("ExpertiseBadge")
                .source(ICONS_DIR.resolve(badge.fileName()))
                .size(badge.pointSize(), badge.pointSize())
                .fitMode(DocumentImageFitMode.CONTAIN)
                .margin(new DocumentInsets(0, 0, 20, 0)));
        label(section, "I L L U S T R A T I O N");
        label(section, "P R I N T  D E S I G N");
        label(section, "B R A N D I N G");
        label(section, "A N I M A T I O N");
        label(section, "W E B  D E S I G N");
    }

    private void renderSkills(SectionBuilder section) {
        heading(section, "S K I L L S");
        skill(section, "S O C I A L  M E D I A", 0.80);
        skill(section, "A D O B E  S U I T E", 0.84);
        skill(section, "M I C R O S O F T  W O R D", 0.75);
        skill(section, "H T M L / C S S", 0.71);
        skill(section, "W O R D P R E S S", 0.89);
    }

    private void renderSocial(SectionBuilder section) {
        heading(section, "S O C I A L");
        socialLine(section, "twitter", "Twitter Link");
        socialLine(section, "facebook", "Facebook Link");
        socialLine(section, "pinterest", "Pinterest Link");
        socialLine(section, "linkedin", "LinkedIn Link");
    }

    /**
     * Renders one social row whose icon and label both link to the
     * matching {@link #SOCIAL_LINKS} URL. Falls back to a plain
     * non-clickable line if the URL is missing from the table — never
     * silently drops the row.
     */
    private void socialLine(SectionBuilder section, String iconToken, String label) {
        String url = SOCIAL_LINKS.get(iconToken);
        if (url == null) {
            iconLine(section, iconToken, label);
            return;
        }
        iconLine(section, iconToken, label, new DocumentLinkOptions(url));
    }

    private void renderExperiencePageTwo(SectionBuilder section) {
        heading(section, "E X P E R I E N C E");
        experienceItem(section);
        experienceItem(section);
    }

    private void renderAwards(SectionBuilder section) {
        heading(section, "A W A R D S");
        DocumentTableStyle labelLeft  = cellStyle(labelStyle(), 4,  GRID_COLUMN_GAP);
        DocumentTableStyle labelRight = cellStyle(labelStyle(), 4,  0);
        DocumentTableStyle subLeftInner  = cellStyle(smallStyle(), 18, GRID_COLUMN_GAP);
        DocumentTableStyle subRightInner = cellStyle(smallStyle(), 18, 0);
        DocumentTableStyle subLeftLast   = cellStyle(smallStyle(), 0,  GRID_COLUMN_GAP);
        DocumentTableStyle subRightLast  = cellStyle(smallStyle(), 0,  0);
        section.addTable(table -> table
                .name("AwardsGrid")
                .columns(DocumentTableColumn.fixed(GRID_COLUMN_WIDTH),
                         DocumentTableColumn.fixed(GRID_COLUMN_WIDTH))
                .padding(DocumentInsets.zero())
                .margin(DocumentInsets.zero())
                .rowCells(gridText("A W A R D  N A M E  H E R E", labelLeft),
                          gridText("A W A R D  N A M E  H E R E", labelRight))
                .rowCells(gridText("Company  |  2012", subLeftInner),
                          gridText("Company  |  2012", subRightInner))
                .rowCells(gridText("A W A R D  N A M E  H E R E", labelLeft),
                          gridText("A W A R D  N A M E  H E R E", labelRight))
                .rowCells(gridText("Company  |  2012", subLeftLast),
                          gridText("Company  |  2012", subRightLast)));
    }

    private void renderReferences(SectionBuilder section) {
        heading(section, "R E F E R E N C E S");
        DocumentTableStyle nameLeft  = cellStyle(labelStyle(), 3,  GRID_COLUMN_GAP);
        DocumentTableStyle nameRight = cellStyle(labelStyle(), 3,  0);
        DocumentTableStyle subLeft   = cellStyle(smallStyle(), 0,  GRID_COLUMN_GAP);
        DocumentTableStyle subRight  = cellStyle(smallStyle(), 0,  0);
        DocumentTableStyle subLeftEntryEnd  = cellStyle(smallStyle(), 18, GRID_COLUMN_GAP);
        DocumentTableStyle subRightEntryEnd = cellStyle(smallStyle(), 18, 0);
        section.addTable(table -> table
                .name("ReferencesGrid")
                .columns(DocumentTableColumn.fixed(GRID_COLUMN_WIDTH),
                         DocumentTableColumn.fixed(GRID_COLUMN_WIDTH))
                .padding(DocumentInsets.zero())
                .margin(DocumentInsets.zero())
                // first reference entry (4 visual lines per side)
                .rowCells(gridText("J O H N  S M I T H", nameLeft),
                          gridText("J O H N  S M I T H", nameRight))
                .rowCells(gridText("Company", subLeft),
                          gridText("Company", subRight))
                .rowCells(gridText("P: +61 402 938 209", subLeft),
                          gridText("P: +61 402 938 209", subRight))
                .rowCells(gridText("E: hello@email.com", subLeftEntryEnd),
                          gridText("E: hello@email.com", subRightEntryEnd))
                // second reference entry
                .rowCells(gridText("J O H N  S M I T H", nameLeft),
                          gridText("J O H N  S M I T H", nameRight))
                .rowCells(gridText("Company", subLeft),
                          gridText("Company", subRight))
                .rowCells(gridText("P: +61 402 938 209", subLeft),
                          gridText("P: +61 402 938 209", subRight))
                .rowCells(gridText("E: hello@email.com", subLeft),
                          gridText("E: hello@email.com", subRight)));
    }

    private static DocumentTableCell gridText(String text, DocumentTableStyle style) {
        return DocumentTableCell.text(text).withStyle(style);
    }

    /**
     * Builds a "no-border" cell style for the awards/references plain-text
     * tables. The engine's TableCellLayoutStyle.DEFAULT applies a 1pt black
     * border when {@code stroke} is null; explicitly setting a zero-width
     * stroke suppresses the border the renderer would otherwise paint.
     * {@code rightPadding} creates the visual gap between the two columns;
     * applied only to left-column cells, it pushes their text content away
     * from the right-column edge so the two entries are not crammed together.
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

    private void experienceItem(SectionBuilder section) {
        section.addParagraph(p -> p
                .text("J O B  T I T L E")
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text("Company  |  Location  |  2010 - Present")
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 18, 0)));
        body(section, EXPERIENCE_TEXT);
        section.addList(list -> list
                .bullet()
                .items(List.of(
                        "Praesent hendrerit nisl a libero placerat, pellentesque malesuada tellus.",
                        "Fusce purus mauris, pharetra a laoreet eget, pretium id metus.",
                        "Vivamus est quam, placerat in lacus non, tincidunt vestibulum eros."))
                .textStyle(smallStyle())
                .lineSpacing(1.18)
                .margin(new DocumentInsets(3, 0, 22, 28)));
    }

    private void educationItem(SectionBuilder section) {
        section.addParagraph(p -> p
                .text("D E G R E E / B A C H E L O R")
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text("University of Sydney")
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text("2010 - 2011")
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    /**
     * Renders one icon + label line as an inline-image paragraph. The PNG
     * behind {@code iconToken} was downloaded by the asset-resolver and the
     * point size comes from {@code assets-manifest.json}.
     */
    private void iconLine(SectionBuilder section, String iconToken, String value) {
        iconLine(section, iconToken, value, null);
    }

    /**
     * Same as {@link #iconLine(SectionBuilder, String, String)} but wraps the
     * inline image and the label text in the given link metadata. A click on
     * the rendered icon OR on the label opens {@code link.uri()} in PDF
     * readers that support annotations.
     */
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
        // Contact icons (~9pt) ship the same compact gap as revision-003.
        // Social-style badges (~13pt) need a touch more breathing room so the
        // bottom of the circle does not collide with the next badge.
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
                .text(name)
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
                .text(text)
                .textStyle(style(11.5, ACCENT, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    private void label(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(text)
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
