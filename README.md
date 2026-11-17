# The Sky Is Falling

A D3 explorable explanation of NASA's reported fireballs. The page goes from a globe of detections, to how a few large events dominate the energy, to the missing measurements and limits of the record.

## Run locally

The site has no build step and no runtime package installation. From the folder containing `index.html` (`dist/` in the Sites checkout), run:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Fetch-based data loading requires an HTTP server; opening `index.html` directly as a file will not work.

## GitHub Pages

The downloadable `github-pages-source.zip` contains the contents of `dist/` at its root. Unzip and commit those files at the top level of your public class-project repository. In repository Settings → Pages, choose Deploy from a branch, then `main` and `/ (root)`. All asset URLs are relative, so project-subdirectory hosting works.

Add the demo video link before the final submission.

## Interactions

- Atlas: drag or use arrow keys to rotate; switch to World map; select any located event; play the timeline; set year and energy threshold; select another event.
- Energy: move the threshold to compare the number of qualifying events with their share of total estimated energy.
- Ranking: remove Chelyabinsk and inspect the rescaled linear comparison.
- Atmosphere: make a prediction, inspect points, and zoom to events below 10 kt.
- Missing measurements: switch between location and altitude coverage.
- Figures: each chart links to a static SVG, and all six are available as a zip or PDF in the data section.

## Data

Snapshot: NASA/JPL CNEOS Fireball API v1.2, retrieved 2026-11-11, date cutoff 2025-12-31. 1,050 events, 864 located, 578 with altitude. Nulls remain null. The downloads directory includes the original API JSON, cleaned CSV, data manifest, proposal draft, and six static figures.

The atlas's year and energy controls affect the atlas only. Later charts use the full snapshot. The globe hides the rear hemisphere; World map exposes all located events. Core map-dot sizes are equal; brightness uses log energy. Energy histograms use equal log-width bins; rankings use a linear axis. No surface damage, global impact rate, or geographic risk is inferred.

## Files

- `index.html`: semantic story and narrative
- `style.css`: page styling (system fonts, no external files)
- `app.js`: D3 rendering and browser-local interactions
- `assets/fireballs.json`: normalized data and snapshot metadata
- `assets/world.json`: Natural Earth geometry via world-atlas
- `assets/`: D3, TopoJSON, map data, and the fireball data, served locally
- `downloads/`: source data, methods, proposal, figures, and licenses

## Verification

Tested in headless Chrome at desktop (1280px) and phone (390px) widths: the page loads with no console errors and every control above works. Screen readers and touch dragging on a real phone were not tested.

## Credits

NASA/JPL CNEOS data; Natural Earth outlines via world-atlas; D3.js; TopoJSON. This is an independent educational visualization, not a NASA product. See `downloads/attributions.txt` and the included license files.
