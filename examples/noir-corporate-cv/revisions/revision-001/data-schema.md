# Data schema (revision-001)

Revision-001 embeds the fixture content in the template body and
does NOT yet ship a typed `NoirCorporateCvSpec` record. The schema
below documents the fields the embedded fixture exposes so a future
revision can lift them into a record and a JSON loader without
changing the rendered output.

```jsonc
{
  "header": {
    "name":  "Name Surename",
    "title": "Your Job Position"
  },

  "avatar": {
    "initials": "CV"        // rendered inside the identity card
  },

  "contact": [
    { "icon": "location", "value": "1231 Main Street, Your City" },
    { "icon": "email",    "value": "your@email.com"              },
    { "icon": "phone",    "value": "012 345 6789"                },
    { "icon": "website",  "value": "www.yourcompany.com"         }
  ],

  "skills": [
    { "name": "Valuable skill", "level": 0.8 },
    { "name": "Valuable skill", "level": 0.6 },
    { "name": "Valuable skill", "level": 0.7 },
    { "name": "Valuable skill", "level": 0.5 }
  ],

  "languages": [
    { "name": "Language (Native)", "level": 1.0 },
    { "name": "Some Language",     "level": 0.6 },
    { "name": "Another Language",  "level": 0.4 }
  ],

  "interest": [
    { "icon": "music",    "label": "Music"     },
    { "icon": "book",     "label": "Book"      },
    { "icon": "travel",   "label": "Traveling" }
  ],

  "profile": "Lorem ipsum dolor sit amet ...",

  "education": [
    { "years": "2015 – 2019", "body": "Lorem ipsum ..." },
    { "years": "2012 – 2015", "body": "Lorem ipsum ..." }
  ],

  "experience": [
    {
      "title":      "Your Job Position | 2024",
      "company":    "Company name",
      "highlights": [ "Lorem ipsum ...", "..." ]
    },
    {
      "title":      "Your Job Position | 2021",
      "company":    "Company name",
      "highlights": [ "..." ]
    },
    {
      "title":      "Your Job Position | 2019",
      "company":    "Company name",
      "highlights": [ "..." ]
    }
  ]
}
```

Notes:

- `level` is a number in [0.0, 1.0]. The template converts the level
  to a 5-dot meter at render time (`level >= n/5` ⇒ filled `●`,
  else `○`).
- `icon` values are tokens that must appear in `asset-request.json`
  and therefore in `assets-manifest.json`. The Template Coder reads
  the rasterized PNG from `assets/icons/<token>.png` at the
  manifest's `pointSize`.
- All visible strings are stored in natural case in this schema; the
  template applies spaced-uppercase styling at render time for the
  identity name and the section headings (mirrors how
  `mint-editorial-cv` handles it).
