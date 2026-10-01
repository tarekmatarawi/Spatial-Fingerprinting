# 03 — Survey protocol: instruments, stimuli, participants

Reference for writing the methodology chapter and for judging the validity of the three perceptual instruments. Companion to [01_methods_implementation.md](01_methods_implementation.md) (how the code computes) and [02_results_data.md](02_results_data.md) (what the data says).

**Conventions**

- Paths are repo-relative. `file:12-30` means lines 12–30 of the file **as committed at `ca0c876`**. Where the text participants saw no longer exists in the working tree, the path is given as `<commit>:<path>`. Read it with `git show <commit>:<path>`.
- Participant-facing text is quoted verbatim from the JSX. HTML entities are rendered (`&rsquo;` → ’). `<strong>` emphasis is marked **bold**. `{…}` shows a value inserted at runtime, with its value in brackets.
- `NOT FOUND` means the information was searched for in code, docs, data, git history and commit messages, and does not exist there. It may exist outside the repository.
- "Derived" marks a number worked out from code constants for this document, not measured on a device.

---

## 0. The instruments

Four participant-facing instruments exist in the history. **The thesis uses the 360° panoramic survey for the weight fit.**

| Instrument | Tag in data | Route | Stimulus | Task(s) | Records | Collected | Role |
|---|---|---|---|---|---:|---|---|
| Static-photo triplet survey | none (no `survey_version` field) | `?survey` until `abc37b8` | one Street View image per plaza | 27 triplets (26 + 1 attention check) | 56 | 2026-08-06 → 2026-08-19 | Archived. Paired with `perceptual_120` only by `--source=archive` (`scripts/analyze.mjs:84-97`). Not the reported fit. |
| 360° pilot | `pilot_360_area_matched` | `?pilot-360` (`0218a43`) | equirectangular panorama | 15 triplets | 2 | 2026-08-19 → 08-22 | Feasibility only. File deleted in `abc37b8`, readable at `abc37b8^:src/data/pilot-360-responses.json`. |
| **360° panoramic survey (P3)** | `panoramic_v1` | `?survey` (`src/App.jsx:162`) | equirectangular panorama | 12 triplets, then semantic differential | **46** | 2026-08-22 → 2026-09-02 | **Live.** Source of the P5 weights and the rating validation. |
| Matched-view survey (P8) | `matched_view_v1` | `?matched-view-survey` (`src/App.jsx:171`) | rendered untextured massing view, 120° | 12 two-alternative forced choices | 15 | 2026-09-09 | Interim validation. See §5. |

Sources: record counts and dates from `src/data/survey-responses.json`, `src/data/survey-responses-360.json` and `src/data/matched-view-responses.json`. Pilot details are from `02_results_data.md` §4.2.

The task prompt calls the 360° instrument "the panoramic pilot". In the code and data it stopped being a pilot at `abc37b8`, where the static survey was replaced. §1.2 and §2 describe that live instrument. §1.4 covers the real 2-session pilot.

---

## 1. Stimulus generation

### 1.1 Static-photo survey (archived, `perceptual_120`)

**Image source.** Google Street View captures uploaded as files and not fetched live from an API:

- `docs/spec.md:157` specifies "3 site images (pre-uploaded Street View, not live API)".
- The dev upload endpoint is described as letting "the admin page upload a site's Street View screenshot" (`vite.config.js:370-372`).
- Each site's file is named in `sites.json` → `street_view_image`, and stored under `public/images/`.

`docs/street-view-photo-guide.md` is written as a guide to "shoot (or re-shoot)" photos with a phone camera. That suggests some images may be the researcher's own photographs rather than Street View. **Which images are Street View screenshots and which are photographs: `NOT FOUND`.** No EXIF, capture log or per-image source record exists. **Capture dates: `NOT FOUND`.**

**Standing point and heading.** `NOT FOUND` as a stated sampling rule for choosing the image. There is **one image per plaza**. The guide gives a later, advisory rule: "stand where a visitor would actually stand — the plaza's natural entry point or habitual vantage … aim for the main landmark/facade to occupy roughly the middle third to half of the frame height" (`docs/street-view-photo-guide.md:52-55`). It was written *after* reviewing the existing set (`:8-10`) and reports inconsistency in it: some photos are close-up, others far back with "a large expanse of empty foreground pavement" (`:42-50`). Lighting is also inconsistent: Konstablerwache was "shot heavily overcast" (`:59-61`).

**Field of view: `NOT FOUND`.** No horizontal FOV is recorded for any image, whether a Street View zoom level or a phone lens.

**Resolution and processing.** Each photo was shown in a fixed **8:5** frame with CSS `object-cover object-bottom`. The image was cropped to fill the frame, with the bottom edge anchored so sky is trimmed first (`18e6aea:src/pages/SurveyPage.jsx:408-434`; rationale at `docs/street-view-photo-guide.md:14-38`). On hover the image scaled to 103% (`18e6aea:…:434`). No other processing was applied.

Pixel sizes of the 18 active sites' images **as served during collection**, read from `18e6aea`, the last survey commit before collection:

| Site | px | Site | px |
|---|---|---|---|
| Alexanderplatz | 1673×1271 | Konstablerwache | 1483×965 ¹ |
| Alter Markt | 1685×1271 | Marienplatz | 1681×1271 |
| Augustusplatz | 2058×1271 | Marktplatz Heidelberg | 1689×1153 |
| Bebelplatz | 1683×1271 | Naschmarkt | 1681×1134 |
| Burgplatz | 930×624 | Odeonsplatz | 1685×1014 |
| Gendarmenmarkt | 4000×2250 | Rathausmarkt | 1689×1271 |
| Hauptmarkt | 2058×1271 | Römerberg | 2062×1271 |
| Hauptwache | 1110×698 | Theaterplatz | 1097×630 |
| Herderplatz | 2208×1029 | Zeil | 1872×1271 |

