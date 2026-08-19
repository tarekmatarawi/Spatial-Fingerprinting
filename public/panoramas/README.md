# Panoramas (360° pilot)

Equirectangular JPEGs, one per active site, named with the **same slug as that
site's static photo** in `../images/` — e.g. `gendarmenmarkt-berlin.jpg`.

- **Projection:** equirectangular, 2:1 aspect ratio.
- **Resolution:** 4096×2048 is plenty. Three panoramas load at once, so larger
  files cost memory three times over on the participant's machine.
- **Orientation:** an equirectangular image has an arbitrary yaw origin, so each
  panorama opens at its own image centre unless the site declares
  `pano_north_offset_deg` in `sites.json` — the compass bearing of the image's
  centre column. Set it to open every plaza on a shared heading.

The pilot's review page (`#/pilot-360-review`) lists which sites are still
uncalibrated; a missing file is reported by the survey when it fails to load.
