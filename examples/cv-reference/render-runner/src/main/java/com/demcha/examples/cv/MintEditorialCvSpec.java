package com.demcha.examples.cv;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Data spec for the "Mint Editorial CV" template.
 *
 * <p>Every visible string, list, URL, and number consumed by
 * {@code GeneratedCvTemplate} flows through this record. The spec is loaded
 * from {@code <revision>/cv-data.json} by {@link MintEditorialCvSpecProvider},
 * so a non-Java user can edit the JSON to change content without touching
 * the template source. Visual transformations (spaced uppercase headings,
 * letter-spacing) live in the template; the JSON carries natural-form
 * strings such as {@code "Rose Harris"} and {@code "Graphic Designer"}.</p>
 *
 * <p>Designed for Jackson auto-binding: each record uses
 * {@link com.fasterxml.jackson.annotation.JsonCreator} on the canonical
 * constructor so JSON property names line up with field names without an
 * explicit ObjectMapper configuration.</p>
 */
public record MintEditorialCvSpec(
        Header header,
        List<ContactEntry> contact,
        List<String> interests,
        List<EducationEntry> education,
        String profile,
        List<ExperienceEntry> experiencePage1,
        List<String> expertise,
        List<Skill> skills,
        List<SocialLink> social,
        List<ExperienceEntry> experiencePage2,
        List<Award> awards,
        List<Reference> references) {

    @JsonCreator
    public MintEditorialCvSpec(
            @JsonProperty("header") Header header,
            @JsonProperty("contact") List<ContactEntry> contact,
            @JsonProperty("interests") List<String> interests,
            @JsonProperty("education") List<EducationEntry> education,
            @JsonProperty("profile") String profile,
            @JsonProperty("experiencePage1") List<ExperienceEntry> experiencePage1,
            @JsonProperty("expertise") List<String> expertise,
            @JsonProperty("skills") List<Skill> skills,
            @JsonProperty("social") List<SocialLink> social,
            @JsonProperty("experiencePage2") List<ExperienceEntry> experiencePage2,
            @JsonProperty("awards") List<Award> awards,
            @JsonProperty("references") List<Reference> references) {
        this.header = Objects.requireNonNull(header, "header");
        this.contact = nullToEmpty(contact);
        this.interests = nullToEmpty(interests);
        this.education = nullToEmpty(education);
        this.profile = profile == null ? "" : profile;
        this.experiencePage1 = nullToEmpty(experiencePage1);
        this.expertise = nullToEmpty(expertise);
        this.skills = nullToEmpty(skills);
        this.social = nullToEmpty(social);
        this.experiencePage2 = nullToEmpty(experiencePage2);
        this.awards = nullToEmpty(awards);
        this.references = nullToEmpty(references);
    }

    private static <T> List<T> nullToEmpty(List<T> in) {
        return in == null ? List.of() : List.copyOf(in);
    }

    /**
     * Identity block at the top of page 1.
     */
    public record Header(String name, String title) {
        @JsonCreator
        public Header(@JsonProperty("name") String name,
                      @JsonProperty("title") String title) {
            this.name = name == null ? "" : name;
            this.title = title == null ? "" : title;
        }
    }

    /**
     * One contact-section row. {@code icon} matches a token in
     * {@code assets-manifest.json}. {@code url} is optional — when present
     * the rendered line is wrapped in a {@code DocumentLinkOptions} so the
     * row becomes clickable.
     */
    public record ContactEntry(String icon, String value, String url) {
        @JsonCreator
        public ContactEntry(@JsonProperty("icon") String icon,
                            @JsonProperty("value") String value,
                            @JsonProperty("url") String url) {
            this.icon = Objects.requireNonNull(icon, "icon");
            this.value = value == null ? "" : value;
            this.url = url == null || url.isBlank() ? null : url;
        }

        public Optional<String> linkUrl() {
            return Optional.ofNullable(url);
        }
    }

    /**
     * One education entry (degree / school / years).
     */
    public record EducationEntry(String degree, String school, String years) {
        @JsonCreator
        public EducationEntry(@JsonProperty("degree") String degree,
                              @JsonProperty("school") String school,
                              @JsonProperty("years") String years) {
            this.degree = degree == null ? "" : degree;
            this.school = school == null ? "" : school;
            this.years = years == null ? "" : years;
        }
    }

    /**
     * One job entry (title / meta line / body paragraph / bullet list).
     */
    public record ExperienceEntry(String jobTitle, String meta, String body, List<String> highlights) {
        @JsonCreator
        public ExperienceEntry(@JsonProperty("jobTitle") String jobTitle,
                               @JsonProperty("meta") String meta,
                               @JsonProperty("body") String body,
                               @JsonProperty("highlights") List<String> highlights) {
            this.jobTitle = jobTitle == null ? "" : jobTitle;
            this.meta = meta == null ? "" : meta;
            this.body = body == null ? "" : body;
            this.highlights = nullToEmpty(highlights);
        }
    }

    /**
     * One skill bar entry. {@code level} is in the inclusive range
     * {@code [0.0, 1.0]} — the template clamps overflows for safety.
     */
    public record Skill(String name, double level) {
        @JsonCreator
        public Skill(@JsonProperty("name") String name,
                     @JsonProperty("level") double level) {
            this.name = name == null ? "" : name;
            this.level = level;
        }
    }

    /**
     * One social-section link. {@code icon} is the asset-manifest token,
     * {@code label} is the visible text, {@code url} is the click target.
     */
    public record SocialLink(String icon, String label, String url) {
        @JsonCreator
        public SocialLink(@JsonProperty("icon") String icon,
                          @JsonProperty("label") String label,
                          @JsonProperty("url") String url) {
            this.icon = Objects.requireNonNull(icon, "icon");
            this.label = label == null ? "" : label;
            this.url = url == null || url.isBlank() ? null : url;
        }

        public Optional<String> linkUrl() {
            return Optional.ofNullable(url);
        }
    }

    /**
     * One award entry (name / meta).
     */
    public record Award(String name, String meta) {
        @JsonCreator
        public Award(@JsonProperty("name") String name,
                     @JsonProperty("meta") String meta) {
            this.name = name == null ? "" : name;
            this.meta = meta == null ? "" : meta;
        }
    }

    /**
     * One reference entry. The {@code email} field carries an optional
     * {@code mailto:} link via {@link #emailLink()} — the template wraps
     * the rendered email line in {@code DocumentLinkOptions} when present.
     */
    public record Reference(String name, String company, String phone, String email) {
        @JsonCreator
        public Reference(@JsonProperty("name") String name,
                         @JsonProperty("company") String company,
                         @JsonProperty("phone") String phone,
                         @JsonProperty("email") String email) {
            this.name = name == null ? "" : name;
            this.company = company == null ? "" : company;
            this.phone = phone == null ? "" : phone;
            this.email = email == null ? "" : email;
        }

        /**
         * Returns the {@code mailto:} URI for this reference's email, or empty
         * when the email field is blank.
         */
        public Optional<String> emailLink() {
            return email.isBlank() ? Optional.empty() : Optional.of("mailto:" + email);
        }
    }
}
