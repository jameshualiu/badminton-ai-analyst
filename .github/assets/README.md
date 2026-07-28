# README media assets

Drop the README's images/video here. This folder lives under `.github/` on purpose:
the repo's top-level `docs/` is gitignored, so media there would silently never commit.

Expected files (referenced by the root `README.md`):

| File | Used in | Notes |
|------|---------|-------|
| `demo-thumbnail.png` | Demo | Poster image that links out to a hosted video (YouTube/Loom). |
| `demo.gif` | Demo | Alternative: an inline animated GIF (renders directly on GitHub). |
| `dashboard.png` | Screenshots | The video-list dashboard with live job status. |
| `analysis.png` | Screenshots | The analysis view — shot heatmap on the court. |

After adding a file, open `README.md` and **uncomment** the matching markup block
(the Demo and Screenshots sections each have ready-to-use snippets in HTML comments).

Tips for good captures:
- Use a 16:9 crop and a consistent width so the two screenshots line up in the table.
- Keep GIFs short (< ~10s) and reasonably compressed so the page stays light.
