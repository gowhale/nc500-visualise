# Ride data

Drop each rider's GPX files in their own folder, one file per day, named so they
sort in ride order:

```
data/riders/
  gabe/
    day-01.gpx
    day-02.gpx
    ...
  jack/
    day-01.gpx
    ...
```

- The folder name becomes the rider's URL-safe id; the display name is prettified
  from it ("gabe" → "Gabe"). To override, add a `rider.json` next to the GPX files:
  `{ "name": "Gabe W" }`
- The day label shown in the UI comes from the `<name>` inside each GPX track
  (Garmin sets this to the activity title), falling back to the filename.
- Run `npm run data` (also runs automatically in `dev`/`build`) to regenerate
  the site's data. While this folder has no GPX files, a demo NC500 route is
  generated instead.
- **Run `npm run scrub` before committing new GPX files** — it strips heart
  rate and other sensor streams, device names, and account links that head-unit
  exports embed, keeping the route itself intact.
