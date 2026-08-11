# NC500 — Ten Days Round the North

A sleek satellite-map visualiser for a multi-day bike trip: per-day coloured
route segments over 3D Highland terrain, trip stats, an interactive elevation
profile, and a fly-through of the whole ride. Built with Vite + TypeScript +
MapLibre GL; deploys to GitHub Pages.

## Quick start

```bash
npm install
npm run dev
```

With no GPX files present it shows a generated demo NC500 loop.

## Add your rides

Put one GPX file per day into `data/riders/<your-name>/` (see
[data/riders/README.md](data/riders/README.md) for naming and options), then
restart `npm run dev`. Friends' routes are just more folders — each rider gets
their own colour, a visibility toggle, and their own stats when selected.

**Before committing GPX files, run `npm run scrub`.** Raw head-unit exports
carry personal data (heart rate, cadence, temperature, device names, account
links) that would be visible to anyone once the repo is public. The scrub
rewrites the files in place, keeping coordinates, elevation, timestamps, and
track names; `npm run data` also warns whenever it spots personal data in a
raw file.

## Satellite imagery key (optional but recommended)

Get a free key at [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/), then:

```bash
cp .env.example .env.local   # and paste the key in
```

Without a key the site falls back to Esri satellite tiles automatically — it
works, but MapTiler looks better and powers the higher-detail 3D terrain.

## Deploy to GitHub Pages

1. Push this repo to GitHub. The repo must be public for Pages on a free plan.
2. In settings → **Secrets and variables → Actions**, add a repository secret
   `VITE_MAPTILER_KEY` with your MapTiler key (skip to use the Esri fallback).
3. Push to `main`. The workflow enables Pages automatically on first run and
   publishes the site to `https://<user>.github.io/<repo>/`. (If a run fails
   while the repo is still private, re-run it from the Actions tab once public.)

On MapTiler's dashboard, restrict the key to your `github.io` origin so it
can't be reused elsewhere (the key is public in the deployed bundle — that's
normal for map tile keys).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Rebuild data, start the dev server |
| `npm run data` | Convert `data/riders/**.gpx` → `public/data/` (warns about personal data) |
| `npm run scrub` | Strip personal data from raw GPX files before committing them |
| `npm run build` | Data + typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |

## License

MIT — see [LICENSE](LICENSE).
