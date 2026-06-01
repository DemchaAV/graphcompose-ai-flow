package com.demcha.examples.cv;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Data spec for the Noir Corporate CV template.
 *
 * <p>Every variable string, list, link target, and numeric rating rendered by
 * {@code GeneratedCvTemplate} flows through this record. The spec is loaded
 * from the active revision's {@code cv-data.json} file by
 * {@link NoirCorporateCvSpecProvider}.</p>
 */
public record NoirCorporateCvSpec(
        Header header,
        Avatar avatar,
        List<ContactEntry> contact,
        List<Skill> skills,
        List<Skill> languages,
        List<InterestEntry> interest,
        String profile,
        List<EducationEntry> education,
        List<ExperienceEntry> experience) {

    @JsonCreator
    public NoirCorporateCvSpec(
            @JsonProperty("header") Header header,
            @JsonProperty("avatar") Avatar avatar,
            @JsonProperty("contact") List<ContactEntry> contact,
            @JsonProperty("skills") List<Skill> skills,
            @JsonProperty("languages") List<Skill> languages,
            @JsonProperty("interest") List<InterestEntry> interest,
            @JsonProperty("profile") String profile,
            @JsonProperty("education") List<EducationEntry> education,
            @JsonProperty("experience") List<ExperienceEntry> experience) {
        this.header = Objects.requireNonNull(header, "header");
        this.avatar = avatar == null ? new Avatar("") : avatar;
        this.contact = nullToEmpty(contact);
        this.skills = nullToEmpty(skills);
        this.languages = nullToEmpty(languages);
        this.interest = nullToEmpty(interest);
        this.profile = profile == null ? "" : profile;
        this.education = nullToEmpty(education);
        this.experience = nullToEmpty(experience);
    }

    private static <T> List<T> nullToEmpty(List<T> in) {
        return in == null ? List.of() : List.copyOf(in);
    }

    public record Header(String name, String title) {
        @JsonCreator
        public Header(@JsonProperty("name") String name,
                      @JsonProperty("title") String title) {
            this.name = name == null ? "" : name;
            this.title = title == null ? "" : title;
        }
    }

    public record Avatar(String initials) {
        @JsonCreator
        public Avatar(@JsonProperty("initials") String initials) {
            this.initials = initials == null ? "" : initials;
        }
    }

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

    public record Skill(String name, double level) {
        @JsonCreator
        public Skill(@JsonProperty("name") String name,
                     @JsonProperty("level") double level) {
            this.name = name == null ? "" : name;
            this.level = level;
        }
    }

    public record InterestEntry(String icon, String label) {
        @JsonCreator
        public InterestEntry(@JsonProperty("icon") String icon,
                             @JsonProperty("label") String label) {
            this.icon = Objects.requireNonNull(icon, "icon");
            this.label = label == null ? "" : label;
        }
    }

    public record EducationEntry(String years, String body) {
        @JsonCreator
        public EducationEntry(@JsonProperty("years") String years,
                              @JsonProperty("body") String body) {
            this.years = years == null ? "" : years;
            this.body = body == null ? "" : body;
        }
    }

    public record ExperienceEntry(String title, String company, List<String> highlights) {
        @JsonCreator
        public ExperienceEntry(@JsonProperty("title") String title,
                               @JsonProperty("company") String company,
                               @JsonProperty("highlights") List<String> highlights) {
            this.title = title == null ? "" : title;
            this.company = company == null ? "" : company;
            this.highlights = nullToEmpty(highlights);
        }
    }
}
