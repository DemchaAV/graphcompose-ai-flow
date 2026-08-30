package com.demcha.examples.cv;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.api.PageBackgroundFill;
import com.demcha.compose.document.dsl.EllipseBuilder;
import com.demcha.compose.document.dsl.ImageBuilder;
import com.demcha.compose.document.dsl.LineBuilder;
import com.demcha.compose.document.dsl.ParagraphBuilder;
import com.demcha.compose.document.dsl.RowBuilder;
import com.demcha.compose.document.dsl.SectionBuilder;
import com.demcha.compose.document.dsl.ShapeContainerBuilder;
import com.demcha.compose.document.image.DocumentImageData;
import com.demcha.compose.document.image.DocumentImageFitMode;
import com.demcha.compose.document.node.DocumentLinkOptions;
import com.demcha.compose.document.node.DocumentNode;
import com.demcha.compose.document.node.HorizontalAlign;
import com.demcha.compose.document.node.InlineImageAlignment;
import com.demcha.compose.document.node.LayerAlign;
import com.demcha.compose.document.node.ListMarker;
import com.demcha.compose.document.node.RowVerticalAlign;
import com.demcha.compose.document.node.TextAlign;
import com.demcha.compose.document.style.ClipPolicy;
import com.demcha.compose.document.style.DocumentColor;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentRowColumn;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.style.DocumentTextDecoration;
import com.demcha.compose.document.style.DocumentTextStyle;
import com.demcha.compose.document.svg.SvgIcon;
import com.demcha.compose.font.FontName;

/**
 * Charcoal &amp; Gold CV — a single-page A4 resume built from a supplied design
 * reference.
 *
 * <h2>The page is one row, and that decides everything below it</h2>
 *
 * <p>A full-height charcoal sidebar beside a near-white main column is a
 * top-level {@code addRow}. On GraphCompose 2.2.1 a bare row nested inside a row
 * cell is refused outright — "cannot contain a nested horizontal row" — so every
 * horizontal pair inside either column goes through {@link #layeredRow}, which
 * wraps the row in a {@code LayerStack} layer. That escape is measured, not
 * assumed: {@code node scripts/probe.mjs column-nesting --version 2.2} shows it
 * laying out horizontally in a row cell and still doing so two wrappers deep,
 * and the result is on record as
 * {@code observations/graphcompose-2.2/layered-row-survives-a-row-cell.json}.</p>
 *
 * <p>The two column fills are page backgrounds rather than section fills. A
 * {@code fillColor} on the sidebar section is bounded by its content and would
 * stop short of the bottom paper edge; {@link PageBackgroundFill#leftColumn}
 * takes its geometry from the page and repeats on every page.</p>
 *
 * <h2>Why not addTimeline for the experience block</h2>
 *
 * <p>{@code addTimeline} draws its rail as a left border on each entry and puts
 * the marker to the right of it, with the meta line under the title. This
 * reference puts the date on the far side of the rail and centres an open marker
 * ON it, and the builder has no knob for either. It also builds a row
 * internally, so it is refused in a row cell for the same reason a bare row is.
 * {@link #renderExperience} reaches for the same mechanism directly:
 * {@code accentLeft} on the entry's content cell is an auto-stretching left
 * border whose height derives from the entry rather than from a number tuned
 * against today's text.</p>
 *
 * <h2>Geometry</h2>
 *
 * <p>Widths derive from {@link #PAGE_WIDTH} and {@link #SIDEBAR_WEIGHT}; the
 * page-background columns and the layout row take the same two numbers, so the
 * fill and the content column cannot drift apart. Only genuinely independent
 * dimensions — marker diameter, rating-dot diameter, rule thickness — are
 * written as points. Icon sizes come from {@code assets-manifest.json}, so the
 * flow rather than this file decides how large each icon renders.</p>
 *
 * <p>Content comes entirely from {@link CharcoalGoldCvSpec}: there are no
 * content literals below.</p>
 */
public final class GeneratedCvTemplate {

