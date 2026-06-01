# Data Schema

Revision-006 uses the same `NoirCorporateCvSpec` contract as revision-005,
loaded by
`NoirCorporateCvSpecProvider` from revision-local `cv-data.json`.

```jsonc
{
  "header": {
    "name": "Name Surename",
    "title": "Your Job Position"
  },
  "avatar": {
    "initials": "CV"
  },
  "contact": [
    { "icon": "location", "value": "1231 Main Street, Your City", "url": null },
    { "icon": "email", "value": "your@email.com", "url": "mailto:your@email.com" },
    { "icon": "phone", "value": "012 345 6789", "url": null },
    { "icon": "website", "value": "www.yourcompany.com", "url": "https://www.yourcompany.com" }
  ],
  "skills": [
    { "name": "Valuable skill", "level": 0.8 }
  ],
  "languages": [
    { "name": "Language (Native)", "level": 1.0 }
  ],
  "interest": [
    { "icon": "music", "label": "Music" }
  ],
  "profile": "Body paragraph...",
  "education": [
    { "years": "2015 - 2019", "body": "Body paragraph..." }
  ],
  "experience": [
    {
      "title": "Your Job Position | 2024",
      "company": "Company name",
      "highlights": ["Bullet text"]
    }
  ]
}
```

Notes:

- `icon` values must exist in `assets-manifest.json`.
- `level` is clamped to `[0.0, 1.0]` by the template before converting to a
  five-dot meter.
- `contact.url` is optional. When present, the rendered text/icon is wrapped in
  `DocumentLinkOptions`.
- Visible section labels (`Contact`, `Skills`, `Professional Profile`, and so
  on) are structural template labels, not user data.
