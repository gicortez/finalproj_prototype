# The Sky Is Falling
## The planet is active. The record is selective.

**DSC 106 final project proposal draft**

**Team members:** Add your team's names before submission.
**Dataset approval:** Instructor approval is still required for an outside dataset.

### Research question
What do Earth's reported fireballs reveal about the scale and geography of atmospheric encounters, and what does the incomplete record prevent us from concluding?

### Dataset
NASA/JPL CNEOS Fireball Data API: https://ssd-api.jpl.nasa.gov/doc/fireball.html

Query: https://ssd-api.jpl.nasa.gov/fireball.api?date-max=2025-12-31&vel-comp=true

Frozen snapshot retrieved 11 November 2026. Contains **1,050 real events**, 15 April 1988–16 December 2025. The original response has **12 fields**: date, radiated energy, estimated impact energy, latitude, N/S indicator, longitude, E/W indicator, altitude, velocity, and three entry-velocity components. The cleaned CSV has 12 columns after signing coordinates and deriving an ID and year. 864 events have a location; 578 have altitude. Public, observational data; no synthetic records are introduced.

### Intended explorable explanation (8 lines)
1. Open with a manipulable globe of real detections to make cosmic encounters concrete.
2. Let readers advance through the record, select individual events, and raise an energy filter.
3. Offer an all-longitudes world map to reveal events hidden on the rear of the globe.
4. Use a logarithmic energy distribution and movable threshold to compare event count with energy share.
5. Remove Chelyabinsk from a linear ranking so readers discover how one outlier changes the scale.
6. Ask readers to predict whether increasing energy always implies lower peak-brightness altitude, then inspect the observed variation.
7. Reveal missing locations and heights explicitly, alongside annual reporting and hemisphere comparisons.
8. End with a distinction between the activity of the sky and the selectivity of a sensor-based record, supported by downloadable source data.

### Outside-dataset justification (4 sentences)
NASA's fireball record makes a distant astronomical process tangible through real timestamps, positions, heights, and energy estimates. Its strongly unequal energy distribution supports an interactive explanation in which readers discover how rare events dominate the summed energy without dominating the event count. Missing coordinates and heights offer a meaningful second story about how a scientific record is shaped by measurement and reporting. The dataset exceeds the required size and dimensionality, supports six distinct static visualizations with little cleaning, and allows a coherent D3-based narrative rather than a collection of unrelated charts.

### Six initial visualizations
1. **World atlas:** 864 reported peak-brightness positions; equal dot cores, brightness encodes log energy; 186 unlocated events disclosed.
2. **Yearly record:** Counts by UTC calendar year, including unlocated records; incomplete reporting and coverage changes discussed.
3. **Energy distribution:** 1,050 events in equal-width log10 bins; 932 are below 1 kt.
4. **Altitude vs. energy:** 578 events with reported height; logarithmic energy axis; no causal claim.
5. **Hemisphere comparison:** 426 northern, 437 southern, 1 at the equator; 186 unlocated excluded.
6. **Largest events:** Five largest energy estimates on a linear scale; Chelyabinsk at 441 kt and Bering Sea at 49 kt in this snapshot.

SVG and PNG versions are in `figures/`. `six-figures.pdf` combines them for convenient review. All six figures use the full snapshot, regardless of the interactive atlas's current filter.

### Core findings and limits
- 932 of 1,050 records (88.8%) are below 1 kt.
- Chelyabinsk contributes approximately 36.7% of the 1,202.51 kt sum of NASA's estimates in this snapshot.
- 186 events (17.7%) have no coordinates; 472 (45.0%) have no reported altitude.
- NASA explicitly states that this is not a complete list and includes only the brightest events. Counts cannot establish the global rate, geographic risk, or a time trend in the true impact rate.
- “Impact energy” is an approximate incoming-object energy estimate, not observed surface damage. Altitude and coordinates refer to peak brightness.
- NASA can revise historical events. Values are frozen for reproducibility; older articles may report different estimates.

### Implementation and remaining submission steps
The implementation uses D3 v7 for projections, distributions, scales, axes, and interactions. It is a buildless static website; data, fonts, and dependencies are vendored. The code is packaged with `index.html`, `app.js`, and `style.css` at repository root for GitHub Pages.

Before course submission: add team names, obtain instructor dataset approval, publish the source and site through GitHub Pages, and create/link the required demonstration video. A private Sites preview is provided for review; it does not replace the course's GitHub Pages requirement.

Course requirements: https://dsc106.com/projects/final_project/
