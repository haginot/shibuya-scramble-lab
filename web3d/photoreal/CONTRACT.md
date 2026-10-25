# Photoreal cutaway prototype — shared contract (all modules follow this)

Coordinates (same as web3d/shibuya/series): metres, **x east, y up, z south**, origin = Scramble centre
lat 35.65948, lon 139.70055 (local ENU tangent plane, z = -north). y = 0 at the ground surface at the origin
(ellipsoidal height of the road surface at the Scramble, `h0` in manifest.json).

Data (generated, NOT committed; `web3d/photoreal/data/` is gitignored; rebuild with tools/photoreal/fetch_tiles.py,
download cache in /workspace/projects/logs/ssl-claude-photoreal/cache):
  web3d/photoreal/data/manifest.json   {h0, center, bbox, clip:{x0,x1,z0,z1,y0}, layers:{bldg:[...glb], tran:[...], ...},
                                        buildings:{<bid int>: {gml_id, height, storeys, storeysBelow, base_y, top_y, usage}}, attribution, license}
  web3d/photoreal/data/*.glb           plain glTF 2.0 binary (no Draco/meshopt), local coords above, JPEG textures,
                                        standard POSITION/NORMAL/TEXCOORD_0 + custom `_BID` (float, building id → manifest.buildings)
Loader: web3d/vendor/addons/ (three r160 GLTFLoader + utils, MIT, same revision as web3d/vendor/three.module.min.js).

Modules (ES modules, import three from '../vendor/three.module.min.js'):
  web3d/photoreal/cutaway.mjs   clip box + cap (procedural interiors) + plinth
  web3d/photoreal/night.mjs     night materials for photo-textured meshes, windows, street lights, Halloween accents, grade
  web3d/photoreal/camera.mjs    camera presets for the 4 stills + 10 s clip path
  web3d/photoreal/app.mjs       glue; page web3d/photoreal/index.html; window.__ready, window.__frame(t)
Rendering: headless Chromium + SwiftShader WebGL2 (see tools/record_shibuya.py browser_with_webgl); always `nice -n 10`.
Logs / scratch: /workspace/projects/logs/ssl-claude-photoreal/
Never touch /workspace/projects/ssl-claude-halloween or logs/ssl-claude-halloween.
