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

## Satellite imagery key (optional but recommended)

Get a free key at [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/), then:

```bash
cp .env.example .env.local   # and paste the key in
```

Without a key the site falls back to Esri satellite tiles automatically — it
works, but MapTiler looks better and powers the higher-detail 3D terrain.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings → **Pages**, set **Source** to **GitHub Actions**.
3. In settings → **Secrets and variables → Actions**, add a repository secret
   `VITE_MAPTILER_KEY` with your MapTiler key (skip to use the Esri fallback).
4. Push to `main`. The included workflow builds and publishes the site to
   `https://<user>.github.io/<repo>/`.

On MapTiler's dashboard, restrict the key to your `github.io` origin so it
can't be reused elsewhere (the key is public in the deployed bundle — that's
normal for map tile keys).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Rebuild data, start the dev server |
| `npm run data` | Convert `data/riders/**.gpx` → `public/data/` |
| `npm run build` | Data + typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
