# Photoreal cutaway prototype: data sources and licences

This covers the generated data in `web3d/photoreal/data/` (not committed; rebuild with `tools/photoreal/fetch_tiles.py`)
and the vendored three.js addons in `web3d/vendor/addons/`.

## 1. MLIT Project PLATEAU 3D city models (Shibuya City, FY2025)

Found through the PLATEAU data catalogue API (https://api.plateau.reearth.io/datacatalog/plateau-datasets).
All are 3D Tiles converted from CityGML (PLATEAU 3D city model standard spec, `13113_shibuya-ku_pref_2025_citygml_1_op`).

| layer | dataset | tileset URL |
|---|---|---|
| bldg | 建築物モデル LOD2, textured (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/16/b016d3-42ef-4428-ad99-d229310b39fd/13113_shibuya-ku_pref_2025_citygml_1_op_bldg_3dtiles_13113_shibuya-ku_lod2/tileset.json |
| tran | 交通（道路）モデル LOD3 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/ba/3b3ca7-270b-4fd9-b355-27b1ea7d7df5/13113_shibuya-ku_pref_2025_citygml_1_op_tran_3dtiles_lod3/tileset.json |
| frn | 都市設備モデル LOD3 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/ec/00bf52-fdbf-4c0c-8ed8-3a9e1f5ea146/13113_shibuya-ku_pref_2025_citygml_1_op_frn_3dtiles_lod3/tileset.json |
| veg | 植生モデル 単独木 LOD3 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/9f/a51d8e-3d44-447d-82f4-9a59ad51dfb9/13113_shibuya-ku_pref_2025_citygml_1_op_veg_SolitaryVegetationObject_3dtiles_lod3/tileset.json |
| veg | 植生モデル 植被 LOD3 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/fc/69b3bb-6a85-47f3-b4f0-abdb1da381ef/13113_shibuya-ku_pref_2025_citygml_1_op_veg_PlantCover_3dtiles_lod3/tileset.json |
| brid | 橋梁モデル LOD2 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/37/acee1e-84d2-457d-a6a6-486d52cdb1a1/13113_shibuya-ku_pref_2025_citygml_1_op_brid_3dtiles_lod2/tileset.json |
| ubld | 地下街モデル LOD4 (渋谷区, 2025) | https://assets.cms.plateau.reearth.io/assets/ea/284655-a1e2-46c1-bdb5-ee4a66af67a3/13113_shibuya-ku_pref_2025_citygml_1_op_ubld_3dtiles_lod4/tileset.json |

**Licence.** PLATEAU site policy (https://www.mlit.go.jp/plateau/site-policy/, checked 2026-10-26), section 3
「コンテンツの利用」: content, including the 3D city model open data (copyright held by the local governments),
may be used under terms based on 「公共データ利用規約（第1.0版）」(PDL1.0). The policy says these terms are
compatible with CC BY 4.0, and that MLIT 都市局 国際・デジタル政策課 permits use under CC BY 4.0 (ODC-BY / ODbL are
also not prevented). Requirements: credit the source, state separately that the content was edited/processed,
and do not present the processed result as if MLIT made it. Note from the policy: some content is also restricted by
specific laws, e.g. the Survey Act (測量法) for public survey results; see the PLATEAU handbooks
(https://www.mlit.go.jp/plateau/libraries/handbooks/).

**Required credit (on screen / in the video description):**

> 出典：国土交通省 PLATEAU（3D都市モデル 東京都渋谷区 2025年度 建築物LOD2・道路LOD3・都市設備LOD3・植生LOD3・橋梁LOD2・地下街LOD4）を加工して作成

Short form for overlays: 「出典：国土交通省 PLATEAU（渋谷区 2025）を加工して作成」

**Changes made (加工内容):** leaf tiles inside an approx. 900 m × 840 m box around Shibuya Station / the Scramble
(local x −420…480 m, z −420…420 m) were selected; Draco decoded; changed from ECEF (ellipsoidal heights) to a local
metric ENU frame centred on the Scramble (35.65948 N, 139.70055 E) and shifted so y = 0 is the road surface at the
origin (h0 = 51.894 m ellipsoidal); WebP texture atlases re-encoded as JPEG (q85) and scaled down from up to 8192 px to
≤ 2048 px (alpha flattened); geometry regrouped into a few GLB files by area and material; road surfaces split by
`tran:function` (車道部 / 車道交差部 / 歩道部 / 島) with flat colours; building attributes (gml_id, measured height,
storeys, usage, name) copied into `manifest.json`. No geometry was invented except the optional bottom caps
(none were needed: the source building solids already have ground faces). Further visual changes such as night
lighting, cutaway caps and procedural interiors are made in the renderer. They are illustrative and are not PLATEAU data.

## 2. GSI elevation tiles (国土地理院 地理院タイル 標高タイル)

- DEM5A (5 m mesh, laser survey) z15: https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png
- DEM10B fallback z14 (filled 158 of 47,686 grid cells that DEM5A leaves empty): https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png
  (DEM5B z15 was tried as well; it returns 404 for these tiles.)
- Licence: 国土地理院コンテンツ利用規約 (https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html), based on PDL1.0.
  Credit the source, and mark processed use separately.
- Credit: 「出典：国土地理院（地理院タイル 標高タイル）」 plus, because the data was processed,
  「地理院タイル（標高タイル（基盤地図情報数値標高モデル））を加工して作成」
- Changes: resampled bilinearly to a 4 m grid in the local frame; orthometric heights converted to ellipsoidal heights
  with a constant offset of +36.80 m (fitted to PLATEAU road surfaces, close to the Tokyo geoid height), then h0
  subtracted; grid cells with no data filled from the nearest valid cell (`web3d/photoreal/data/terrain.json`).

## 3. Not used

- **Google Photorealistic 3D Tiles (Map Tiles API) were NOT used**, nor any other Google / commercial 3D mesh or
  imagery. All photo textures come from the PLATEAU datasets above.

## 4. Software

- three.js r160 addons `GLTFLoader.js`, `utils/BufferGeometryUtils.js` (MIT, © 2010-2023 three.js authors), vendored from
  https://unpkg.com/three@0.160.0/examples/jsm/ into `web3d/vendor/addons/`. The only change is the import paths
  (see `web3d/vendor/addons/LICENSE`).
- Build-time Python packages (not distributed): DracoPy (Apache-2.0), numpy, Pillow, shapely, mapbox-earcut, scipy.
- three.js r160 core `web3d/vendor/three.module.min.js` (MIT, see `web3d/vendor/LICENSE`).
- On-screen credit text renders in the system Noto Sans CJK JP font (SIL OFL 1.1); no font file is distributed.

## 5. Rendered extent and on-screen credit

- Rendered clip box (local metres, x east / z south from the Scramble): x −340…160, z −250…222, plinth bottom y −42.
  The east plane x = 160 cuts Shibuya Scramble Square; the cut faces show procedurally generated interiors (not data).
  The manifest suggests z1 = 250; `web3d/photoreal/app.mjs` uses 222 to leave out a thin sliver of the Sakura Stage tower.
- Burnt-in credit (`web3d/photoreal/index.html`) and MP4 metadata: 「出典：国土交通省 PLATEAU（渋谷区 2025）を加工して作成」
  「出典：国土地理院（標高タイル）を加工して作成」. Use the full form in §1 in descriptions / end cards.
- The dataset ids contain `_pref_` (published through the Tokyo Metropolitan Government's PLATEAU programme); the MLIT
  PLATEAU credit above is the one the site policy requires. Confirm the provider line before publishing.

## 6. Third-party rights in the photo textures

The PLATEAU facade textures are aerial/street photographs and contain real advertisements, trademarks and in places
people's likenesses (e.g. billboards around the Scramble). The PLATEAU licence covers the dataset, **not** third-party
rights in what is photographed. This prototype blurs the textures in close shots (mip LOD bias per shot,
`SHOTS[*].texBias` in `web3d/photoreal/camera.mjs`, `uTexBias` in `night.mjs`) so that no brand is legible in the
deliverables; before publishing, check every frame, or mask the ad-heavy atlas regions in `tools/photoreal/fetch_tiles.py`.