¹ Konstablerwache's file was replaced in `abc37b8` (2026-08-22), after collection, by a 4096×2048 image. **The file now in `public/images/` is not the one participants saw.** It is not byte-identical to `public/panoramas/konstablerwache-frankfurt-am-main.jpg`.

**Site selection.** 23 sites are registered and 18 are active. Excluded with `excluded: true` in `src/data/sites.json`: Viktualienmarkt, Schlossplatz Stuttgart, Königsplatz Munich, Pariser Platz, Marktplatz Rothenburg. Commit `a6fb346` (2026-08-03) excluded Schlossplatz, Pariser Platz and Rothenburg as "low-fit sites", and the photo guide says Schlossplatz's photo had a Ferris wheel in frame (`docs/street-view-photo-guide.md:70-73`). **What "low-fit" meant, and why Viktualienmarkt and Königsplatz were excluded: `NOT FOUND`.**

**Correspondence with the isovist.** The protocol is written after the fact at `docs/spec.md:433-439`: "the vantage point and heading were placed in the 3D viewer to reproduce the Google Street View camera position and bearing of the photograph shown for that site in the P3 survey." Result: one `perceptual_120` reading per site in `src/data/results.json` (`fov_mode: perceptual_120`, `fov_deg: 120`, `ray_count: 120`, `canonical: true`).

| | Photograph | `perceptual_120` isovist | Match? |
|---|---|---|---|
| Position | Street View camera | Placed by eye in the 3D viewer to reproduce it | **Approximate.** Manual visual matching. No stated tolerance and no record of the Street View pano ID or coordinates. Two vantages lie outside their plaza boundary (`docs/spec.md:298`). |
| Heading | Camera bearing | Placed by eye. Stored to 2 dp, or 1 dp for readings before 2026-08-17 (`docs/spec.md:439`) | **Approximate.** A 1.2° change moves closed perimeter by ~27% at Herderplatz (`docs/spec.md:439`). |
| Horizontal FOV | `NOT FOUND` | 120° | **Unverified.** Then cropped to 8:5 in display, which removes an unknown share of the sides for images wider than 1.6 (`docs/street-view-photo-guide.md:27-28`). |
| Vertical content | Image as cropped | Planar 2D isovist; enclosure uses building height over distance | Not comparable in kind |
| Range | Unlimited, to the visible horizon | 200 m (`docs/spec.md:91`) | **Mismatch** wherever the view runs further than 200 m |
| Eye height | Street View camera, roughly 2.5 m (`NOT FOUND` in repo) | Planar; no eye height | — |

### 1.2 360° panoramic survey (live, `perceptual_360`)

**Image source and capture: `NOT FOUND`.** The repo contains 18 equirectangular JPEGs in `public/panoramas/`, added in `0218a43` (2026-08-19). Four were replaced in `abc37b8` (2026-08-22): Bebelplatz, Odeonsplatz, Rathausmarkt and Römerberg. Neither commit message, the README (`public/panoramas/README.md`), nor any doc says:

- who captured them or whether they are Google Street View / Photo Sphere downloads;
- the device, date, time of day or weather;
- how they were stitched.

The only upload path is the admin field labelled "360° panorama (survey stimulus)", which states "equirectangular 2:1 · saved as panoramas/{slug}.jpg" (`src/pages/AdminPage.jsx:601-641`).

**Standing point.** One panorama per plaza. The camera position rule is `NOT FOUND`. `scripts/compute-360.mjs:13-18` says only: "the survey's panoramas are shot from points central to each plaza, not from the Street View camera position at the plaza edge, so each reading has to sit where its panorama was taken."

**View direction.** The participant chooses it by dragging, with yaw free through 360°. The **opening** direction is meant to be each site's 120° survey heading. That only works when `pano_north_offset_deg` is set on the site (`src/lib/survey360.js:74-88`, `src/pages/SurveyPage.jsx:46-50`). **No site in `src/data/sites.json` has `pano_north_offset_deg`.** Every panorama therefore opens on the centre column of its own image, which faces an arbitrary, uncontrolled compass bearing (`src/lib/survey360.js:78-81`; `src/components/PanoramaViewer.jsx:112-119`).

**Field of view and interaction.** The values are module constants, and are also written into every stored session under `stimulus` (`src/pages/SurveyPage.jsx:108-115`):

| Parameter | Value | Source |
|---|---|---|
| Horizontal FOV | 75°, fixed; no zoom | `src/lib/survey360.js:49`; wheel and gesture events blocked, `src/components/PanoramaViewer.jsx:315-325` |
| Vertical FOV | Follows panel aspect. Panel is 4:3 in both tasks, giving **≈59.8°** (derived) | `PanoramaViewer.jsx:52-56`; `SurveyPage.jsx:409, 477-484` |
| Pitch limit | +12° up, −9° down (mouse). **Touch: pitch disabled**, horizontal drag only | `survey360.js:45-46`; `PanoramaViewer.jsx:290-293`, `:104` |
| Highest visible elevation | ≈41.9° above horizontal with a mouse at full tilt; ≈29.9° on touch (derived: pitch limit + half vertical FOV) | — |
| Autorotate | none | `PanoramaViewer.jsx:19` |
| Drag mapping | Grabbed point stays under the cursor (inverse projection) | `PanoramaViewer.jsx:58-73, 276-297` |
| Layout | Triplet: 3 panels side by side at `lg` width, stacked below it. Rating: 1 panel. | `SurveyPage.jsx:360`, `:471-485` |
| On-screen label | Plaza **name and city shown** under every panorama (see §2.6) | `SurveyPage.jsx:418-421, 486-491` |

