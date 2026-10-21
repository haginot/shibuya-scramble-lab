Fix web3d/sol/ (only edit that folder; no browser available — reason carefully about geometry). A headless render of ?cam=intro&timelapse=1050,1380&hideui=1 showed:
- 0-6s: camera is too low and placed inside/behind buildings: the view is filled by building walls; the train is barely visible behind them; no passengers visible.
- ~6s: camera clips through a large rooftop (huge flat polygon fills the bottom half).
- 10s+: overview looks good (glowing streets, lit windows) but night (21:00+) is not dark enough; sky stays bluish-grey.
Fix:
1. Intro shots: compute positions relative to the station platform (rails nearest the station origin) and terrain height; keep camera at least 45 m above the max building height within 60 m of the camera position (sample buildings), 0-6s at ~55-70 m altitude, ~90-120 m horizontal distance, looking down ~35-40 deg at the platform where the train stops, perpendicular-ish to the track so the full train is in frame. Add a safety: every frame, if camera is within any building footprint bbox+5 m and below its height+10 m, raise it.
2. Passengers pouring out must be clearly visible in that shot: when the train stops, spawn a burst of 60-120 glowing figures (scale ~2.5 m, emissive, color by type) that stream from the doors onto the platform and out to the station exits/streets for ~8 s, in addition to real tracks. Make figures readable at overview distance too (scale by camera distance, minimum ~6 px).
3. Night: by 20:30 sky near-black navy, ambient low, buildings dark with lit windows and street glow dominant; evening 17:30-19:00 warm orange sunset gradient.
4. Ensure the first train in intro/timelapse arrives and stops within the first 3 s.
Keep everything else. node --check all modules; update README.
