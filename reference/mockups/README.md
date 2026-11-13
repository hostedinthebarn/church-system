# Reference mockups (not part of the app)

Static HTML prototypes from the design phase, copied here so the build can match them. They're **reference only**: nothing in the app imports or serves these files.

| Folder | What it is | Used by |
|---|---|---|
| `home-option-1/` | The public home page in "option 1", today's La Grange look | LGC-33 (the home page) |
| `members-directory/` | The members directory prototype in the "church family hub" (sample #3) look, with made-up households | LGC-46 (directory screens and PDF) |
| `shared.css`, `shared.js`, `es.json` | Styles, the language-toggle script and Spanish strings both pages load | both |

**Images are deliberately left out.** The mockups reference `/assets/logo.png`, `/assets/hero-kids.jpg` and `/assets/building.jpg`. Those are the church's own images and don't belong in a public repo; the real ones are added at deploy time from the church's accounts. Use placeholders until then.

All names and addresses in the directory mockup are made up. The home page's phone number, email address and street address are the church's public contact details from lagrangecoc.com.

Source: the private `lgc-demo` prototype repo, commit `04a5d1a` (2026-11-11).