**Resolution and processing.** Source pixel sizes (`public/panoramas/*.jpg`):

| px | Sites |
|---|---|
| 4096×2048 | Alter Markt, Bebelplatz, Hauptwache, Konstablerwache, Naschmarkt, Odeonsplatz, Rathausmarkt, Römerberg, Zeil |
| 2560×1280 | Alexanderplatz |
| 2508×1254 | Hauptmarkt |
| 2176×1088 | Augustusplatz, Gendarmenmarkt, Herderplatz, Marienplatz, Marktplatz Heidelberg |
| 3796×1484 (not 2:1) | Burgplatz |
| 3200×1157 (not 2:1) | Theaterplatz |

Runtime processing (`src/components/PanoramaViewer.jsx`):

- Textures wider than 2560 px are downsampled on load (`:48, 163-173`). Nine sources are downsampled and five are shown at 2176 px, so **angular sharpness differs between plazas**: 7.1 px/degree against 6.0 px/degree (derived).
- Sphere mapping: 192×128 segments (`:34-35`).
- Seam wrap (`:189`), anisotropic filtering and mipmaps (`:194-197`).
- Images that are not 2:1 are mapped to a band of 360°/aspect, centred on the horizon (`:200-222`). Burgplatz covers ±70.4° and Theaterplatz ±65.1° (derived). Both exceed the highest visible elevation, so no missing band shows on screen.

**Correspondence with the isovist.** Each site has one `perceptual_360` reading in `src/data/results.json`, flagged `heading_is_informational: true`. Readings were placed by hand in the 3D viewer "where its panorama was taken" (`scripts/compute-360.mjs:8-18`). **How the panorama position was located in the model: `NOT FOUND`.** None carries `derived_from`, so none is a leftover automatic copy.

| | Panorama as shown | `perceptual_360` isovist | Match? |
|---|---|---|---|
| Position | Panorama camera | Hand-placed; 0.0–69.0 m from the 120° vantage (§1.3) | **Approximate**, method `NOT FOUND` |
| Heading | Free; opens at an uncalibrated image centre | Irrelevant: a 360° isovist does not depend on heading (`compute-360.mjs:20-22`) | Consistent in principle |
| Horizontal FOV | 75° window, freely rotatable over 360° | 360°, 360 rays | **Match only if the participant looks all the way round.** Panning is not logged, so how much of the 360° each participant viewed is unknown. |
| Vertical | Up to ≈42° above horizontal (mouse), ≈30° (touch) | Enclosure = mean of atan(h/d)/(π/2) over all rays (`docs/spec.md:123`) | **Partial mismatch.** Any building edge rising above ≈42° (h/d > 0.9), or ≈30° on touch (h/d > 0.58), counts in enclosure but cannot be seen on screen. |
| Range | Unlimited | 200 m | Mismatch past 200 m |
| Obstacles | Everything photographed: trees, kiosks, vehicles, people, market stalls | Building footprints only | **Mismatch**, not quantified |
| Time and conditions | `NOT FOUND` per image | — | Uncontrolled |

### 1.3 Distance between the two vantages per site

From `src/data/results.json`: planar distance between each site's `perceptual_120` and `perceptual_360` reading.

| Site | m | Site | m |
|---|---:|---|---:|
| Gendarmenmarkt | 0.0 | Konstablerwache | 27.8 |
| Theaterplatz | 4.7 | Marktplatz Heidelberg | 29.1 |
| Rathausmarkt | 7.7 | Zeil | 32.4 |
| Alter Markt | 11.1 | Herderplatz | 34.4 |
| Naschmarkt | 13.1 | Hauptmarkt | 39.3 |
| Augustusplatz | 13.9 | Alexanderplatz | 50.5 |
| Hauptwache | 14.0 | Odeonsplatz | 51.0 |
| Marienplatz | 15.6 | Bebelplatz | 69.0 |
| Römerberg | 15.7 | | |
| Burgplatz | 21.7 | | |

Gendarmenmarkt's 360° reading shares the 120° vantage and heading exactly. **Whether its panorama was really taken at the Street View position, or its reading was never re-placed: `NOT FOUND`.**

### 1.4 The 2-session pilot (`pilot_360_area_matched`)

Built in `0218a43` at `?pilot-360`. The pilot used the same panorama files as the live survey, before four of them were replaced in `abc37b8`, and the same instruction text as the live survey (`0218a43:src/pages/Pilot360Survey.jsx:29-30`). Differences from the live survey (`0218a43:src/lib/pilot360.js`):

- **15 triplets** (`PILOT_SURVEY_LENGTH`), no attention check, no rating block;
- **symmetric pitch limit ±12°** (`PITCH_LIMIT_DEG: 12`);
- HFOV 75°;
- panoramas opened 90° away from the image centre. The bug was fixed in `bacf24e`.

"Area-matched" appears only in the version tag. **What was area-matched: `NOT FOUND`.** Data: 2 records, 1 completed with 15 answers and 1 abandoned at 2 (`02_results_data.md` §4.2). There is no analysis.

---

## 2. Triplet task

### 2.1 Format

