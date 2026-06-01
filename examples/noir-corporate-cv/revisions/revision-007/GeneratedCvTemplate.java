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
import com.demcha.compose.document.node.DocumentLinkOptions;
import com.demcha.compose.document.node.InlineImageAlignment;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.ClipPolicy;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.table.DocumentTableTextAnchor;
import com.demcha.compose.font.FontName;

import com.demcha.examples.cv.NoirCorporateCvSpec.ContactEntry;
import com.demcha.examples.cv.NoirCorporateCvSpec.EducationEntry;
import com.demcha.examples.cv.NoirCorporateCvSpec.ExperienceEntry;
import com.demcha.examples.cv.NoirCorporateCvSpec.InterestEntry;
import com.demcha.examples.cv.NoirCorporateCvSpec.Skill;

/**
 * Revision-007 of the Noir Corporate CV template.
 *
 * <p>This revision replaces the revision-001 text-only scaffold with real
 * GraphCompose 1.6 visual surfaces: the cream sidebar plate, the dark plum
 * name bar, the dark section heading bars, and the clipped circular CV badge.
 * The renderer is
 * data-driven through {@link NoirCorporateCvSpec}; the JSON fixture lives next
 * to this revision as {@code cv-data.json}.</p>
 */
public final class GeneratedCvTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));
    private static final Path ICONS_DIR = REVISION_DIR.resolve("assets").resolve("icons");

    private record IconSpec(String fileName, double pointSize) {
    }

    private static final Map<String, IconSpec> ICONS = Map.ofEntries(
            Map.entry("location", new IconSpec("location.png", 11.5)),
            Map.entry("email",    new IconSpec("email.png",    11.5)),
            Map.entry("phone",    new IconSpec("phone.png",    11.5)),
            Map.entry("website",  new IconSpec("website.png",  11.5)),
            Map.entry("music",    new IconSpec("music.png",    15.0)),
            Map.entry("book",     new IconSpec("book.png",     15.0)),
            Map.entry("travel",   new IconSpec("travel.png",   15.0)),
            Map.entry("rating-filled", new IconSpec("rating-filled.png", 4.4)),
            Map.entry("rating-open",   new IconSpec("rating-open.png",   4.4)));

    private static final FontName HEADING_FONT = FontName.POPPINS;
    private static final FontName BODY_FONT = FontName.POPPINS;

    // Theme tokens.
    private static final DocumentColor DARK = DocumentColor.rgb(61, 46, 63);
    private static final DocumentColor DARKER = DocumentColor.rgb(49, 38, 51);
    private static final DocumentColor SIDEBAR = DocumentColor.rgb(232, 223, 208);
    private static final DocumentColor BLACK = DocumentColor.rgb(24, 24, 24);
    private static final DocumentColor MUTED = DocumentColor.rgb(90, 90, 90);
    private static final DocumentColor RULE = DocumentColor.rgb(132, 124, 114);
    private static final DocumentColor WHITE = DocumentColor.WHITE;

    // Base page geometry. The plaque bleeds to the top + sides so the page
    // padding is only used for the bottom edge.
    private static final double FULL_PAGE_WIDTH = 595.0;
    private static final double FULL_PAGE_HEIGHT = 842.0;
    private static final double PAGE_MARGIN_BOTTOM = 18.0;
    private static final double COLUMN_GAP = 0.0;

    // Column proportions.
    private static final double SIDEBAR_WEIGHT = 0.335;
    private static final double MAIN_WEIGHT = 1.0 - SIDEBAR_WEIGHT;

    // Derived widths. Keep every region width tied to the base constants.
    private static final double USABLE_WIDTH = FULL_PAGE_WIDTH;
    private static final double SIDEBAR_WIDTH = USABLE_WIDTH * SIDEBAR_WEIGHT;
    private static final double MAIN_WIDTH = USABLE_WIDTH * MAIN_WEIGHT;
    private static final double PAGE_CONTENT_HEIGHT =
            FULL_PAGE_HEIGHT - PAGE_MARGIN_BOTTOM;

    // Internal spacing.
    private static final double SIDEBAR_PAD_X = 18.0;
    private static final double SIDEBAR_PAD_TOP = 18.0;
    private static final double INNER_SIDEBAR_WIDTH = SIDEBAR_WIDTH - 2.0 * SIDEBAR_PAD_X;
    private static final double MAIN_PAD_X = 22.0;
    private static final double MAIN_BODY_PAD_X = 22.0;

    // CV badge sits inside the cream sidebar; it visually overlaps the
    // tail end of the dark plaque thanks to the row's negative top margin.
    private static final double CV_DIAMETER = 108.0;
    private static final double CV_LEFT_PAD =
            Math.max(0.0, (INNER_SIDEBAR_WIDTH - CV_DIAMETER) / 2.0);
    private static final double CV_TEXT_OVERLAY_TOP = -CV_DIAMETER * 0.65;
    private static final double SIDEBAR_RULE_THICK = 0.9;
    private static final double SIDEBAR_BOTTOM_FILL = PAGE_CONTENT_HEIGHT * 0.14;
    private static final double NAME_DIVIDER_WIDTH = 48.0;
    private static final double NAME_DIVIDER_LEFT =
            Math.max(0.0, (MAIN_WIDTH - 2.0 * MAIN_PAD_X - NAME_DIVIDER_WIDTH) / 2.0);

    // Full-bleed dark plaque + amount the cream sidebar overlaps it.
    private static final double TOP_BAR_PAD_TOP = 22.0;
    private static final double TOP_BAR_PAD_BOTTOM = 22.0;
    private static final double NAME_BLOCK_VERT_PAD = 14.0;
    // The cream sidebar is pulled up over the plaque by this much; the
    // top of the dark plaque is what stays visible to the right of the
    // sidebar.
    private static final double SIDEBAR_OVERLAY_LIFT = 78.0;
    // Where the main body's content begins below the dark plaque (the
    // plaque overlaps the main column too, so the body needs a top inset
    // to clear it).
    private static final double MAIN_BODY_TOP_INSET = 32.0;

    // Work-experience timeline (continuous line with inline bullets).
    private static final double TIMELINE_LINE_LEFT = 2.0;
    private static final double TIMELINE_TOTAL_HEIGHT = 104.0;
    private static final double TIMELINE_TOP_OFFSET = 9.0;
    private static final double TIMELINE_ENTRY_GAP = 6.0;

    /**
     * Compose the CV from the supplied spec. All variable content is loaded
     * from the revision-local {@code cv-data.json} file.
     */
    public void compose(DocumentSession document, NoirCorporateCvSpec spec) {
        Objects.requireNonNull(document, "document");
        Objects.requireNonNull(spec, "spec");

        document.pageFlow(page -> page
                .name("NoirCorporateCv")
                .padding(new DocumentInsets(0, 0, PAGE_MARGIN_BOTTOM, 0))
                .spacing(0)
                .addSection("TopBar", section -> renderTopBar(section, spec))
                .addRow("MainGrid", row -> {
                    row.margin(new DocumentInsets(-SIDEBAR_OVERLAY_LIFT, 0, 0, 0));
                    renderGrid(row, spec);
                }));
    }

    private void renderTopBar(SectionBuilder section, NoirCorporateCvSpec spec) {
        section.fillColor(DARK)
                .padding(new DocumentInsets(
                        TOP_BAR_PAD_TOP,
                        0,
                        TOP_BAR_PAD_BOTTOM,
                        0))
                .addRow("TopBarRow", row -> {
                    row.spacing(0);
                    row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
                    row.addSection("BarLeftSpacer", inner -> inner
                            .spacer(SIDEBAR_WIDTH, 1.0));
                    row.addSection("NamePlate", inner -> renderNamePlate(inner, spec));
                });
    }

    private void renderNamePlate(SectionBuilder section, NoirCorporateCvSpec spec) {
        section.padding(new DocumentInsets(NAME_BLOCK_VERT_PAD, MAIN_PAD_X, NAME_BLOCK_VERT_PAD, MAIN_PAD_X))
                .spacing(4)
                .addParagraph(p -> p
                        .text(letterSpace(spec.header().name()))
                        .textStyle(style(17.2, WHITE, DocumentTextDecoration.BOLD))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()))
                .addLine(line -> line
                        .horizontal(NAME_DIVIDER_WIDTH)
                        .thickness(0.55)
                        .color(WHITE)
                        .margin(new DocumentInsets(5.0, 0, 2.0, NAME_DIVIDER_LEFT)))
                .addParagraph(p -> p
                        .text(letterSpace(spec.header().title()))
                        .textStyle(style(6.4, WHITE, DocumentTextDecoration.DEFAULT))
                        .align(TextAlign.CENTER)
                        .margin(DocumentInsets.zero()));
    }

    private void renderGrid(RowBuilder row, NoirCorporateCvSpec spec) {
        row.spacing(COLUMN_GAP);
        row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
        row.addSection("Sidebar", section -> renderSidebar(section, spec));
        row.addSection("Main", section -> renderMain(section, spec));
    }

    private void renderSidebar(SectionBuilder section, NoirCorporateCvSpec spec) {
        section.fillColor(SIDEBAR)
                .padding(new DocumentInsets(SIDEBAR_PAD_TOP, SIDEBAR_PAD_X, 22.0, SIDEBAR_PAD_X))
                .margin(new DocumentInsets(22.0, 22.0, 22.0, 22.0))
                .spacing(14)
                .addSection("Identity", inner -> renderIdentity(inner, spec))
                .addSection("Contact", inner -> renderContact(inner, spec))
                .addSection("Skills", inner -> renderSkills(inner, spec.skills()))
                .addSection("Languages", inner -> renderLanguages(inner, spec.languages()))
                .addSection("Interest", inner -> renderInterest(inner, spec))
                .spacer(INNER_SIDEBAR_WIDTH, SIDEBAR_BOTTOM_FILL);
    }

    private void renderIdentity(SectionBuilder section, NoirCorporateCvSpec spec) {
        section.addContainer(container -> container
                .name("CvCircle")
                .circle(CV_DIAMETER)
                .clipPolicy(ClipPolicy.CLIP_PATH)
                .fillColor(DARKER)
                .margin(new DocumentInsets(0, 0, 0, CV_LEFT_PAD))
                .center(new ParagraphBuilder()
                        .name("CvCircleLayer")
                        .text(" ")
                        .textStyle(style(1.0, WHITE, DocumentTextDecoration.DEFAULT))
                        .margin(DocumentInsets.zero())
                        .build()));
        section.addParagraph(p -> p
                .name("CvInitials")
                .text(spec.avatar().initials())
                .textStyle(style(36.0, WHITE, DocumentTextDecoration.DEFAULT))
                .align(TextAlign.CENTER)
                .margin(new DocumentInsets(CV_TEXT_OVERLAY_TOP, 0, 12.0, 0)));
    }

    private void renderContact(SectionBuilder section, NoirCorporateCvSpec spec) {
        sidebarHeading(section, "Contact");
        for (ContactEntry entry : spec.contact()) {
            iconLine(section, entry.icon(), entry.value(),
                    entry.linkUrl().map(DocumentLinkOptions::new).orElse(null));
        }
    }

    private void renderSkills(SectionBuilder section, List<Skill> skills) {
        sidebarHeading(section, "Skills");
        for (Skill skill : skills) {
            ratingRow(section, skill.name(), skill.level());
        }
    }

    private void renderLanguages(SectionBuilder section, List<Skill> languages) {
        sidebarHeading(section, "Languages");
        for (Skill language : languages) {
            ratingRow(section, language.name(), language.level());
        }
    }

    private void renderInterest(SectionBuilder section, NoirCorporateCvSpec spec) {
        sidebarHeading(section, "Interest");
        for (InterestEntry entry : spec.interest()) {
            iconLine(section, entry.icon(), entry.label(), null);
        }
    }

    private void renderMain(SectionBuilder section, NoirCorporateCvSpec spec) {
        // The dark plaque overlaps the main column by SIDEBAR_OVERLAY_LIFT.
        // Push the body content down by that amount + a breathing inset so
        // PROFESSIONAL PROFILE starts cleanly under the plaque.
        section.spacing(0)
                .spacer(MAIN_WIDTH, SIDEBAR_OVERLAY_LIFT + MAIN_BODY_TOP_INSET)
                .addSection("MainBody", inner -> inner
                        .padding(new DocumentInsets(0, MAIN_BODY_PAD_X, 0, MAIN_BODY_PAD_X))
                        .spacing(25)
                        .addSection("ProfessionalProfile", profile -> renderProfile(profile, spec))
                        .addSection("Education", education -> renderEducation(education, spec))
                        .addSection("WorkExperience", experience -> renderWorkExperience(experience, spec)));
    }

    private void renderProfile(SectionBuilder section, NoirCorporateCvSpec spec) {
        mainHeading(section, "Professional Profile");
        body(section, spec.profile());
    }

    private void renderEducation(SectionBuilder section, NoirCorporateCvSpec spec) {
        mainHeading(section, "Education");
        for (EducationEntry entry : spec.education()) {
            educationItem(section, entry);
        }
    }

    private void renderWorkExperience(SectionBuilder section, NoirCorporateCvSpec spec) {
        mainHeading(section, "Work Experience");
        // One continuous vertical line that runs from the first bullet to
        // the last. The negative bottom margin keeps the line from
        // pushing the entries down the page.
        section.addLine(line -> line
                .vertical(TIMELINE_TOTAL_HEIGHT)
                .thickness(0.65)
                .color(BLACK)
                .margin(new DocumentInsets(
                        TIMELINE_TOP_OFFSET, 0, -TIMELINE_TOTAL_HEIGHT, TIMELINE_LINE_LEFT)));
        List<ExperienceEntry> entries = spec.experience();
        for (int i = 0; i < entries.size(); i++) {
            experienceItem(section, entries.get(i));
            if (i < entries.size() - 1) {
                section.spacer(MAIN_WIDTH - MAIN_BODY_PAD_X, TIMELINE_ENTRY_GAP);
            }
        }
    }

    private void experienceItem(SectionBuilder section, ExperienceEntry entry) {
        section.addParagraph(p -> p
                .text("•   " + entry.title())
                .textStyle(style(7.3, BLACK, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 0, 2, 0)));
        section.addParagraph(p -> p
                .text(entry.company())
                .textStyle(style(6.5, MUTED, DocumentTextDecoration.ITALIC))
                .margin(new DocumentInsets(0, 0, 4, 16)));
        if (!entry.highlights().isEmpty()) {
            section.addList(list -> list
                    .bullet()
                    .items(entry.highlights())
                    .textStyle(smallStyle())
                    .lineSpacing(1.08)
                    .margin(new DocumentInsets(0, 0, 0, 22)));
        }
    }

    private void educationItem(SectionBuilder section, EducationEntry entry) {
        section.addParagraph(p -> p
                .text(entry.years())
                .textStyle(style(6.8, BLACK, DocumentTextDecoration.BOLD))
                .margin(new DocumentInsets(0, 6, 3, 6)));
        section.addParagraph(p -> p
                .text(entry.body())
                .textStyle(bodyStyle())
                .lineSpacing(1.18)
                .margin(new DocumentInsets(0, 6, 18, 6)));
    }

    private void iconLine(SectionBuilder section, String iconToken, String value,
                          DocumentLinkOptions link) {
        IconSpec spec = requireSpec(iconToken);
        DocumentImageData iconData = DocumentImageData.fromPath(
                ICONS_DIR.resolve(spec.fileName()));
        section.addParagraph(p -> p
                .name("Icon_" + iconToken)
                .textStyle(sidebarTextStyle())
                .inlineImage(iconData, spec.pointSize(), spec.pointSize(),
                        InlineImageAlignment.CENTER, 0.0, link)
                .inlineText("   " + value, sidebarTextStyle(), link)
                .margin(new DocumentInsets(0, 0, 7, 0)));
    }

    private void ratingRow(SectionBuilder section, String name, double level) {
        int filled = filledDots(level);
        section.addParagraph(p -> {
            p.inlineText(name, sidebarLabelStyle(), null);
            p.inlineText("     ", sidebarLabelStyle(), null);
            for (int i = 0; i < 5; i++) {
                inlineRatingDot(p, i < filled);
                if (i < 4) {
                    p.inlineText(" ", sidebarTextStyle(), null);
                }
            }
            p.margin(new DocumentInsets(0, 0, 7, 0));
        });
    }

    private void inlineRatingDot(ParagraphBuilder paragraph, boolean filled) {
        IconSpec spec = requireSpec(filled ? "rating-filled" : "rating-open");
        DocumentImageData iconData = DocumentImageData.fromPath(
                ICONS_DIR.resolve(spec.fileName()));
        paragraph.inlineImage(iconData, spec.pointSize(), spec.pointSize(),
                InlineImageAlignment.CENTER, 0.0, null);
    }

    private void sidebarHeading(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(letterSpace(text))
                .textStyle(sidebarHeadingStyle())
                .margin(new DocumentInsets(0, 0, 4, 0)));
        section.addLine(line -> line
                .horizontal(INNER_SIDEBAR_WIDTH)
                .thickness(SIDEBAR_RULE_THICK)
                .color(RULE)
                .margin(new DocumentInsets(0, 0, 9, 0)));
    }

    private void mainHeading(SectionBuilder section, String text) {
        DocumentTableStyle barStyle = DocumentTableStyle.builder()
                .fillColor(DARK)
                .stroke(DocumentStroke.of(DARK, 0.0))
                .padding(new DocumentInsets(4.7, 8.0, 4.7, 8.0))
                .textStyle(style(7.3, WHITE, DocumentTextDecoration.BOLD))
                .textAnchor(DocumentTableTextAnchor.CENTER_LEFT)
                .build();
        section.addTable(table -> table
                .name("HeadingBar_" + compactName(text))
                .columns(DocumentTableColumn.fixed(MAIN_WIDTH - 2.0 * MAIN_BODY_PAD_X))
                .defaultCellStyle(barStyle)
                .margin(new DocumentInsets(0, 0, 10, 0))
                .row(letterSpace(text)));
    }

    private void body(SectionBuilder section, String text) {
        section.addParagraph(p -> p
                .text(text)
                .textStyle(bodyStyle())
                .lineSpacing(1.16)
                .margin(new DocumentInsets(0, 6, 20, 6)));
    }

    private static IconSpec requireSpec(String token) {
        IconSpec spec = ICONS.get(token);
        if (spec == null) {
            throw new IllegalStateException("missing icon spec for token: " + token
                    + ". Update assets-manifest.json and the ICONS table.");
        }
        return spec;
    }

    private static int filledDots(double level) {
        double clamped = Math.max(0.0, Math.min(1.0, level));
        return (int) Math.round(clamped * 5.0);
    }

    private static String letterSpace(String text) {
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

    private static String compactName(String text) {
        return text == null ? "" : text.replaceAll("[^A-Za-z0-9]", "");
    }

    private static DocumentTextStyle labelStyle() {
        return style(5.9, BLACK, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle sidebarHeadingStyle() {
        return style(8.8, DARK, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle sidebarLabelStyle() {
        return style(7.2, BLACK, DocumentTextDecoration.BOLD);
    }

    private static DocumentTextStyle sidebarTextStyle() {
        return style(6.8, MUTED, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle bodyStyle() {
        return style(5.55, MUTED, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle smallStyle() {
        return style(5.35, MUTED, DocumentTextDecoration.DEFAULT);
    }

    private static DocumentTextStyle style(double size,
                                           DocumentColor color,
                                           DocumentTextDecoration decoration) {
        boolean heading = decoration == DocumentTextDecoration.BOLD
                || decoration == DocumentTextDecoration.BOLD_ITALIC;
        return DocumentTextStyle.builder()
                .fontName(heading ? HEADING_FONT : BODY_FONT)
                .size(size)
                .color(color)
                .decoration(decoration)
                .build();
    }
}
