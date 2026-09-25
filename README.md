# ptkoo.github.io

Personal site of Paing Thet Ko, robotics engineer. Hand-written HTML/CSS/JS, no build step.

- `/` — portfolio
- `/projects/<slug>/` — project case studies, with their assets under `media/`
- `/album/` — personal photo album (kept from the previous site)

## Adding a project

1. Create `projects/<slug>/index.html` (copy an existing one — it shares `style.css` and `main.js` from the root).
2. Put its images in `projects/<slug>/media/`.
3. Add a `.pcard` to the `#projects` grid in the root `index.html`.

Cards carry `class="pcard wide"` for the image-beside-text layout; add `flip` on every other one
(`pcard wide flip`) so the image side alternates down the page. Drop `wide` entirely and the grid
will place cards two-up instead.