**Most-similar pair from three**: the participant marks the **two of three** plazas that feel most alike. There is no anchor: all three panels are equivalent and their positions are shuffled (`src/lib/survey360.js:129-130`). This carries the same information as odd-one-out, since the unchosen plaza is the odd one, but it is **phrased as similarity, not difference**. The P5 model scores it as a choice among the three pairs (`docs/spec.md:218-222`). There is no "can't decide" option.

Stored per answer as `site_a, site_b, site_c` in screen order, plus `chosen_pair` (`src/pages/SurveyPage.jsx:161-176`).

### 2.2 On-screen wording — 360° survey (`panoramic_v1`, live)

**Intro screen** (`src/pages/SurveyPage.jsx:264-308`):

> Perceptual survey · two short tasks
>
> **Which two of these spaces feel most alike?**
>
> Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Please judge based on the sense of space, not architectural style or surface materials.
>
> Each square is a **360° panorama**. Drag left or right to look around — you can turn the whole way in either direction.
>
> Pick the **two** that feel most similar, then the next set appears.
>
> Then you’ll describe each square you saw on a few simple scales — how open it felt, how enclosed, and so on.
>
> {12} comparisons, the ratings, then two short questions about you. Around 15 minutes. There are no right answers.
>
> [Begin]

If a file fails to load: "{n} panorama(s) could not be loaded." (`:294-298`).

**Each triplet screen** (`:319-389`):

> {position} of {12} · drag any panorama to look around
>
> Which **two** of these three spaces feel most similar in how open, enclosed, or spatially complex they feel?
>
> *[three panoramas, each overlaid with "drag to look around" (`src/components/PanoramaViewer.jsx:367-372`), each with a button showing the plaza name and city]*
>
> [Select two] / [Confirm these two] · {n} of 2 selected

The per-screen question leaves out the intro's second sentence ("Please judge based on the sense of space, not architectural style or surface materials."). **That caution appears only once, on the intro screen.**

Selecting a third panel drops the earliest selection (`:322-328`). An answer is saved only after "Confirm these two". There is no Back control.

### 2.3 On-screen wording — static-photo survey (archived)

Source: `18e6aea:src/pages/SurveyPage.jsx`. That commit is the last change to the survey page before collection (2026-08-06 → 08-19). The next change is `0218a43` on 2026-08-19.

**Intro** (`:193-240`):

> Spatial perception study
>
> **How similar do these public squares feel?**
>
> You’ll see three public squares at a time and choose the two that feel most alike as spaces. There are no right answers — we’re studying first impressions of space, so go with instinct rather than deliberating.
>
> Which two of these three spaces feel most similar in terms of how open, enclosed, or spatially complex they feel? Judge by the sense of space — not architectural style or surface materials.
>
> Rounds: {27} comparisons · Time: about 5 minutes · Sign-in: none — fully anonymous
>
> [Begin]

**Each round** (`:300-351`):

> Select the **two** squares that feel most similar.
>
> By the sense of space — how open, enclosed, or complex — not style or materials.
>
> *[status line]* Tap two squares to compare. / One more — pick its closest match. / These two feel most similar to you.
>
> [Next] (last round: [Finish])

The instruction sentence in `docs/spec.md:158` ("Please judge based on…") matches the 360° survey. **The static survey actually showed "Judge by the sense of space — not architectural style or surface materials."** The difference is small, but quote the static wording from the commit, not the spec.

### 2.4 Sampling

Both surveys use one sampler, `buildBalancedPool` (`src/lib/triplets.js:69-98`):

1. Seed a PRNG (mulberry32, `:30-39`) from a hash of the participant's random UUID (`SurveyPage.jsx:52-54`).
2. Greedily add triplets until **within this participant's private pool** every pair of the 18 sites appears at least `MIN_PAIR_COVERAGE = 2` times (`:12`). At each step, pick the best of 40 random candidates, scored by how many under-covered pairs it contains (`:85-93`). The pool runs to about 120 triplets (`docs/spec.md:168`).
3. Shuffle the pool and take the first N (`survey360.js:117-136`). Shuffle panel order within each triplet.

Properties relevant to validity:

- **Balanced within a participant's pool, not within their answered subset.** 12 triplets cover 36 of 153 pairs at most. A site can appear 0 times for one participant.
- **Not coordinated across participants and not adaptive.** Every draw is independent (`docs/spec.md:165-171`). Balance across the sample is expected from numbers, and checked afterwards (`src/lib/coverage.js`). Realised coverage in the 360° data: all 153 pairs seen, min 5, median 11, max 18 co-occurrences (`02_results_data.md` §4.1).
- **Repeats are possible.** A participant can meet the same trio twice by chance: 3 occurrences in the 360° data, 6 in the static data (`02_results_data.md` §2.4, §4.1). These are not deliberate repeat trials and **repeat-trial agreement was never analysed**.

Static survey: 26 genuine triplets from the same pool with seed `hashString(participant_id)`, plus one attention check (`src/lib/triplets.js:111-149`; now dead code, `01_methods_implementation.md` §1.4). 360° survey: 12 triplets, seed `hashString("panoramic:" + participant_id)` (`survey360.js:120`).

### 2.5 Length, order, attention checks

