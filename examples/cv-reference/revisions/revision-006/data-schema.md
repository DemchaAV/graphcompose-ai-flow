# cv-data.json schema

The "Mint Editorial CV" template renders content supplied through
`cv-data.json` next to the generated template. Editing this file is
the only way an end user changes CV content — the Java source is a
pure renderer.

The Java mirror is
[`MintEditorialCvSpec`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpec.java)
and is loaded at render time by
[`MintEditorialCvSpecProvider#create()`](../../render-runner/src/main/java/com/demcha/examples/cv/MintEditorialCvSpecProvider.java).

## Top-level fields

| JSON key            | Type / Java mirror                              | Notes |
|---|---|---|
| `header`            | `Header { name, title }`                         | Required. Renders as the centered page-1 identity block, with the spaced-uppercase styling applied by `letterSpace(...)`. |
| `contact`           | `ContactEntry[]` `{ icon, value, url? }`         | Page-1 sidebar contact rows. `icon` is a token from `assets-manifest.json`. Optional `url` makes the row clickable (e.g. `mailto:`, `https://`). |
| `interests`         | `string[]`                                       | Page-1 sidebar list of interests. Rendered in spaced-uppercase. |
| `education`         | `EducationEntry[]` `{ degree, school, years }`   | Page-1 sidebar education entries. The `degree` field is rendered in spaced-uppercase. |
| `profile`           | `string`                                         | Page-1 main column profile paragraph. |
| `experiencePage1`   | `ExperienceEntry[]`                              | Page-1 main column experience entries. |
| `expertise`         | `string[]`                                       | Page-2 sidebar expertise list (rendered in spaced-uppercase). |
| `skills`            | `Skill[]` `{ name, level }`                      | Page-2 sidebar skill bars. `level` is a fraction in `[0.0, 1.0]`. |
| `social`            | `SocialLink[]` `{ icon, label, url }`            | Page-2 sidebar social rows. `url` makes both the icon and the label clickable. |
| `experiencePage2`   | `ExperienceEntry[]`                              | Page-2 main column experience entries. |
| `awards`            | `Award[]` `{ name, meta }`                       | Page-2 main column awards. Rendered as a 2-column grid; `name` rendered in spaced-uppercase. |
| `references`        | `Reference[]` `{ name, company, phone, email }`  | Page-2 main column references. Rendered as a 2-column grid; `name` rendered in spaced-uppercase. `email` becomes a clickable `mailto:` link when non-blank. |

## ExperienceEntry

```json
{
  "jobTitle": "Job Title",
  "meta": "Company  |  Location  |  2010 - Present",
  "body": "Free-form paragraph describing the role.",
  "highlights": ["First bullet", "Second bullet", "Third bullet"]
}
```

`jobTitle` is rendered in spaced-uppercase; `meta` and `body` keep
their natural casing; `highlights` becomes a bullet list under the
body.

## Editing checklist

- Single source of truth for content is this file. Do not edit
  strings inside `generated-template.java`.
- Letter-spacing ("R O S E  H A R R I S") is computed by the
  template at render time. Write natural-case strings
  (`"Rose Harris"`) in JSON.
- For new icon tokens, add the icon entry to `asset-request.json`
  with a `pointSize`, then reference the token from a `contact` or
  `social` entry. The `ICONS` table inside the template must mirror
  the manifest tokens.
- For new font roles, add to `asset-request.json` `fonts`; the
  resolver records the matching `FontName.*` constant and the
  template can swap in via `HEADING_FONT` / `BODY_FONT`.
- For unfilled fields, omit the JSON key (it becomes `null` /
  empty in the spec compact constructor). The template skips empty
  sections — no broken layout.

## Backwards compatibility

Adding a new optional field to the spec is non-breaking — the
compact constructor coalesces `null` to a safe default (`""` for
strings, `List.of()` for lists). Removing or renaming an existing
field is breaking and must be done with a new revision.
