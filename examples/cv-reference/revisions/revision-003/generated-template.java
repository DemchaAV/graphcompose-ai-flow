package com.demcha.examples.cv;

import java.nio.file.Path;
import java.util.List;
import java.util.Objects;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.image.DocumentImageData;
import com.demcha.compose.document.image.DocumentImageFitMode;
import com.demcha.compose.document.node.InlineImageAlignment;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.font.FontName;

/**
 * Revision-003 of the CV reference template.
 *
 * <p>Built on top of revision-002 but wired into the asset-resolver flow:
 * contact and social icons come from {@code assets/icons/<token>.png} (downloaded
 * by {@code tools/asset-resolver}), the expertise badge is the rasterized
 * {@code mdi:check-decagram-outline} glyph, and typography uses
 * {@link FontName#POPPINS} from the GraphCompose bundled Google Fonts list.</p>
 *
 * <p>The asset directory is resolved through the {@code graphcompose.revision.dir}
 * JVM property which the render runner sets to the absolute path of the current
 * revision folder. The template never hard-codes an absolute path.</p>
 */
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

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
    private static final double ICON_SIZE = 10.0;
    private static final double EXPERTISE_BADGE_SIZE = 22.0;

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
        section.addImage(image -> image
                .name("ExpertiseBadge")
                .source(ICONS_DIR.resolve("expertise-badge.png"))
                .size(EXPERTISE_BADGE_SIZE, EXPERTISE_BADGE_SIZE)
                .fitMode(DocumentImageFitMode.CONTAIN)
                .margin(new DocumentInsets(2, 0, 14, 0)));
        section.spacing(12);
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
        iconLine(section, "twitter", "Twitter Link");
        iconLine(section, "facebook", "Facebook Link");
        iconLine(section, "pinterest", "Pinterest Link");
        iconLine(section, "linkedin", "LinkedIn Link");
    }

    private void renderExperiencePageTwo(SectionBuilder section) {
        heading(section, "E X P E R I E N C E");
        experienceItem(section);
        experienceItem(section);
    }

    private void renderAwards(SectionBuilder section) {
        heading(section, "A W A R D S");
        awardPair(section);
        awardPair(section);
    }

    private void renderReferences(SectionBuilder section) {
        heading(section, "R E F E R E N C E S");
        referencePair(section);
        referencePair(section);
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

    private void awardPair(SectionBuilder section) {
        section.addParagraph(p -> p
                .text("A W A R D  N A M E  H E R E          A W A R D  N A M E  H E R E")
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 5, 0)));
        section.addParagraph(p -> p
                .text("Company  |  2012                              Company  |  2012")
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    private void referencePair(SectionBuilder section) {
        section.addParagraph(p -> p
                .text("J O H N  S M I T H                         J O H N  S M I T H")
                .textStyle(labelStyle())
                .margin(new DocumentInsets(0, 0, 4, 0)));
        section.addParagraph(p -> p
                .text("Company                                      Company")
                .textStyle(smallStyle())
                .margin(DocumentInsets.zero()));
        section.addParagraph(p -> p
                .text("P: +61 402 938 209                          P: +61 402 938 209")
                .textStyle(smallStyle())
                .margin(DocumentInsets.zero()));
        section.addParagraph(p -> p
                .text("E: hello@email.com                           E: hello@email.com")
                .textStyle(smallStyle())
                .margin(new DocumentInsets(0, 0, 24, 0)));
    }

    /**
     * Renders one icon + label line. The PNG behind {@code iconToken} was
     * downloaded by the asset-resolver and is recorded in
     * {@code assets-manifest.json}. The icon is placed as an inline image on
     * the same baseline as the surrounding text — this keeps the sidebar
     * compact and avoids nested horizontal rows, which the canonical paginator
     * disallows below a row column.
     */
    private void iconLine(SectionBuilder section, String iconToken, String value) {
        DocumentImageData iconData = DocumentImageData.fromPath(
                ICONS_DIR.resolve(iconToken + ".png"));
        section.addParagraph(p -> p
                .name("Icon_" + iconToken)
                .textStyle(smallStyle())
                .inlineImage(iconData, ICON_SIZE, ICON_SIZE, InlineImageAlignment.CENTER)
                .inlineText("   " + value, smallStyle())
                .margin(new DocumentInsets(0, 0, 13, 0)));
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