| | Static | 360° live |
|---|---|---|
| Triplets per participant | 27 = 26 + 1 check | 12 (`survey360.js:24`) |
| Order | Random, seeded per participant | Random, seeded per participant |
| Attention check | One trial showing plaza X twice with plaza Y (`[x, x, y]`), shuffled. The correct answer is the identical pair. Placed at 0-based index 12 or 13, i.e. question 13–14 (`triplets.js:21-26, 100-106, 132-140`). Same on-screen wording as genuine trials. | **None** (`SurveyPage.jsx:32-34`; `survey360.js:115-116`) |
| Check outcome | 54 passed, 0 failed, 2 not reached (`02_results_data.md` §2.1) | — |
| Rationale for dropping it | — | "the earlier static survey's check discriminated nobody across 50 participants" (`SurveyPage.jsx:32-34`) |
| Repeat / consistency trials | None deliberate | None deliberate |
| Per-trial timing | Not recorded | `shown_at`, `answered_at`, `duration_ms` (`SurveyPage.jsx:172-174`). Median 15.1 s per triplet (`02_results_data.md` §4.1). |
| Task order | Triplets only | Triplets first, **then** ratings. The order is fixed so explicit scales do not prime the triplet judgements (`survey360.js:17-19`). |

The 360° survey therefore has **no within-instrument check of attention or noise ceiling for the triplet task**. The substitute is split-half reliability of the rating block, which covers a different task (`02_results_data.md` §3.8).

### 2.6 Plaza names on screen

In **both** P3 surveys the plaza's name is printed under its image:

- Static: name and city (`18e6aea:src/pages/SurveyPage.jsx:386-391, 431`).
- 360°: name at every commit. The city was added back in `bc21afa` (2026-08-25), so it showed for sessions starting after that commit (`src/pages/SurveyPage.jsx:418-421`).

Participants could therefore recognise famous squares (Alexanderplatz, Marienplatz, Gendarmenmarkt), and **familiarity or reputation is a possible confound**. P8 deliberately hides names for this reason (`src/pages/MatchedViewSurvey.jsx:402-407`). **No rationale for showing names in P3: `NOT FOUND`.**

### 2.7 Changes to the 360° instrument during collection

Commit times (git committer time) against session `started_at`. Deploy lag to GitHub Pages is unknown, so the boundary is approximate.

| Commit | Time | Sessions started before | Change |
|---|---|---:|---|
| `abc37b8` | 2026-08-22 23:43 +02:00 | 0 | Instrument created; 4 panoramas replaced |
| `bacf24e` | 2026-08-23 00:26 +02:00 | 1 | **Opening yaw corrected by 90°.** The first session probably opened each panorama a quarter-turn from its centre. |
| `a43c1e3` | 2026-08-23 15:50 +02:00 | 7 | **Touch pitch disabled** (`touch-action: pan-y`). Before this, touch users could tilt, but touch drags blocked page scrolling. |
| `0031363` | 2026-08-23 16:10 +02:00 | 7 | Scroll container fix (layout) |
| `bc21afa`, `1090872` | 2026-08-25 04:24–04:28 +02:00 | 26 | City caption added beside plaza name |

Device type per session is not recorded, so **which sessions used touch is unknown**. The sampler code (`triplets.js`) did not change during either collection window. Its only mid-static-window commits, `d06d333` and `d1d768e`, change a string escape and add a constant.

---

## 3. Semantic differential

### 3.1 Collected?

**Yes, in the 360° survey only** (`panoramic_v1`). It was not collected in the static survey, the pilot or P8.

### 3.2 Items, scale, anchors

Four bipolar 7-point items, one per metric (`src/lib/survey360.js:149-177`). Value 1 is always the `low` anchor in storage:

| Item id | Metric | 1 (`low`) | 7 (`high`) |
|---|---|---|---|
| `area` | isovist area | Tight and confined | Spacious and open |
| `compactness` | compactness | Irregular, stretched-out shape | Compact, regular shape |
| `closedPerimeter` | closed perimeter | Views blocked, hidden corners | Clear sightlines, nothing hidden |
| `enclosure` | enclosure ratio | Low walls, exposed to the sky | Tall walls, strongly enclosed |

The closed perimeter scale's 7 end reads as **low** closed perimeter, so its expected correlation is negative (`scripts/validate-ratings.mjs:63-70`; `docs/spec.md:210`).

Presentation (`src/pages/SurveyPage.jsx:436-566`):

- Each item is a row of **7 unlabelled buttons** between its two anchor texts. There are no numbers and no midpoint label. The selected button shows "●".
- **Anchor side is randomised per participant, per item**, and fixed for the whole session (`survey360.js:194-208`). The drawn direction is stored as `anchor_direction` (`low_left` / `high_left`).
- All four items for a plaza are on one screen, with the same interactive panorama at the same 4:3 framing as the triplet task (`SurveyPage.jsx:436-445, 477-484`).
- Item order within the screen is fixed (area, compactness, closed perimeter, enclosure).
- **Plazas rated**: only those the participant saw in their triplets, in random order (`survey360.js:179-192`). In practice this was 14–18 plazas per participant, 56–72 ratings.

Screen text:

> Rating {position} of {total} · drag the panorama to look around
>
> How would you describe **this space**?
>
> *[panorama with plaza name and city]*
>
> *[four scale rows, anchor texts at each end]*
>
> [Next square] (last: [Finish ratings]) · {n} of 4 answered

The instruction gives no definition of the anchors. Anchor wording deliberately avoids technical terms (`survey360.js:142-145`).

### 3.3 Analysed? Where?

**Yes, as a validation separate from the weight fit.** The ratings never enter the weights (`docs/spec.md:203-208`).