    // ---------------------------------------------------------------- assets

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));

    /** One resolved icon, as the manifest describes it. */
    private record IconAsset(Path file, String format, double pointSize) {
    }

    private static final Map<String, IconAsset> ICONS = readIconManifest();

    // ------------------------------------------------------------ typography

    private static final FontName FONT = FontName.LATO;

    // Calibrated against the first render, not estimated from cap heights. Each
    // size was set by measuring the same run in reference-scaled.png and
    // output.png at 1240x1753 and scaling by the ratio: cap-height arithmetic put
    // every one of them a few per cent small, which was enough to move where the
    // summary and the first achievement bullet wrap.
    private static final double BODY_SIZE = 9.1;
    private static final double NAME_GIVEN_SIZE = 35.7;
    private static final double NAME_FAMILY_SIZE = 45.5;
    private static final double JOB_TITLE_SIZE = 11.6;
    private static final double MAIN_HEADING_SIZE = 11.0;
    private static final double SIDEBAR_HEADING_SIZE = 10.0;
    private static final double ROLE_SIZE = 10.5;
    private static final double EMPLOYER_SIZE = 6.9;
    private static final double DETAIL_SIZE = 7.8;
    private static final double SMALL_SIZE = 7.9;

    /** Line box as a multiple of type size — used to turn measured pitches into gaps. */
    private static final double LINE_FACTOR = 1.2;

    // ----------------------------------------------------------- theme tokens

    private static final DocumentColor SIDEBAR = DocumentColor.rgb(39, 45, 50);
    private static final DocumentColor PAPER = DocumentColor.rgb(254, 254, 254);
    private static final DocumentColor ACCENT = DocumentColor.rgb(186, 148, 88);
    private static final DocumentColor INK = DocumentColor.rgb(39, 45, 50);
    private static final DocumentColor SIDEBAR_INK = DocumentColor.rgb(251, 251, 251);
    private static final DocumentColor RULE = DocumentColor.rgb(218, 218, 219);
    private static final DocumentColor SIDEBAR_RULE = DocumentColor.rgb(61, 67, 69);
    private static final DocumentColor RATING_EMPTY = DocumentColor.rgb(119, 122, 125);

    // -------------------------------------------------------- page + columns

    private static final double PAGE_WIDTH = 595.276;

    /** Measured 337px of the reference's 1054. Everything horizontal derives from this. */
    private static final double SIDEBAR_WEIGHT = 0.3197;
    private static final double MAIN_WEIGHT = 1.0 - SIDEBAR_WEIGHT;

    private static final double SIDEBAR_PAD = 17.0;
    private static final double SIDEBAR_PAD_TOP = 24.3;
    private static final double SIDEBAR_CONTENT_WIDTH =
            PAGE_WIDTH * SIDEBAR_WEIGHT - 2.0 * SIDEBAR_PAD;

    private static final double MAIN_PAD_LEFT = 23.7;
    private static final double MAIN_PAD_RIGHT = 28.8;
    // Measured, not chosen: with the rhythm calibrated, every main-column
    // landmark still sat 9px low on the 1240px raster — one constant that size in
    // every block is the column's top padding.
    private static final double MAIN_PAD_TOP = 25.7;
    private static final double MAIN_CONTENT_WIDTH =
            PAGE_WIDTH * MAIN_WEIGHT - MAIN_PAD_LEFT - MAIN_PAD_RIGHT;

    // ------------------------------------------------------- fixed fine marks

    private static final double ACCENT_BAR_WIDTH = 1.7;
    private static final double HEADING_INDENT = 9.0;
    private static final double RULE_THICKNESS = 0.6;
    private static final double MARKER_DIAMETER = 6.2;
    private static final double RATING_DOT_DIAMETER = 4.5;
    /** Measured 4px on the reference's 1054px raster — smaller than a rating dot. */
    private static final double SKILL_BULLET_DIAMETER = 2.3;
    /** The reference indents a skill name 9.5pt past the sidebar padding; the bullet lives there. */
    private static final double SKILL_BULLET_COLUMN = 9.5;
    private static final double PHOTO_RING_WIDTH = 1.2;

    // --------------------------------------------------------------- rhythm

    private static final double PHOTO_DIAMETER = SIDEBAR_CONTENT_WIDTH * 0.802;
    private static final double PHOTO_TO_CONTACT = 29.4;
    private static final double HEADING_TO_BODY = 12.0;
    private static final double BLOCK_TO_DIVIDER = 19.0;
    private static final double DIVIDER_TO_HEADING = 17.0;

    private static final double CONTACT_PITCH = 19.2;
    /*
     * A contact line takes its line box from its type, not from its icon. That
     * was worth two revisions to establish. The box measured 12.96pt for four of
     * them, which was the right number for the wrong reason — the extra height
     * was the unstyled spacer run between the icon and the value, which
     * DocumentTextStyle defaults to 14pt. Replacing that measurement with
     * max(type, icon) then undershot, at 37px against the reference's 40: a 9pt
     * inline icon does not raise a 7.8pt line box at all. So these rows use the
     * same gap(pitch, type) every other sidebar row uses.
     */
    private static final double SKILL_PITCH = 16.6;
    private static final double LANGUAGE_PITCH = 16.9;
    private static final double EDUCATION_LINE_PITCH = 12.4;
    private static final double EDUCATION_ENTRY_GAP = 13.7;
    private static final double EDUCATION_INDENT = 12.4;

    // The surname's own line box supplies the gap under it; a margin on top of
    // that ran the job title 30px below where the reference puts it.
    private static final double MASTHEAD_TO_TITLE = 0.0;
    private static final double TITLE_TO_RULE = 12.0;
    private static final double MASTHEAD_RULE_WIDTH = MAIN_CONTENT_WIDTH * 0.093;
    private static final double RULE_TO_SUMMARY = 17.8;
    private static final double SUMMARY_TO_EXPERIENCE = 28.4;
    private static final double EXPERIENCE_TO_ENTRIES = 19.0;
    private static final double ENTRY_GAP = 19.6;
    private static final double ENTRIES_TO_RULE = 18.0;
    private static final double CREDENTIALS_TO_TOOLS = 13.7;

    /** Timeline columns, as fractions of the main content width. */
    private static final double DATE_WEIGHT = 0.194;
    private static final double MARKER_WEIGHT = MARKER_DIAMETER / MAIN_CONTENT_WIDTH;
    private static final double ENTRY_WEIGHT = 1.0 - DATE_WEIGHT - MARKER_WEIGHT;
    private static final double ENTRY_INDENT = 16.0;

    /** Credential columns: certifications, gutter, achievements — summing to one. */
    private static final double CREDENTIAL_LEFT_WEIGHT = 0.402;
    private static final double CREDENTIAL_GUTTER_WEIGHT = 0.124;
    private static final double CREDENTIAL_RIGHT_WEIGHT =
            1.0 - CREDENTIAL_LEFT_WEIGHT - CREDENTIAL_GUTTER_WEIGHT;
    private static final double CREDENTIAL_ICON_WEIGHT = 0.14;
    private static final double CREDENTIAL_HALF_GUTTER =
            MAIN_CONTENT_WIDTH * CREDENTIAL_GUTTER_WEIGHT / 2.0;
    private static final double RULE_TO_CREDENTIALS = 22.0;
    private static final double CREDENTIAL_ENTRY_GAP = 6.5;
    /** The credential heading sits further off its first entry than a sidebar one does. */
    private static final double CREDENTIAL_HEADING_TO_BODY = 17.3;

    // ========================================================================

    /**
     * Composes the CV into {@code document}. The caller owns the session and its
     * rendering; this method only describes the page.
     *
     * @param document open session, already sized A4 with zero margins
     * @param cv       the candidate's data, from {@code cv-data.json}
     */
    public void compose(DocumentSession document, CharcoalGoldCvSpec cv) {
        renderPageChrome(document);

        document.pageFlow(page -> page
                .name("CharcoalGoldCv")
                .spacing(0)
                .addRow("Body", row -> {
                    row.name("Body");
                    row.spacing(0);
                    row.weights(SIDEBAR_WEIGHT, MAIN_WEIGHT);
                    row.addSection("Sidebar", side -> renderSidebar(side, cv));
                    row.addSection("MainColumn", main -> renderMainColumn(main, cv));
                }));
    }

    // ------------------------------------------------------------- page chrome

    /**
     * The two full-height column fills.
     *
     * <p>Page backgrounds, not section fills: the engine takes their geometry
     * from the page canvas, so they reach all four paper edges however little
     * content a column happens to carry, and repeat on any continuation page.</p>
     */
    private void renderPageChrome(DocumentSession document) {
        document.pageBackgrounds(List.of(
                PageBackgroundFill.leftColumn(SIDEBAR_WEIGHT, SIDEBAR),
                PageBackgroundFill.rightColumn(MAIN_WEIGHT, PAPER)));
    }

    // ---------------------------------------------------------------- sidebar

    private void renderSidebar(SectionBuilder side, CharcoalGoldCvSpec cv) {
        side.name("Sidebar");
        side.spacing(0);
        // No bottom padding: the sidebar's fill is a page background that already
        // reaches the paper edge, so padding here would only shorten the column.
        side.padding((float) SIDEBAR_PAD_TOP, (float) SIDEBAR_PAD, 0f, (float) SIDEBAR_PAD);

        renderProfilePhoto(side, cv);
        renderContact(side, cv);
        sidebarDivider(side, "AfterContact");
        renderSkills(side, cv);
        sidebarDivider(side, "AfterSkills");
        renderLanguages(side, cv);
        sidebarDivider(side, "AfterLanguages");
        renderEducation(side, cv);
    }

    /**
     * The circular portrait.
     *
     * <p>The circle owns the photograph — it is the container's centred child
     * under {@link ClipPolicy#CLIP_PATH} — so the silhouette belongs to the shape
     * rather than to a pre-clipped picture, and the pale ring is the same
     * circle's stroke rather than a second shape behind it. No margin goes on the
     * container: on this line a shape container paints its fill above its layout
     * box by its own bottom margin (observation
     * {@code shape-container-margin-paints-high}), so the gap under the photo is
     * carried by the block that follows.</p>
     */
    private void renderProfilePhoto(SectionBuilder side, CharcoalGoldCvSpec cv) {
        Path photo = REVISION_DIR.resolve(cv.identity().photo());
        DocumentNode portrait = new ImageBuilder()
                .name("PortraitImage")
                .source(DocumentImageData.fromPath(photo))
                .size(PHOTO_DIAMETER, PHOTO_DIAMETER)
                .fitMode(DocumentImageFitMode.COVER)
                .build();

        DocumentNode circle = new ShapeContainerBuilder()
                .name("ProfilePhoto")
                .circle(PHOTO_DIAMETER)
                .clipPolicy(ClipPolicy.CLIP_PATH)
                .fillColor(SIDEBAR)
                .stroke(DocumentStroke.of(RULE, PHOTO_RING_WIDTH))
                .center(portrait)
                .build();

        side.addAligned(HorizontalAlign.CENTER, circle);
    }

    /**
     * CONTACT — five icon-and-value lines.
     *
     * <p>Each line is a single paragraph, not a row: the icon is an inline SVG
     * run measured into the line box, so it shares a baseline with its value by
     * construction instead of by a computed offset. The value's {@code href}
     * becomes an inline link on that run, so the target reaches the PDF as a real
     * annotation.</p>
     */
    private void renderContact(SectionBuilder side, CharcoalGoldCvSpec cv) {
        side.addSection("Contact", block -> {
            block.spacing(0);
            block.margin((float) PHOTO_TO_CONTACT, 0f, 0f, 0f);
            sidebarHeading(block, cv.contact().heading());

            List<CharcoalGoldCvSpec.ContactItem> items = cv.contact().items();
            for (int i = 0; i < items.size(); i++) {
                CharcoalGoldCvSpec.ContactItem item = items.get(i);
                boolean first = i == 0;
                int index = i;
                block.addParagraph(p -> {
                    p.name("Contact_" + index);
                    inlineIcon(p, item.icon());
                    inlineGap(p, textStyle(DETAIL_SIZE, SIDEBAR_INK, false));
                    if (item.href() == null || item.href().isBlank()) {
                        p.inlineText(item.value(), textStyle(DETAIL_SIZE, SIDEBAR_INK, false));
                    } else {
                        p.inlineText(item.value(), textStyle(DETAIL_SIZE, SIDEBAR_INK, false),
                                new DocumentLinkOptions(item.href()));
                    }
                    p.margin(first ? (float) HEADING_TO_BODY : 0f, 0f,
                            (float) gap(CONTACT_PITCH, DETAIL_SIZE), 0f);
                });
            }
        });
    }

    /**
     * SKILLS — a name and a five-dot rating on one line.
     *
     * <p>The rating is drawn as inline shape runs rather than a bullet glyph, so
     * it cannot fall victim to whatever the fallback font does or does not ship.
     * Name and rating are a real two-column pair, so this is a row — and inside a
     * row cell that means {@link #layeredRow}.</p>
     */
    private void renderSkills(SectionBuilder side, CharcoalGoldCvSpec cv) {
        side.addSection("Skills", block -> {
            block.spacing(0);
            block.margin((float) DIVIDER_TO_HEADING, 0f, 0f, 0f);
            sidebarHeading(block, cv.skills().heading());

            int scale = cv.skills().ratingScale();
            List<CharcoalGoldCvSpec.Skill> items = cv.skills().items();
            for (int i = 0; i < items.size(); i++) {
                CharcoalGoldCvSpec.Skill skill = items.get(i);
                boolean first = i == 0;
                int index = i;
                layeredRow(block, "Skill_" + index,
                        first ? HEADING_TO_BODY : 0.0,
                        gap(SKILL_PITCH, DETAIL_SIZE),
                        row -> {
                            row.verticalAlign(RowVerticalAlign.CENTER);
                            // The bullet gets a column of its own rather than an
                            // inline run plus counted spaces: its width is the
                            // reference's own name indent, so the mark and the
                            // name both land where the reference puts them and
                            // neither depends on how wide a space happens to be.
                            row.columns(
                                    DocumentRowColumn.fixed(SKILL_BULLET_COLUMN),
                                    DocumentRowColumn.weight(0.72),
                                    DocumentRowColumn.weight(0.28));
                            row.addParagraph(p -> p
                                    .name("SkillBullet_" + index)
                                    .align(TextAlign.CENTER)
                                    // Styled even though it holds no text: a
                                    // paragraph takes its line box from its type
                                    // whether or not any glyph uses it, and the
                                    // 14pt default set the whole row's pitch.
                                    .textStyle(textStyle(DETAIL_SIZE, SIDEBAR_INK, false))
                                    .dot(SKILL_BULLET_DIAMETER, ACCENT));
                            row.addParagraph(p -> p
                                    .name("SkillName_" + index)
                                    .text(skill.name())
                                    .textStyle(textStyle(DETAIL_SIZE, SIDEBAR_INK, false)));
                            row.addParagraph(p -> {
                                p.name("SkillRating_" + index);
                                p.align(TextAlign.RIGHT);
                                for (int d = 0; d < scale; d++) {
                                    p.dot(RATING_DOT_DIAMETER,
                                            d < skill.rating() ? ACCENT : RATING_EMPTY);
                                    if (d < scale - 1) {
                                        p.inlineText(" ", textStyle(DETAIL_SIZE, SIDEBAR_INK, false));
                                    }
                                }
                            });
                        });
            }
        });
    }

    /** LANGUAGES — a language and its level, sharing one column edge down the block. */
    private void renderLanguages(SectionBuilder side, CharcoalGoldCvSpec cv) {
        side.addSection("Languages", block -> {
            block.spacing(0);
            block.margin((float) DIVIDER_TO_HEADING, 0f, 0f, 0f);
            sidebarHeading(block, cv.languages().heading());

            List<CharcoalGoldCvSpec.Language> items = cv.languages().items();
            for (int i = 0; i < items.size(); i++) {
                CharcoalGoldCvSpec.Language language = items.get(i);
                boolean first = i == 0;
                int index = i;
                layeredRow(block, "Language_" + index,
                        first ? HEADING_TO_BODY : 0.0,
                        gap(LANGUAGE_PITCH, BODY_SIZE),
                        row -> {
                            row.weights(0.36, 0.64);
                            row.addParagraph(p -> p
                                    .name("LanguageName_" + index)
                                    .text(language.name())
                                    .textStyle(textStyle(BODY_SIZE, SIDEBAR_INK, false)));
                            row.addParagraph(p -> p
                                    .name("LanguageLevel_" + index)
                                    .text(language.level())
                                    .textStyle(textStyle(BODY_SIZE, SIDEBAR_INK, false)));
                        });
            }
        });
    }

    /**
     * EDUCATION — a gold bullet on the degree line, the rest hanging under it.
     *
     * <p>The bullet is an inline dot on the degree's own line, so the entry is
     * indented by one constant rather than by a marker column that the
     * institution and year lines would then have to dodge.</p>
     */
    private void renderEducation(SectionBuilder side, CharcoalGoldCvSpec cv) {
        side.addSection("Education", block -> {
            block.spacing(0);
            block.margin((float) DIVIDER_TO_HEADING, 0f, 0f, 0f);
            sidebarHeading(block, cv.education().heading());

            List<CharcoalGoldCvSpec.EducationEntry> items = cv.education().items();
            for (int i = 0; i < items.size(); i++) {
                CharcoalGoldCvSpec.EducationEntry entry = items.get(i);
                boolean first = i == 0;
                int index = i;
                block.addSection("EducationEntry_" + index, e -> {
                    e.spacing(0);
                    e.margin(first ? (float) HEADING_TO_BODY : (float) EDUCATION_ENTRY_GAP,
                            0f, 0f, 0f);
                    e.addParagraph(p -> {
                        p.name("Degree_" + index);
                        p.dot(RATING_DOT_DIAMETER, ACCENT);
                        inlineGap(p, textStyle(DETAIL_SIZE, SIDEBAR_INK, false));
                        p.inlineText(entry.degree(), textStyle(DETAIL_SIZE, SIDEBAR_INK, true));
                        p.margin(0f, 0f, (float) gap(EDUCATION_LINE_PITCH, DETAIL_SIZE), 0f);
                    });
                    e.addSection("EducationDetail_" + index, d -> {
                        d.spacing(0);
                        d.padding(0f, 0f, 0f, (float) EDUCATION_INDENT);
                        d.addParagraph(p -> p
                                .name("Institution_" + index)
                                .text(entry.institution())
                                .textStyle(textStyle(DETAIL_SIZE, SIDEBAR_INK, false))
                                .margin(0f, 0f, (float) gap(EDUCATION_LINE_PITCH, DETAIL_SIZE), 0f));
                        d.addParagraph(p -> p
                                .name("Period_" + index)
                                .text(entry.period())
                                .textStyle(textStyle(DETAIL_SIZE, SIDEBAR_INK, false)));
                    });
                });
            }
        });
    }

    // ------------------------------------------------------------ main column

    private void renderMainColumn(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.name("MainColumn");
        main.spacing(0);
        main.padding((float) MAIN_PAD_TOP, (float) MAIN_PAD_RIGHT, 0f, (float) MAIN_PAD_LEFT);

        renderMasthead(main, cv);
        renderSummary(main, cv);
        renderExperience(main, cv);
        renderCredentials(main, cv);
        renderTechnicalTools(main, cv);
    }

    /**
     * The name block.
     *
     * <p>Two paragraphs rather than one line in two colours: the reference sets
     * the surname larger as well as gold, and both lines are flush to the main
     * column's left edge. The rule under the job title is derived from the
     * content width, not measured in points.</p>
     */
    private void renderMasthead(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.addSection("Masthead", block -> {
            block.spacing(0);
            block.addParagraph(p -> p
                    .name("GivenName")
                    .text(cv.identity().givenName())
                    .textStyle(textStyle(NAME_GIVEN_SIZE, INK, false))
                    .lineSpacing(1.0));
            block.addParagraph(p -> p
                    .name("FamilyName")
                    .text(cv.identity().familyName())
                    .textStyle(textStyle(NAME_FAMILY_SIZE, ACCENT, false))
                    .lineSpacing(1.0)
                    .margin(0f, 0f, (float) MASTHEAD_TO_TITLE, 0f));
            block.addParagraph(p -> p
                    .name("JobTitle")
                    .text(tracked(cv.identity().jobTitle()))
                    .textStyle(textStyle(JOB_TITLE_SIZE, INK, false))
                    .margin(0f, 0f, (float) TITLE_TO_RULE, 0f));
            block.addLine(line -> line
                    .name("MastheadRule")
                    .horizontal(MASTHEAD_RULE_WIDTH)
                    .thickness(1.4)
                    .color(ACCENT));
        });
    }

    /** The profile paragraphs, set at one pitch across the paragraph boundary. */
    private void renderSummary(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.addSection("Summary", block -> {
            block.spacing(0);
            block.margin((float) RULE_TO_SUMMARY, 0f, 0f, 0f);
            List<String> paragraphs = cv.summary();
            for (int i = 0; i < paragraphs.size(); i++) {
                int index = i;
                block.addParagraph(p -> p
                        .name("Summary_" + index)
                        .text(paragraphs.get(index))
                        .textStyle(textStyle(BODY_SIZE, INK, false))
                        .lineSpacing(1.38));
            }
        });
    }

    /**
     * EXPERIENCE — a dated timeline.
     *
     * <p>Each entry is a row of three cells: the gold date, the marker, and the
     * content. The rail is {@code accentLeft} on the content cell, which stretches
     * to whatever height the entry turns out to have; the row carries no spacing
     * and the inter-entry gap lives inside the content cell as bottom padding, so
     * consecutive accents butt together and the rail reads as one line rather than
     * three segments. The marker is an open ring — page-coloured fill, rule-coloured
     * stroke — nudged right by its own radius so its centre lands on the rail;
     * that offset is half the marker, not a number tuned by eye.</p>
     */
    private void renderExperience(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.addSection("Experience", block -> {
            block.spacing(0);
            block.margin((float) SUMMARY_TO_EXPERIENCE, 0f, 0f, 0f);
            block.keepTogether();
            mainHeading(block, cv.experience().heading());

            List<CharcoalGoldCvSpec.ExperienceEntry> entries = cv.experience().entries();
            for (int i = 0; i < entries.size(); i++) {
                CharcoalGoldCvSpec.ExperienceEntry entry = entries.get(i);
                boolean first = i == 0;
                boolean last = i == entries.size() - 1;
                int index = i;
                layeredRow(block, "ExperienceEntry_" + index,
                        first ? EXPERIENCE_TO_ENTRIES : 0.0,
                        0.0,
                        row -> {
                            row.spacing(0);
                            // Two cells, not three. The marker used to have a
                            // column of its own, which is what put it in a
                            // different node from the rail and left the rail free
                            // to paint straight through it; the date column now
                            // carries that width instead, so the body's left
                            // border lands in exactly the same place.
                            row.weights(DATE_WEIGHT + MARKER_WEIGHT, ENTRY_WEIGHT);
                            row.addParagraph(p -> p
                                    .name("Period_" + index)
                                    .text(entry.period())
                                    .textStyle(textStyle(DETAIL_SIZE, ACCENT, false)));
                            row.addSection("EntryBody_" + index, body -> {
                                body.spacing(0);
                                body.accentLeft(RULE, RULE_THICKNESS);
                                body.padding(0f, 0f, last ? 0f : (float) ENTRY_GAP,
                                        (float) ENTRY_INDENT);
                                markerCappedTitle(body, entry.role(), index);
                                body.addParagraph(p -> p
                                        .name("Employer_" + index)
                                        .text(entry.employer() + "   ·   " + entry.location())
                                        .textStyle(textStyle(EMPLOYER_SIZE, INK, true))
                                        .margin(0f, 0f, 7f, 0f));
                                body.addList(list -> list
                                        .name("Highlights_" + index)
                                        .items(entry.highlights())
                                        .marker(ListMarker.bullet())
                                        .textStyle(textStyle(SMALL_SIZE, INK, false))
                                        .itemSpacing(4.0)
                                        .lineSpacing(1.3));
                            });
                        });
            }
        });
    }

    /**
     * The role title with the marker ring capping the rail beside it.
     *
     * <p>The ring has to paint OVER the rail, and paint order follows the node
     * tree: a ring in the neighbouring row cell is drawn before the body section
     * that owns the rail, so the rail crossed it — the reference's ring is a
     * clean circle with the rail entering at its top edge and nothing inside it.
     * Putting the ring in the same node as the rail, one layer above the title,
     * is what settles the order. Its page-coloured fill then hides the rail's
     * first six points, which is what makes the ring read as the rail's cap.</p>
     *
     * <p>The horizontal offset is derived, not tuned: back out the body's own
     * left padding to reach the border, then back out half the ring so its centre
     * lands on it. Vertically it sits at the layer's top, which is the body's top
     * and therefore the rail's start — the same relationship the reference has,
     * where the ring's top edge and the rail's first pixel are the same row.</p>
     */
    private void markerCappedTitle(SectionBuilder body, String role, int index) {
        SectionBuilder titleLayer = new SectionBuilder();
        titleLayer.name("RoleLayer_" + index);
        titleLayer.spacing(0);
        titleLayer.addParagraph(p -> p
                .name("Role_" + index)
                .text(role)
                .textStyle(textStyle(ROLE_SIZE, INK, true)));

        body.addLayerStack(stack -> stack
                .name("MarkerCap_" + index)
                .margin(new DocumentInsets(0, 0, 3, 0))
                .layer(titleLayer.build(), LayerAlign.TOP_LEFT, 0)
                .position(marker(index),
                        -(ENTRY_INDENT + MARKER_DIAMETER / 2.0), 0.0,
                        LayerAlign.TOP_LEFT, 1));
    }

    /**
     * The open ring that caps the rail.
     *
     * <p>An ellipse rather than a shape container: a container is a parent, and
     * this line refuses one with no children ("must have at least one layer").
     * The ring carries no content — its page-coloured fill is what hides the rail
     * behind it — so the shape node is the right primitive for it.</p>
     */
    private DocumentNode marker(int index) {
        return new EllipseBuilder()
                .name("MarkerRing_" + index)
                .circle(MARKER_DIAMETER)
                .fillColor(PAPER)
                .stroke(DocumentStroke.of(INK, 0.8))
                .build();
    }

    /**
     * CERTIFICATIONS and ACHIEVEMENTS, side by side with a rule between them.
     *
     * <p>The divider is the middle cell of the row, so it is centred in the
     * gutter by the row's own weights rather than by a measured x.</p>
     */
    private void renderCredentials(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.addSection("Credentials", block -> {
            block.spacing(0);
            block.margin((float) ENTRIES_TO_RULE, 0f, 0f, 0f);
            block.addLine(line -> line
                    .name("CredentialsRule")
                    .fill()
                    .thickness(RULE_THICKNESS)
                    .color(RULE));
            layeredRow(block, "CredentialColumns", RULE_TO_CREDENTIALS, 0.0, row -> {
                row.spacing(0);
                // Two cells, not three: the gutter is split down the middle and
                // half given to each column, so the divider can be the right-hand
                // column's own left border and take its height from that column's
                // content. A third cell holding a line would need a height, and a
                // height here could only be computed against today's text.
                row.weights(
                        CREDENTIAL_LEFT_WEIGHT + CREDENTIAL_GUTTER_WEIGHT / 2.0,
                        CREDENTIAL_RIGHT_WEIGHT + CREDENTIAL_GUTTER_WEIGHT / 2.0);
                row.addSection("Certifications", column ->
                        renderCertifications(column, cv));
                row.addSection("Achievements", column -> {
                    renderCredentialsDivider(column);
                    renderAchievements(column, cv);
                });
            });
        });
    }

    private void renderCertifications(SectionBuilder column, CharcoalGoldCvSpec cv) {
        column.padding(0f, (float) CREDENTIAL_HALF_GUTTER, 0f, 0f);
        renderCredentialColumn(column, "Certification", cv.certifications());
    }

    private void renderAchievements(SectionBuilder column, CharcoalGoldCvSpec cv) {
        renderCredentialColumn(column, "Achievement", cv.achievements());
    }

    /**
     * The vertical hairline between the two credential columns.
     *
     * <p>It is the achievements column's own left border, and that column's cell
     * begins at the middle of the gutter with half the gutter as padding — so the
     * rule lands centred between the two columns by construction, and is exactly
     * as tall as the content beside it. Drawn instead as a line in a gutter cell
     * it would need a height in points, and the only available height would be one
     * counted off today's entries.</p>
     */
    private void renderCredentialsDivider(SectionBuilder column) {
        column.accentLeft(RULE, RULE_THICKNESS);
        column.padding(0f, 0f, 0f, (float) CREDENTIAL_HALF_GUTTER);
    }

    /**
     * One credential column. The two blocks are the same shape, so they share
     * this renderer and differ only in their weight and their icon tokens.
     */
    private void renderCredentialColumn(SectionBuilder column, String prefix,
                                        CharcoalGoldCvSpec.Credentials credentials) {
        column.spacing(0);
        column.keepTogether();
        mainHeadingPlain(column, credentials.heading());

        List<CharcoalGoldCvSpec.CredentialItem> items = credentials.items();
        for (int i = 0; i < items.size(); i++) {
            CharcoalGoldCvSpec.CredentialItem item = items.get(i);
            boolean first = i == 0;
            boolean last = i == items.size() - 1;
            int index = i;
            layeredRow(column, prefix + "_" + index,
                    first ? CREDENTIAL_HEADING_TO_BODY : CREDENTIAL_ENTRY_GAP,
                    0.0,
                    row -> {
                        row.spacing(0);
                        row.weights(CREDENTIAL_ICON_WEIGHT, 1.0 - CREDENTIAL_ICON_WEIGHT);
                        row.addSection(prefix + "Icon_" + index, cell -> blockIcon(cell, item.icon()));
                        row.addSection(prefix + "Text_" + index, text -> {
                            text.spacing(0);
                            text.addParagraph(p -> p
                                    .name(prefix + "Name_" + index)
                                    .text(item.name())
                                    .textStyle(textStyle(DETAIL_SIZE, INK, true))
                                    .margin(0f, 0f, 2f, 0f));
                            text.addParagraph(p -> p
                                    .name(prefix + "Issuer_" + index)
                                    .text(item.issuer())
                                    .textStyle(textStyle(SMALL_SIZE, INK, false))
                                    .margin(0f, 0f, 2f, 0f));
                            text.addParagraph(p -> p
                                    .name(prefix + "Year_" + index)
                                    .text(item.year())
                                    .textStyle(textStyle(SMALL_SIZE, INK, false)));
                        });
                    });
            if (!last) {
                column.addLine(line -> line
                        .name(prefix + "Rule_" + index)
                        .fill()
                        .thickness(RULE_THICKNESS)
                        .color(RULE)
                        .margin(new DocumentInsets(CREDENTIAL_ENTRY_GAP, 0, 0, 0)));
            }
        }
    }

    /**
     * TECHNICAL TOOLS — one centred line of names with thin separators.
     *
     * <p>The reference's slots are sized to their text rather than to a fixed
     * grid: each name's midpoint sits within a pixel of its separator pair's
     * midpoint. That is what a run of inline text does on its own, and what a
     * six-column table would not.</p>
     */
    private void renderTechnicalTools(SectionBuilder main, CharcoalGoldCvSpec cv) {
        main.addSection("TechnicalTools", block -> {
            block.spacing(0);
            block.margin((float) CREDENTIALS_TO_TOOLS, 0f, 0f, 0f);
            block.keepWithNext();
            mainHeading(block, cv.technicalTools().heading());

            List<String> tools = cv.technicalTools().items();
            block.addParagraph(p -> {
                p.name("ToolsStrip");
                p.align(TextAlign.CENTER);
                p.margin((float) HEADING_TO_BODY, 0f, 0f, 0f);
                for (int i = 0; i < tools.size(); i++) {
                    if (i > 0) {
                        p.inlineText("     |     ", textStyle(DETAIL_SIZE, RULE, false));
                    }
                    p.inlineText(tools.get(i), textStyle(DETAIL_SIZE, INK, false));
                }
            });
        });
    }

    // ---------------------------------------------------------------- shared

    /**
     * A sidebar section heading: a gold bar pinned to the left of tracked caps.
     *
     * <p>The bar is the section's own left accent, so it is exactly as tall as
     * the heading line and moves with it — rather than a shape whose height would
     * have to be kept in step by hand.</p>
     */
    private void sidebarHeading(SectionBuilder block, String text) {
        block.addSection("Heading_" + compact(text), heading -> heading
                .spacing(0)
                .accentLeft(ACCENT, ACCENT_BAR_WIDTH)
                .padding(0f, 0f, 0f, (float) HEADING_INDENT)
                .addParagraph(p -> p
                        .name("HeadingText_" + compact(text))
                        .text(text)
                        .textStyle(textStyle(SIDEBAR_HEADING_SIZE, SIDEBAR_INK, false))));
    }

    /** A main-column heading: gold bar, caps, and a hairline filling the rest of the line. */
    private void mainHeading(SectionBuilder block, String text) {
        block.addSection("Heading_" + compact(text), heading -> {
            heading.spacing(0);
            heading.accentLeft(ACCENT, ACCENT_BAR_WIDTH);
            heading.padding(0f, 0f, 0f, (float) HEADING_INDENT);
            layeredRow(heading, "HeadingRow_" + compact(text), 0.0, 0.0, row -> {
                row.verticalAlign(RowVerticalAlign.CENTER);
                row.columns(DocumentRowColumn.auto(), DocumentRowColumn.weight(1.0));
                row.addParagraph(p -> p
                        .name("HeadingText_" + compact(text))
                        .text(text)
                        .textStyle(textStyle(MAIN_HEADING_SIZE, INK, false)));
                row.addLine(line -> line
                        .name("HeadingRule_" + compact(text))
                        .fill()
                        .thickness(RULE_THICKNESS)
                        .color(RULE)
                        .margin(new DocumentInsets(0, 0, 0, HEADING_INDENT)));
            });
        });
    }

    /** A main-column heading with no trailing rule — used inside the credential columns. */
    private void mainHeadingPlain(SectionBuilder block, String text) {
        block.addSection("Heading_" + compact(text), heading -> heading
                .spacing(0)
                .accentLeft(ACCENT, ACCENT_BAR_WIDTH)
                .padding(0f, 0f, 0f, (float) HEADING_INDENT)
                .addParagraph(p -> p
                        .name("HeadingText_" + compact(text))
                        .text(text)
                        .textStyle(textStyle(MAIN_HEADING_SIZE, INK, false))));
    }

    private void sidebarDivider(SectionBuilder side, String name) {
        side.addLine(line -> line
                .name("Divider_" + name)
                .fill()
                .thickness(RULE_THICKNESS)
                .color(SIDEBAR_RULE)
                .margin(new DocumentInsets(BLOCK_TO_DIVIDER, 0, 0, 0)));
    }

    /**
     * The one way this template builds a horizontal pair.
     *
     * <p>Every column of this page is a row cell, and on 2.2.1 a bare row nested
     * there is refused by the layout compiler. Wrapping it in a LayerStack layer
     * is the supported escape and lays out horizontally — measured by the
     * {@code column-nesting} probe, including two wrappers deep, which is what
     * the credential entries need.</p>
     *
     * @param parent      the column or block the row belongs to
     * @param name        node name, so the row is addressable in a layout snapshot
     * @param marginTop   gap above the row
     * @param marginBottom gap below it
     * @param spec        the row itself
     */
    private void layeredRow(SectionBuilder parent, String name, double marginTop,
                            double marginBottom, Consumer<RowBuilder> spec) {
        SectionBuilder layer = new SectionBuilder();
        layer.name(name + "Layer");
        layer.spacing(0);
        layer.addRow(name, spec);
        parent.addLayerStack(stack -> stack
                .name(name + "Stack")
                .margin(new DocumentInsets(marginTop, 0, marginBottom, 0))
                .layer(layer.build(), LayerAlign.TOP_LEFT, 0));
    }

    /** Places a resolved icon inline, on the text baseline of the paragraph it opens. */
    private void inlineIcon(ParagraphBuilder paragraph, String token) {
        IconAsset icon = requireIcon(token);
        if ("svg".equals(icon.format())) {
            paragraph.inlineSvgIcon(readSvg(icon), icon.pointSize(), InlineImageAlignment.CENTER);
        } else {
            paragraph.inlineImage(DocumentImageData.fromPath(icon.file()),
                    icon.pointSize(), icon.pointSize(), InlineImageAlignment.CENTER);
        }
    }

    /** Places a resolved icon as a block, for the credential entries' icon column. */
    private void blockIcon(SectionBuilder cell, String token) {
        IconAsset icon = requireIcon(token);
        cell.spacing(0);
        if ("svg".equals(icon.format())) {
            cell.addSvgIcon(readSvg(icon), icon.pointSize());
        } else {
            cell.addImage(image -> image
                    .source(DocumentImageData.fromPath(icon.file()))
                    .size(icon.pointSize(), icon.pointSize()));
        }
    }

    private static SvgIcon readSvg(IconAsset icon) {
        try {
            return SvgIcon.read(icon.file());
        } catch (IOException | RuntimeException cause) {
            throw new IllegalStateException("Cannot read icon " + icon.file(), cause);
        }
    }

    private static IconAsset requireIcon(String token) {
        IconAsset icon = ICONS.get(token);
        if (icon == null) {
            throw new IllegalStateException("No icon resolved for token \"" + token
                    + "\". Add it to asset-request.json and re-run the asset resolver.");
        }
        return icon;
    }

    /**
     * Reads {@code assets-manifest.json} — the source of truth for what the
     * resolver actually fetched.
     *
     * <p>{@code format} is read rather than assumed: an icon resolves to SVG
     * wherever this line can draw it and to PNG only where it cannot, and a
     * template that hardcodes either extension breaks on the first icon that goes
     * the other way.</p>
     */
    private static Map<String, IconAsset> readIconManifest() {
        Path manifest = REVISION_DIR.resolve("assets-manifest.json");
        if (!Files.isRegularFile(manifest)) {
            return Map.of();
        }
        try {
            JsonNode root = new ObjectMapper().readTree(manifest.toFile());
            JsonNode icons = root.path("icons");
            Map<String, IconAsset> resolved = new LinkedHashMap<>();
            icons.fieldNames().forEachRemaining(token -> {
                JsonNode icon = icons.path(token);
                resolved.put(token, new IconAsset(
                        REVISION_DIR.resolve(icon.path("file").asText()),
                        icon.path("format").asText("png"),
                        icon.path("pointSize").asDouble(9.0)));
            });
            return resolved;
        } catch (IOException cause) {
            throw new IllegalStateException("Cannot read " + manifest.toAbsolutePath(), cause);
        }
    }

    private static DocumentTextStyle textStyle(double size, DocumentColor color, boolean bold) {
        return DocumentTextStyle.builder()
                .fontName(FONT)
                .size(size)
                .color(color)
                .decoration(bold ? DocumentTextDecoration.BOLD : DocumentTextDecoration.DEFAULT)
                .build();
    }

    /**
     * The stand-in for letter-spacing.
     *
     * <p>2.2.1 has no tracking on {@link DocumentTextStyle} — the allow-list has
     * neither {@code letterSpacing} nor {@code tracking} — and the reference
     * tracks the job title by about 3.2pt, which is too much to ignore. Inserting
     * spaces between characters is a text transform, so the extracted text of that
     * one line reads "P R O J E C T"; it is applied only where the reference's
     * tracking is unmistakable.</p>
     */
    private static String tracked(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder(text.length() * 2);
        boolean startOfWord = true;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == ' ') {
                out.append("   ");
                startOfWord = true;
                continue;
            }
            if (!startOfWord) {
                out.append(' ');
            }
            out.append(ch);
            startOfWord = false;
        }
        return out.toString();
    }

    /**
     * A gap between two inline runs, in the style of the text around it.
     *
     * <p>Not decoration: {@link DocumentTextStyle}'s default size is 14pt, so an
     * unstyled {@code inlineText(" ")} holds open a line box built for 14pt type
     * even though a space has no ink to show for it. Three rows of this page
     * carried one — the contact values, the education degrees and the skill
     * names — and the effect was invisible in every way except the line pitch.</p>
     */
    private static void inlineGap(ParagraphBuilder paragraph, DocumentTextStyle style) {
        paragraph.inlineText("  ", style);
    }

    /** A measured pitch, minus the line it has to clear, is the margin that produces it. */
    private static double gap(double pitch, double size) {
        return Math.max(0.0, pitch - size * LINE_FACTOR);
    }

    /** Node names have to survive being read back out of a layout snapshot. */
    private static String compact(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (Character.isLetterOrDigit(ch)) {
                out.append(ch);
            }
        }
        return out.toString();
    }
}
