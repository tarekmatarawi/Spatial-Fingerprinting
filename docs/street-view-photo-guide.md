# Street-view photo guide

How to shoot (or re-shoot) a plaza's survey photo so it's comparable to the
other 18 — same framing logic, same lighting conditions, nothing that would
bias a participant's "open vs. enclosed" judgment before they've even looked
at the geometry.

Written after reviewing all 19 photos as they actually render in the survey.
Full findings and per-site notes are in that conversation; this is the
distilled checklist for next time.

---

### 1. Frame ratio: aim for 16:10 (1.6), the frame's own ratio

The survey displays every photo in a fixed **8:5 = 1.60** frame (`aspect-[8/5]`
in [SurveyPage.jsx](../src/pages/SurveyPage.jsx)), cropped to fit and anchored
to the **bottom edge** — so any trimming eats sky first, never the ground
plane or building bases.

A photo shot at 1.6 fills it exactly, with nothing cropped. The further from
1.6 in either direction, the more gets trimmed:

- **4:3 (1.33), many phones' default** — loses ~17% off the top. Acceptable,
  but check nothing important (spires, roof lines) sits near the top edge,
  since roof lines are a key enclosure cue.
- **Panoramic / ultra-wide (1.9–2.2)** — loses ~16–25% split off both sides.
  Usable, but you're throwing away much of what you walked back to capture.
- **Don't shoot portrait / vertical.** It fights the frame badly.

Most phones let you pick 16:9 or 16:10 in the camera settings — 16:10 is the
exact match. 16:9 (1.78) is close enough, losing ~10% off the sides.

> Why 1.6 and not wider: the current set is bimodal — eight plazas near 1.32,
> the rest 1.6 to 2.15. Past ~1.67 the narrow group starts losing more than
> 20% off the top and clipping roof lines. 1.6 is the widest frame that
> doesn't damage them. If those eight are ever re-shot wider, the frame can
> widen too.

### 2. Standing distance: match the landmark's share of the frame

This is the biggest source of real inconsistency found in the current set.
Some photos are shot close (the main building fills most of the frame:
Marienplatz, Marktplatz-Heidelberg, Odeonsplatz); others are shot from far
back, with a small distant landmark and a large expanse of empty foreground
pavement (Pariser-Platz, Augustusplatz-Leipzig).

Since participants are explicitly judging *openness vs. enclosure*, a photo
that's 70% empty foreground reads as more open regardless of the plaza's
actual geometry — that's the camera talking, not the space.

**Rule of thumb:** stand where a visitor would actually stand — the plaza's
natural entry point or habitual vantage, not pressed against a facade and not
at the far edge — and aim for the main landmark/facade to occupy roughly the
**middle third to half of the frame height**. Not full-frame, not a speck.

### 3. Lighting: clear sky, matching time of day

Konstablerwache was shot heavily overcast while nearly every other plaza is
bright and sunny — flat grey light reads as duller and less inviting, which
is a weather artifact, not a spatial one.

- Shoot under clear or lightly clouded sky if at all possible.
- Avoid golden-hour for one plaza and flat midday for another — long shadows
  and warm light change how enclosed a space *feels* independent of its
  geometry.

### 4. No temporary structures

Schlossplatz-Stuttgart currently has a Ferris wheel and festival tent filling
the middle of the frame — this is the one photo that doesn't belong next to
the other eighteen; a participant is comparing "plaza with a fairground" to
"plaza," not spatial character.

- Reschedule the shot if a market stall, fair, stage, or construction
  hoarding is temporarily occupying the space.
- Ordinary daily life — pedestrians, cyclists, café tables — is fine and
  actually helps convey scale. Large temporary installations are not.

### 5. Resolution: match the rest of the set

Most current photos are ~1685×1271px. Hauptwache is a noticeably smaller PNG
(1110×784) and looks visibly softer next to its neighbors in a triplet.
Shoot at a comparable resolution — any modern phone camera on default
settings clears this easily; just don't downscale before uploading.

---

## Quick checklist before you upload

- [ ] Standing at the plaza's natural vantage point (not jammed against a wall, not at the far edge)
- [ ] Main landmark/facade fills roughly a third to half of the frame height
- [ ] Clear or lightly clouded sky
- [ ] No fairs, markets, stages, or construction blocking the view
- [ ] Full resolution, not pre-cropped to portrait
- [ ] Upload via the admin page's **Choose file…** so it's saved and named automatically ([AdminPage.jsx](../src/pages/AdminPage.jsx))