- Script: `scripts/validate-ratings.mjs` (`npm run validate:ratings`). For each item it correlates the per-plaza mean rating with the computed `perceptual_360` metric across 18 plazas. It reports a permutation p (20,000 shuffles) with Holm correction, a Fisher CI, a participant bootstrap (2,000), and Spearman–Brown split-half reliability (2,000 splits). Method summary: `01_methods_implementation.md` §5.7.
- Output: `src/data/rating-validation.json` (full run, 2026-09-02). A quick n = 30 variant is `src/data/rating-validation-n30-quick.json`.
- Results: `02_results_data.md` §3.8. Aligned r: area 0.75, compactness 0.58, closed perimeter 0.22 (not significant), enclosure 0.83. Split-half reliability 0.77–0.99.
- The ratings feed the spec's H1–H3 (`docs/spec.md:237-244`: reliability, convergence, closed perimeter — all rating-based claims). **Numbering caveat:** the code's own hypothesis ids do not match the spec's. In `src/lib/analysis/hypotheses.js`, reliability is a separate `reliabilityPrecondition`, not a numbered hypothesis, and the ratings feed that plus code-`H2` and code-`H3` (same claims as spec H2/H3). Code-`H1` is "perceived similarity predicted by distance in the measured isovist space" (= spec's H4) and uses **no rating data** — see `04_decision_log.md` §U3 for the full renumbering.

**Anchor-position bias.** `validate-ratings.mjs:311-326` prints a check to the console only. It is **not stored** in `rating-validation.json`. Recomputed from the data for this document, mean value by drawn direction, descriptive only (not tested; direction is confounded with which plazas each participant rated):

| Item | `low_left` n, mean | `high_left` n, mean | Δ |
|---|---|---|---:|
| area | 262, 4.60 | 481, 4.88 | 0.28 |
| compactness | 387, 3.84 | 356, 4.21 | 0.37 |
| enclosure | 374, 4.63 | 369, 4.74 | 0.10 |
| closed perimeter | 348, 3.95 | 395, 4.02 | 0.07 |

All four are below the script's own 0.5 warning threshold. Area's split is unbalanced (262 vs 481) because direction is drawn once per participant.

**Not analysed:** item order effects, within-participant rating consistency, and rating × background.

---

## 4. Participants

### 4.1 Recruitment and eligibility

**Recruitment channel: `NOT FOUND`.** No mention exists in code, docs, data, commit messages or `02_results_data.md` (§2.1, §4.3).

**Eligibility criteria: `NOT FOUND` and not enforced.** No screening question exists. The link is open to anyone: no login, no age gate, no country or language filter (`src/App.jsx:162-179`; `src/pages/SurveyLaunch.jsx:76-80`). The UI is English only.

Target sample: "30–50" (`src/lib/triplets.js:14-19`; `docs/spec.md:163`). The target was stated for the sampler's coverage assumption, not from a power analysis.

**Overlap between cohorts: `NOT FOUND`.** Participant IDs are random per session, so it cannot be determined whether static, 360° and P8 participants are the same people. `src/lib/matchedView.js:63-64` refers to "having already asked this population for fifteen minutes once", which implies the P8 cohort was drawn from the same pool.

### 4.2 Demographics collected

**360° survey** (`src/pages/SurveyPage.jsx:568-618`), on the last screen before submission:

> Almost done
>
> **Two quick questions**
>
> Do you have a background in architecture, urban design, or planning?
> [Yes] [No] [Prefer not to say]
>
> Age group (optional)
> [18–24] [25–34] [35–44] [45–54] [55–64] [65+]
>
> [Finish]

Neither question is required: Finish is always enabled. Stored as `background` (`yes`/`no`/`undisclosed`) and `age_group`. Data: n = 46; background yes 29, no 17; age 18–24: 8, 25–34: 26, 35–44: 12 (`02_results_data.md` §4.1).

**Static survey** (`18e6aea:src/pages/SurveyPage.jsx:460-530`): the same two questions with the same options. It also carried the line "They help us understand how training and age shape spatial judgement." There, **background was required**: Finish was disabled until it was answered (`:517`).

**P8:** background only (§5).

**Not collected:** gender, nationality or country of residence, familiarity with the plazas, device type, vision.

### 4.3 Consent

**Consent text: `NOT FOUND`.** None of the four instruments has a consent screen, information sheet, researcher or institution name, contact address, or statement of the right to withdraw. The intro screens go straight to "Begin" (`SurveyPage.jsx:264-308`; `MatchedViewSurvey.jsx:255-286`; `18e6aea:src/pages/SurveyPage.jsx:193-240`). The closest statement is the static survey's "Sign-in: none — fully anonymous" (`18e6aea:…:228-233`). **Ethics approval: `NOT FOUND`.**

### 4.4 Data handling as implemented

- **Identifier:** a random UUID generated in the browser per session (`SurveyPage.jsx:52-54`). No name, email, IP address or device fingerprint is written by app code. Google may log requests to the Apps Script endpoint independently.
- **Incremental saving:** the whole session is re-sent after every answer, upserted by `participant_id`, with a `revision` counter so older saves cannot overwrite newer ones (`SurveyPage.jsx:90-155`; `google-apps-script/Code.gs:38-109`). **Abandoned sessions are therefore retained**, including answers from participants who stopped midway. No participant is told this.
- **Deployed storage:** POST to a Google Apps Script Web App (`src/lib/surveyEndpoint.js:13-14`), appended to a Google Sheet in the researcher's account. Reads need a token (`Code.gs:27-30, 157-162`). Setup: `docs/survey-storage-setup.md`.
- **Local storage:** in dev mode, sessions are written to `src/data/survey-responses-360.json` via `/__save-survey-360` (`vite.config.js:132`). Synced from the Sheet with `npm run sync:survey` (`scripts/sync-survey-360.js`).
- **Repository and deployment:** all three response files are committed to git (remote `github.com/tarekmatarawi/Spatial-Fingerprinting`). `survey-responses-360.json` is imported by `src/pages/HomePage.jsx:4`, `src/pages/SurveyLaunch.jsx:3` and `src/lib/surveyData.js:2`, so it is **bundled into the built site** deployed to GitHub Pages. Records hold only the UUID, timestamps, answers, background and age band. **Repository visibility was not verified here** (`gh` was unavailable). **Retention and deletion policy: `NOT FOUND`.**

---

## 5. P8 matched-view survey

### 5.1 Status

**Built, gate passed, run on an interim sample, not deployed for remote collection.**

- Built in `49a4c9f` (2026-09-09). Participant route `?matched-view-survey` (`src/App.jsx:171`); researcher route `#/matched-view`.
- Gate: `test/matchedView.test.js` and `npm run matched-view:selftest` pass (`02_results_data.md` §7.3).
- **15 completed sessions**, all started 2026-09-09 00:42–12:36 UTC, before the code was committed (13:12 UTC). All sit in the local dev file `src/data/matched-view-responses.json`, so they were saved through the dev server `/__save-matched-view` (`vite.config.js:244`). **How those participants reached a local dev server, and who they were: `NOT FOUND`.**
- `MATCHED_VIEW_ENDPOINT_URL = ''` (`src/lib/surveyEndpoint.js:28`). A deployed session runs to the end and then tells the participant "No storage endpoint is configured, so this session was not saved." (`MatchedViewSurvey.jsx:492-496`).

### 5.2 Stimulus

Rendered by `src/components/ViewRender.jsx` from P7 view-cloud markers stored in the frozen bank:

- untextured building masses on a plain ground plane with fixed sky gradient and lighting (`:70-99`);
- camera at the marker vantage, 1.6 m eye height (`src/lib/viewGeometry.js:13`);
- marker heading, and a **120° horizontal FOV** with vertical FOV derived from the canvas aspect (`ViewRender.jsx:128-131`).

This matches the `perceptual_120` isovist in position, heading and horizontal FOV **by construction**, because both come from the same marker and the same geometry. Remaining differences: the render shows building height and everything beyond 200 m, and the isovist is planar and capped at 200 m. Plaza names and metrics are hidden (`MatchedViewSurvey.jsx:402-407`).

### 5.3 Task design

**Anchor-based two-alternative forced choice.** A reference view on top ("this space"), two candidate views below, one tap to choose, no "same" option (`src/lib/matchedView.js:6-11`). Wording (`src/pages/MatchedViewSurvey.jsx`):

Intro (`:255-286`):

> One short task · {12} comparisons
>
> **Which space feels more alike?**
>
> You will see one space at the top and two below it. Pick the one below that feels more like the space above — in how open, enclosed, or spatially complex it feels, not in style or materials.
>
> The views are **plain grey models** of real city squares — no colours, signs, or materials, so only the shape of the space is left to judge.
>
> {12} comparisons, about two minutes. One tap each, and there are no right answers.
>
> [Begin]

Trial (`:303-400`):

> {position} of {12} · [← back]
>
> this space
>
> Which one below feels **more like it**?
>
> [① this one] [② this one]

Other details:

- Keyboard: ← / → or 1 / 2 (`:317-324`).
- Back re-opens the previous trial, and re-answering replaces the earlier answer (`:184, 238-246`).
- Closing screen: "Last step / **One quick question** / Do you have a background in architecture, urban design, or planning? [Yes] [No] [Prefer not to say] / [Finish]", optional (`:428-475`).
- Done: "Thank you / Your answers have been recorded. You can close this tab." (`:477-499`).
- No age question, consent screen or attention check (`matchedView.js:77-87`).

### 5.4 Pair selection

Frozen bank `src/data/matched-view-trials.json`, built by `npm run trials:matched-view` (`scripts/build-matched-view-trials.mjs`). Generated 2026-09-08T03:24:57Z with weights from `analysis-panoramic.json`.

- **Candidates:** every reference view in plaza A against every pair of other plazas (B, C). Each candidate plaza is represented by **its own view nearest the reference** in the weighted metric space (`:18-24, 309-313`).
- **Strata:**
  - `agreement`: centroid, Gaussian and Chamfer all predict the same candidate;
  - `discriminating`: Chamfer predicts one, centroid and Gaussian the other.

  1,872 trials where centroid and Gaussian disagree are discarded (`:323-326`).
- **Selection** (`:31-56`):
  1. drop trials below margin floor `MIN_STRENGTH = 0.05` (`:118`);
  2. 54 per stratum, 3 per reference plaza (`:102-103`);
  3. balance candidate appearances greedily within a window of 40 (`:127`);
  4. discriminating trials are taken most decisive first, and agreement trials spread across equal-count strength bins.

  Result: 108 trials. Every plaza is reference 6 times and a candidate 11–13 times (`02_results_data.md` §7.1).
- **Per participant:** 6 per stratum, seeded draw, strata interleaved, left/right position randomised per trial (`matchedView.js:211-248`).
- **Selection bias is stated:** the discriminating accuracy estimates *decisive* disagreements only (`docs/spec.md:331`).

### 5.5 Target sample size

The documents give three figures:

- 40, in `src/lib/matchedView.js:66-69` ("At 40 participants this collects 240 judgements per stratum") and `docs/spec.md:327`;
- "~40", in `docs/spec.md:390` ("at 15 of an intended ~40 participants");
- 30–50, in `scripts/build-matched-view-trials.mjs:91-94`.

**No power analysis: `NOT FOUND`.** Current n = 15.

### 5.6 What remains before it could run remotely

1. **Deploy storage.** Create the Sheet and deploy `google-apps-script/MatchedView.gs`, following its header (`:9-23`). Set a real `READ_TOKEN` (`:40`, still the placeholder in the repo). Paste the `/exec` URL into `MATCHED_VIEW_ENDPOINT_URL`, then rebuild and redeploy.
2. **Add a sync path.** `package.json` has no `sync:matched-view` script. Remote responses would have to be copied into `src/data/matched-view-responses.json` by hand, or a script written on the pattern of `scripts/sync-survey-360.js`.
3. **Consent and information text** (§4.3), shared with P3.
4. **Recruitment** for the remaining ~25 participants toward the 40 target. Channel `NOT FOUND`.
5. **Freeze discipline.** Do not rebuild the bank. A rebuild marks the 15 existing sessions stale (`src/lib/analysis/matchedView.js:138-178`).

---

## 6. Validity issues in one place

| # | Issue | Instrument | Where |
|---|---|---|---|
| 1 | No consent or information screen; no ethics record | all | §4.3 |
| 2 | Recruitment channel and eligibility unknown | all | §4.1 |
| 3 | Plaza name (and city) shown with every stimulus | static, 360° | §2.6 |
| 4 | Panorama source, capture conditions and camera position method unknown | 360° | §1.2 |
| 5 | Panoramas open at an uncalibrated image centre (`pano_north_offset_deg` unset everywhere) | 360° | §1.2 |
| 6 | Viewing behaviour not logged: how much of the 360° was seen is unknown, yet the isovist is 360° | 360° | §1.2 |
| 7 | Upper facades above ≈42° (≈30° on touch) count in enclosure but cannot be seen | 360° | §1.2 |
| 8 | Unequal panorama resolution: 2176 vs 2560 px effective width | 360° | §1.2 |
| 9 | Instrument changed mid-collection: yaw fix after session 1, touch pitch after session 7, city caption after session 26; device type not recorded | 360° | §2.7 |
| 10 | "Judge by sense of space, not style" shown once, on the intro only | 360° | §2.2 |
| 11 | No attention check and no repeat trials for the triplet task | 360°, P8 | §2.5 |
| 12 | Photo FOV unknown; 8:5 crop; heading and position placed by eye | static | §1.1 |
| 13 | One stimulus file (Konstablerwache) replaced after the static study | static | §1.1 |
| 14 | Obstacles in photos (trees, stalls, people) absent from the building-only isovist | all photographic | §1.1–1.2 |
| 15 | P8 interim sessions collected via a local dev server before commit | P8 | §5.1 |
| 16 | Survey response file bundled into the public site build | 360° | §4.4 |

---

## 7. Documentation discrepancies found

These don't change the protocol, but a reader cross-checking sources will hit them.

| Location | Says | Actually |
|---|---|---|
| `src/lib/surveyEndpoint.js:9-10` | archive holds "1,213 sessions" | `src/data/survey-responses.json` has 56 records (1,387 responses) |
| `docs/spec.md:156-161` | P3 = 27 static triplets with an attention check | That describes the archived static survey; live P3 is §2.2 here |
| `docs/spec.md:158` | static instruction "Please judge based on…" | Static survey showed "Judge by the sense of space — not…" (§2.3) |
| `src/lib/survey360.js:183-184` | participants rate "typically 10–15 sites" | 14–18 in the data |
| `src/pages/SurveyPage.jsx:289-291` | "Around 15 minutes" | median session 19.3 min (`02_results_data.md` §4.1) |
| `src/pages/SurveyLaunch.jsx:105`, `src/lib/surveyEndpoint.js:5` | `docs/survey-360-storage-setup.md` | File does not exist; it is `docs/survey-storage-setup.md` |
| `docs/survey-storage-setup.md:115, 130-132` | `#/survey-360-review`; "Ten participants is a feasibility sample" | Route does not exist; 46 were collected and fitted |
| `google-apps-script/Code.gs:68-71` | "blank until the mid-survey attention check is answered" | The live survey has no check |
| `docs/street-view-photo-guide.md:16-17, 82-84` | frame is `aspect-[8/5]` in `SurveyPage.jsx`; Hauptwache is a PNG | True for `18e6aea`; the current page is panoramic and Hauptwache has been `.jpg` since `a6fb346` |

---

## 8. `NOT FOUND` index

| Item | Section |
|---|---|
| Source of each static image (Street View vs photograph), capture date, FOV | §1.1 |
| Rule for choosing the static image viewpoint | §1.1 |
| Reason for excluding Viktualienmarkt and Königsplatz; meaning of "low-fit" | §1.1 |
| Panorama source, device, date, conditions, stitching | §1.2 |
| Rule for choosing the panorama camera position; method for locating it in the model | §1.2 |
| Whether Gendarmenmarkt's 360° reading was re-placed | §1.3 |
| What "area-matched" meant in the pilot | §1.4 |
| Rationale for showing plaza names in P3 | §2.6 |
| Recruitment channel; eligibility criteria; cohort overlap | §4.1 |
| Consent text; information sheet; ethics approval | §4.3 |
| Data retention and deletion policy; repository visibility | §4.4 |
| How and by whom the 15 P8 sessions were run | §5.1 |
| Power analysis for P3 or P8 | §4.1, §5.5 |
