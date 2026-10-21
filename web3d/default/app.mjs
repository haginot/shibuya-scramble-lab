import * as THREE from '../vendor/three.module.min.js';
import { Batch, basic, standard, ll, initWorld, terrainHeight, random, palette, buildCity, initRailRoute, railZ, buildHeat, buildAlternative, buildTrain, disposeGroup } from './city.mjs';

window.__ready = false;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const scenarioKeys = ['baseline', 'rain', 'event'], altKeys = ['bike', 'cafe', 'plaza'];
const finite = (v, fallback) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cameraMode = ['intro', 'site'].includes(params.get('cam')) ? params.get('cam') : '';
const exag = clamp(finite(params.get('exag'), 2), 0, 10);
const agentScale = clamp(finite(params.get('agentScale'), 1), .25, 6);
const lapseParts = (params.get('timelapse') || '').split(',');
const timelapse = lapseParts.length === 2 && lapseParts.every(v => v.trim() !== '' && Number.isFinite(Number(v)))
  ? lapseParts.map(v => clamp(Number(v), 360, 1440)) : null;
const hideUI = params.get('hideui') === '1', compare = params.get('compare') === '1';
const state = {
  scenario: scenarioKeys.includes(params.get('scenario')) ? params.get('scenario') : 'baseline',
  alt: params.get('scenario') === 'newcafe' ? 'cafe' : altKeys.includes(params.get('alt')) ? params.get('alt') : 'bike',
  t: clamp(finite(params.get('t'), 1108.65), 360, 1439.99),
  speed: clamp(finite(params.get('speed'), 1), 0, 120),
  orbit: params.get('orbit') !== '0', playing: true, ui: params.get('ui') !== '0' && !hideUI
};
document.body.classList.toggle('ui-hidden', !state.ui);
document.body.classList.toggle('capture-ui', hideUI);
document.body.classList.toggle('compare-mode', compare);
window.__caption = (ja = '', en = '') => {
  $('caption-ja').textContent = String(ja); $('caption-en').textContent = String(en);
  $('caption').hidden = !ja && !en;
};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18303b);
scene.fog = new THREE.Fog(0x18303b, 470, 1450);
const camera = new THREE.PerspectiveCamera(41, innerWidth / innerHeight, 1, 4000);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
} catch (error) { fail(error); }
if (renderer) start().catch(fail);
function fail(error) {
  console.error(error); window.__error = String(error);
  $('loading').replaceChildren();
  const box = document.createElement('div'); box.className = 'error';
  const title = document.createElement('h2'); title.textContent = 'The miniature could not load.';
  const detail = document.createElement('p'); detail.textContent = `${error.message || error}. Serve the repository root with python3 -m http.server, then open /web3d/sol/. WebGL must be enabled.`;
  box.append(title, detail); $('loading').append(box);
}
async function fetchJSON(path) {
  const res = await fetch(path); if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`); return res.json();
}
async function start() {
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Cache the static city's shadow map; avoid redrawing 3,000 buildings every frame.
  renderer.shadowMap.autoUpdate = false;
  $('world').append(renderer.domElement);
  const defaultEngine = await fetchJSON('../data/engine.json');
  const area = (defaultEngine.available_areas || ['asagaya', 'koenji']).includes(params.get('area')) ? params.get('area')
    : defaultEngine.area === 'koenji' ? 'koenji' : 'asagaya';
  const suffix = area === 'koenji' ? '_koenji' : '';
  const [buildings, engine, terrain] = await Promise.all([
    fetchJSON(`../data/buildings${suffix}.json`),
    area === (defaultEngine.area || 'asagaya') ? defaultEngine : fetchJSON(`../data/engine${suffix}.json`),
    fetchJSON(`../data/terrain${suffix}.json`)
  ]);
  initWorld(buildings, terrain, exag, finite(params.get('seed'), 4281));
  const areaEn = area === 'koenji' ? 'KOENJI' : 'ASAGAYA', areaJa = area === 'koenji' ? '高円寺' : '阿佐ヶ谷';
  const stationPOI = engine.pois.find(p => p.cat === 'station');
  const stationName = stationPOI?.name || `${areaJa}駅`;
  document.title = `${areaEn} — A living miniature`;
  $('world').setAttribute('aria-label', `Interactive 3D miniature of ${areaEn}, Tokyo`);
  $('brand-link').setAttribute('aria-label', `${areaEn} home`);
  $('brand-link').setAttribute('href', `?area=${area}`);
  const jaTitle = document.createElement('span'); jaTitle.textContent = areaJa;
  $('area-title').replaceChildren(document.createTextNode(areaEn), jaTitle);
  $('area-coordinate').textContent = `TOKYO / SUGINAMI · ${buildings.origin[0].toFixed(4)}° N`;
  $('station-line').textContent = `CHŪŌ LINE · ${areaEn}`;
  const sky = new THREE.HemisphereLight(0xc8e5ec, 0x45554a, 1.65); scene.add(sky);
  sky.name = 'Ambient sky';
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 skyDirection; void main(){ skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 skyDirection;
      void main(){ float h=smoothstep(0.,.65,normalize(skyDirection).y);
        gl_FragColor=vec4(mix(horizon,zenith,h),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), skyMaterial);
  skyDome.name = 'Sunset sky gradient'; skyDome.renderOrder = -1000; skyDome.frustumCulled = false; scene.add(skyDome);
  const sun = new THREE.DirectionalLight(0xffd8a8, 2.2); sun.position.set(-180, 290, -90); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = sun.shadow.camera.bottom = -430; sun.shadow.camera.right = sun.shadow.camera.top = 430; sun.shadow.camera.far = 1000; sun.shadow.normalBias = .65; sun.shadow.bias = -.0002;
  const station = stationPOI ? ll(stationPOI.lat, stationPOI.lon) : ll(...engine.center);
  initRailRoute(buildings.rails, station.x, station.z);
  const city = buildCity(scene, buildings, engine);
  // The POI can sit beside the tracks. All opening geometry uses the stopping
  // platform on the rail route selected nearest that station, in terrain metres.
  const platform = new THREE.Vector3(station.x, terrainHeight(station.x, railZ(station.x)) + 5.85, railZ(station.x));
  const trackAngle = Math.atan2(railZ(platform.x + 5) - railZ(platform.x - 5), 10);
  const trackNormal = new THREE.Vector3(-Math.sin(trackAngle), 0, Math.cos(trackAngle));
  // Prefer the side/offset with the lowest safe altitude. Remain within 15 degrees
  // of broadside, so all ten cars are readable rather than foreshortened.
  const openingCandidates = [];
  for (const side of [-1, 1]) for (const offset of [-.25, -.125, 0, .125, .25]) for (const radius of [90, 96, 102]) {
    const angle = trackAngle + side * Math.PI / 2 + offset;
    const position = new THREE.Vector3(platform.x + Math.cos(angle) * radius, 0, platform.z + Math.sin(angle) * radius);
    position.y = Math.max(terrainHeight(position.x, position.z) + 60, platform.y + radius * Math.tan(THREE.MathUtils.degToRad(35)), city.nearbyRoofHeight(position.x, position.z) + 45);
    const altitude = position.y - terrainHeight(position.x, position.z);
    openingCandidates.push({ position, side, score: Math.abs(altitude - 67) + Math.abs(radius - 96) * .1 + Math.abs(offset) });
  }
  openingCandidates.sort((a, b) => a.score - b.score);
  const opening = openingCandidates[0];
  const site = ll(...engine.site);
  let alternative, heat, tracks = [], badges = [], activeData;
  const train = buildTrain(scene); train.name = 'Chuo train';

  // Pure type-colored, unlit emission avoids pale lighting/specular highlights.
  // The same three-metre capsule is used by recorded and decorative passengers.
  const figure = new Batch();
  figure.add(new THREE.CapsuleGeometry(.48, 2.04, 4, 8), 0, 1.5, 0, 1, 1, 1, 0xffffff);
  const personMat = basic({ toneMapped: false });
  const figureGeometry = figure.geometry();
  const capacity = Math.max(...['scenarios', 'alternatives', 'scenario_alternatives'].flatMap(g => Object.values(engine[g] || {}).map(s => s.tracks.length)));
  const agents = new THREE.InstancedMesh(figureGeometry, personMat, capacity); agents.instanceMatrix.setUsage(THREE.DynamicDrawUsage); agents.frustumCulled = false; scene.add(agents); agents.name = 'Recorded people';
  const tokens = new THREE.InstancedMesh(new THREE.CircleGeometry(1.7, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25, depthWrite: false, toneMapped: false }), capacity); tokens.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tokens.frustumCulled = false; scene.add(tokens);
  const dummy = new THREE.Object3D();
  // These short-lived station figures are decorative, separate from recorded tracks.
  const burstSize = 96, burstLifetime = 10, burstCapacity = burstSize * 4;
  const burst = new THREE.InstancedMesh(figureGeometry, personMat, burstCapacity); burst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); burst.frustumCulled = false; scene.add(burst); burst.name = 'Alighting passengers';
  // Point sprites have a soft radial glow without a canvas texture or network asset.
  const glowGeometry = new THREE.BufferGeometry();
  const glowPositions = new Float32Array((capacity + burstCapacity) * 3), glowColors = new Float32Array((capacity + burstCapacity) * 3);
  const glowSizes = new Float32Array(capacity + burstCapacity);
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
  glowGeometry.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
  glowGeometry.setAttribute('size', new THREE.BufferAttribute(glowSizes, 1));
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { viewportHeight: { value: innerHeight }, pixelRatio: { value: renderer.getPixelRatio?.() || 1 } },
    vertexShader: 'uniform float viewportHeight; uniform float pixelRatio; attribute float size; attribute vec3 color; varying vec3 glowColor; void main(){ glowColor=color; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=clamp(size*projectionMatrix[1][1]*viewportHeight*.5/max(1.,-p.z),16.,72.)*pixelRatio; }',
    fragmentShader: `varying vec3 glowColor; void main(){ float r=length(gl_PointCoord-vec2(.5))*2.; float a=pow(max(0.,1.-r),2.); gl_FragColor=vec4(glowColor,a*.75);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const agentGlows = new THREE.Points(glowGeometry, glowMaterial); agentGlows.frustumCulled = false; scene.add(agentGlows); agentGlows.name = 'People glow sprites';
  const trailSegments = 5, trailPositions = new Float32Array(burstCapacity * trailSegments * 6), trailColors = new Float32Array(trailPositions.length);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  trails.name = 'Passenger light trails'; trails.frustumCulled = false; scene.add(trails);
  const streetPoints = activeStreetPoints(engine);
  const burstSeeds = Array.from({ length: burstSize }, (_, i) => {
    const door = platform.x + ((i % 10) - 4.5) * 18.8 + (i % 2 ? -4 : 4);
    const side = opening.side, lane = random() * .9, exitX = platform.x + (i % 2 ? -15 : 15) + lane;
    const exit = new THREE.Vector3(exitX, 0, railZ(exitX)).addScaledVector(trackNormal, side * 23);
    const streets = streetPoints.filter(p => (p.x - platform.x) * trackNormal.x * side + (p.z - platform.z) * trackNormal.z * side > 30);
    streets.sort((a, b) => a.distanceToSquared(exit) - b.distanceToSquared(exit));
    const street = streets.length ? streets[i % Math.min(12, streets.length)].clone() : exit.clone().addScaledVector(trackNormal, side * 35);
    const doorPoint = new THREE.Vector3(door, 0, railZ(door)).addScaledVector(trackNormal, side * 1.9);
    const edge = new THREE.Vector3(door, 0, railZ(door)).addScaledVector(trackNormal, side * (3.6 + lane));
    const gate = new THREE.Vector3(exitX, 0, railZ(exitX)).addScaledVector(trackNormal, side * (3.6 + lane));
    return { door, doorPoint, edge, gate, side, lane, exitX, exit, street, delay: random() * .4, lifetime: 6.5 + random() * 3.1, scale: 1 + random() * .08,
      color: new THREE.Color(palette[['commuter', 'visitor', 'resident'][i % 3]]) };
  });
  function activeStreetPoints(data) {
    return data.scenarios.baseline.heat.flatMap(h => [ll(h[0], h[1]), ll(h[2], h[3])]).filter(p => p.distanceTo(platform) < 110);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(140 * 3), sparkColors = new Float32Array(140 * 3);
  const sparkSeeds = Array.from({ length: 140 }, () => ({ x: (random() - .5) * 175, z: random() * 2, phase: random(), drift: (random() - .5) * 16 }));
  for (let i = 0; i < 140; i++) { const c = new THREE.Color(i % 3 ? 0xffc579 : 0xa7e5cd); c.toArray(sparkColors, i * 3); }
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3)); sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ vertexColors: true, size: 1.6, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);

  // Rain uses one line draw call, no textures or external resources.
  const rainCount = 2400, rainPos = new Float32Array(rainCount * 6);
  const rainSeeds = Array.from({ length: rainCount }, (_, i) => {
    const span = i % 3 ? 240 : 800;
    return [(random() - .5) * span, random(), (random() - .5) * span];
  });
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0x96cfff, transparent: true, opacity: .58, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); rain.frustumCulled = false; rain.name = 'Rain streaks'; scene.add(rain);
  const puddles = new Batch(true);
  for (let i = 0; i < 100; i++) {
    const h = engine.scenarios.rain.heat[i * 17 % engine.scenarios.rain.heat.length], pos = ll(h[0], h[1]);
    puddles.add(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), pos.x, .14, pos.z, 2 + random() * 4, 1, 1 + random() * 2, 0x8babba);
  }
  // Broad, soft colored streaks fake reflected street/window light without a
  // second render pass. They follow the same terrain sampler as the streets.
  const sheenBatch = new Batch(true);
  for (let i = 0; i < 100; i++) {
    const h = engine.scenarios.rain.heat[i * 13 % engine.scenarios.rain.heat.length], p = ll(h[0], h[1]);
    sheenBatch.add(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), p.x, .22, p.z, .6 + random(), 1, 3 + random() * 6, i % 3 ? 0xffb02e : 0x4fc3ff);
  }
  const wetPatches = puddles.mesh(standard({ color: 0x789baa, metalness: .35, roughness: .1, transparent: true, opacity: .5, depthWrite: false }), scene);
  wetPatches.name = 'Wet pavement patches';
  const wetSheen = sheenBatch.mesh(basic({ transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false }), scene); wetSheen.name = 'Wet street light sheen';
  const eventGroup = new THREE.Group(); eventGroup.name = 'Event POI stage and crowd'; scene.add(eventGroup);
  const eventPOI = engine.scenarios.event.extra?.find(p => p.cat === 'event');
  const eventPosition = eventPOI ? ll(eventPOI.lat, eventPOI.lon) : station.clone();
  eventGroup.position.copy(eventPosition);
  const eventBatch = new Batch(), eventGlow = new Batch();
  eventBatch.cube(0, .8, 0, 18, 1.6, 10, 0xb48b67);
  for (const x of [-9, 9]) eventBatch.cube(x, 5, 0, .35, 8, .35, 0xb7b59c);
  for (let i = 0; i < 13; i++) eventGlow.add(new THREE.SphereGeometry(.8, 6, 5), -9 + i * 1.5, 9 - Math.sin(i / 12 * Math.PI) * 2, 0, 1, 1.4, 1, i % 2 ? 0xffb02e : 0xff5fa2);
  eventBatch.mesh(standard(), eventGroup); eventGlow.mesh(basic({ toneMapped: false }), eventGroup);
  const eventCrowd = new Batch();
  for (let i = 0; i < 54; i++) {
    const x = (i % 9 - 4) * 2.4, z = 9 + Math.floor(i / 9) * 2.4;
    const y = terrainHeight(eventPosition.x + x, eventPosition.z + z) - eventPosition.y;
    eventCrowd.add(new THREE.CapsuleGeometry(.42, 1.8, 3, 6), x, y + 1.35, z, 1, 1, 1, Object.values(palette)[i % 3]);
  }
  eventCrowd.mesh(basic({ toneMapped: false }), eventGroup);
  const eventRing = new THREE.Mesh(new THREE.RingGeometry(14, 17, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5fa2, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  eventRing.position.y = Math.max(12, city.nearbyRoofHeight(eventPosition.x, eventPosition.z, 18) - eventPosition.y + 8);
  eventRing.name = 'Floating event halo'; eventGroup.add(eventRing);
  const eventLight = new THREE.PointLight(0xff5fa2, 500, 70, 2); eventLight.position.y = 14; eventGroup.add(eventLight);
  function makeLabel(className, text, position, priority = 0) {
    const el = document.createElement('div'); el.className = `map-label ${className}`;
    if (typeof text === 'string') el.textContent = text; else el.append(...text);
    $('labels').append(el); return { el, position, priority };
  }
  const stSmall = document.createElement('small'); stSmall.textContent = 'THE HEART OF THE NEIGHBORHOOD';
  const stTitle = document.createElement('strong'); stTitle.textContent = stationName;
  const stEn = document.createElement('span'); stEn.textContent = `${areaEn} STATION`;
  const fixedLabels = [makeLabel('station-label', [stSmall, stTitle, stEn], station.clone().add(new THREE.Vector3(0, 22, 0)), 10)];
  const siteLabel = makeLabel('site-label', '', site.clone().add(new THREE.Vector3(0, 13, 0)), 11); fixedLabels.push(siteLabel);
  const eventLabel = makeLabel('event-label', eventPOI?.name || 'Station-front event', eventPosition.clone().add(new THREE.Vector3(0, eventRing.position.y + 8, 0)), 8); fixedLabels.push(eventLabel);
  fixedLabels.push(makeLabel('district-label', area === 'koenji' ? 'Koenji Kita / 高円寺北' : 'Asagaya Kita / 阿佐谷北', new THREE.Vector3(30, terrainHeight(30, -270) + 10, -270), 1));
  fixedLabels.push(makeLabel('district-label', area === 'koenji' ? 'PAL / 高円寺パル商店街' : 'Pearl Center / パールセンター', new THREE.Vector3(65, terrainHeight(65, 220) + 8, 220), 1));

  function prepareTracks(data) {
    return data.tracks.map((track, index) => {
      let last = -Infinity;
      const frames = track.f.map(f => { last = Math.max(last, f[0]); const p = ll(f[1], f[2]); return { t: last, p, state: f[3] }; });
      // The source can include backwards timestamps after a detour and several frames
      // in one minute. Preserve route order, then spread simultaneous frames smoothly.
      for (let i = 0; i < frames.length;) {
        let end = i + 1; while (end < frames.length && frames[end].t === frames[i].t) end++;
        const duration = end < frames.length ? Math.min(.9, frames[end].t - frames[i].t) : .01;
        const time = frames[i].t;
        for (let j = i; j < end; j++) frames[j].t = time + (j - i) / (end - i) * duration;
        i = end;
      }
      const type = track.name.startsWith('住民') ? 'resident' : track.name.startsWith('来訪者') ? 'visitor' : 'commuter';
      const firstMoving = frames.find(f => f.state === '移動');
      const inbound = type !== 'resident' && firstMoving && firstMoving.p.distanceTo(station) < 90;
      const arrival = inbound ? Math.round(firstMoving.t / 6) * 6 : null;
      const shift = inbound ? arrival - firstMoving.t + .45 + (index % 6) * .045 : 0;
      for (const f of frames) f.t += shift;
      return { frames, type, index, arrival, first: firstMoving, color: new THREE.Color(palette[type]), offset: new THREE.Vector3(Math.sin(index * 7) * .9, 0, Math.cos(index * 5) * .9) };
    });
  }
  function updateBadges() {
    for (const b of badges) b.el.remove(); badges = [];
    const candidates = [];
    for (const item of activeData.summary.poi_visits || []) {
      const count = item.visits;
      const matches = [...engine.pois, ...(activeData.extra || [])].filter(p => p.id === item.id && ['cafe', 'food', 'shop', 'grocery', 'bar'].includes(p.cat));
      matches.sort((a, b) => ll(a.lat, a.lon).length() - ll(b.lat, b.lon).length());
      if (matches.length) candidates.push({ p: matches[0], count });
    }
    for (const { p, count } of candidates.slice(0, 4)) {
      const position = ll(p.lat, p.lon); position.y = city.roofHeight(position.x, position.z) + 12;
      const name = document.createElement('span'); name.textContent = p.name;
      const number = document.createElement('b'); number.textContent = Math.round(count);
      badges.push(makeLabel('shop-label', [name, number], position, 5));
    }
  }
  function updateScenario() {
    activeData = state.scenario === 'baseline' ? engine.alternatives[state.alt] : engine.scenario_alternatives[`${state.scenario}:${state.alt}`];
    tracks = prepareTracks(activeData);
    if (heat) disposeGroup(heat.group); heat = buildHeat(scene, activeData);
    const wet = state.scenario === 'rain';
    rain.visible = wetPatches.visible = wetSheen.visible = wet; eventGroup.visible = state.scenario === 'event';
    city.terrainMat.color.set(wet ? 0x14252e : 0x263d40);
    city.terrainMat.roughness = wet ? .18 : .92;
    city.terrainMat.metalness = wet ? .25 : .08;
    city.roadMat.color.set(wet ? 0x73879b : 0xffffff);
    city.roadMat.roughness = wet ? .12 : .82; city.roadMat.metalness = wet ? .3 : .08;
    document.querySelectorAll('[data-scenario]').forEach(b => { b.classList.toggle('active', b.dataset.scenario === state.scenario); b.setAttribute('aria-pressed', b.dataset.scenario === state.scenario); });
    $('sample-note').textContent = `${tracks.length} recorded paths · ${activeData.summary.agents.toLocaleString()} model agents`;
    updateBadges();
  }
  function updateAlternative() {
    updateScenario();
    disposeGroup(alternative); alternative = buildAlternative(scene, state.alt, site);
    renderer.shadowMap.needsUpdate = true;
    const summary = activeData.summary;
    $('site-visits').textContent = Math.round(summary.site_visits).toLocaleString();
    $('foot-traffic').textContent = Math.round(summary.site_foot_traffic).toLocaleString();
    $('shop-visits').textContent = Math.round(summary.nearby_shop_visits).toLocaleString();
    $('bike-walk').replaceChildren(document.createTextNode(Math.round(summary.bike_extra_walk_min_total).toLocaleString()));
    const unit = document.createElement('em'); unit.textContent = ' min'; $('bike-walk').append(unit);
    const econ = engine.toy_econ_by_scenario?.[state.scenario] || engine.toy_econ;
    const toy = econ?.alts[state.alt];
    const salesText = value => value == null ? 'Income + nearby change unavailable' : `区画収入＋周辺売上差分（仮定） / Site income + nearby sales change ¥${Math.round(value).toLocaleString()}/day`;
    $('dwell-min').textContent = toy ? Number(toy.dwell_min).toFixed(1) : '—';
    $('toy-sales').textContent = salesText(toy?.toy_total_yen);
    $('econ-formula').textContent = toy ? `Site sales ¥${toy.site_sales_yen.toLocaleString()} + bike fees ¥${toy.bike_fee_yen.toLocaleString()} + nearby change ¥${toy.nearby_delta_yen.toLocaleString()}. Formula: ${econ.assumptions.formula}` : '';
    const siteTitle = document.createElement('strong');
    siteTitle.textContent = `STATION CORNER · ${{ bike: 'Bike parking', cafe: 'Corner café', plaza: 'Pocket plaza' }[state.alt]}`;
    const siteNumbers = document.createElement('span');
    siteNumbers.textContent = `${$('foot-traffic').textContent} passages/day · ${summary.site_unique_people} people/day · ${$('dwell-min').textContent} min dwell`;
    const siteSales = document.createElement('span');
    siteSales.textContent = toy ? `Income + nearby change ¥${Math.round(toy.toy_total_yen).toLocaleString()}/day (assumed)` : 'Income + nearby change unavailable';
    siteLabel.el.replaceChildren(siteTitle, siteNumbers, siteSales);
    $('compare-bar').hidden = !compare;
    $('compare-bar').replaceChildren();
    if (compare) for (const key of altKeys) {
      const metrics = econ?.alts[key], card = document.createElement('button');
      card.className = 'compare-card'; card.classList.toggle('active', key === state.alt);
      card.dataset.compareAlt = key; card.setAttribute('aria-pressed', key === state.alt);
      const title = document.createElement('strong'); title.textContent = { bike: 'Bike parking', cafe: 'Corner café', plaza: 'Pocket plaza' }[key];
      const numbers = document.createElement('span');
      numbers.textContent = metrics ? `${Math.round(metrics.foot_traffic).toLocaleString()} passages · ${Number(metrics.dwell_min).toFixed(1)} min avg dwell` : 'Metrics unavailable';
      const sales = document.createElement('b'); sales.textContent = salesText(metrics?.toy_total_yen);
      card.append(title, numbers, sales); card.onclick = () => { state.alt = key; updateAlternative(); };
      $('compare-bar').append(card);
    }
    $('alt-tag').textContent = state.alt.toUpperCase();
    document.querySelectorAll('[data-alt]').forEach(b => { b.classList.toggle('active', b.dataset.alt === state.alt); b.setAttribute('aria-pressed', b.dataset.alt === state.alt); });
  }
  updateAlternative();

  let azimuth = 2.75, elevation = .76, distance = innerWidth < 761 ? 510 : 525;
  const target = new THREE.Vector3(0, terrainHeight(0, -8), -8);
  let dragging = false, pointerId = null, previousX = 0, previousY = 0, lastInteraction = -100;
  const pointers = new Map(); let pinchDistance = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId);
    dragging = true; pointerId = event.pointerId; previousX = event.clientX; previousY = event.clientY; lastInteraction = performance.now();
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], next = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0) distance = clamp(distance * pinchDistance / Math.max(1, next), 135, 1100);
      pinchDistance = next;
    } else if (pointerId === event.pointerId) {
      azimuth -= (event.clientX - previousX) * .005;
      elevation = clamp(elevation + (event.clientY - previousY) * .004, .25, 1.35);
    }
    previousX = event.clientX; previousY = event.clientY; lastInteraction = performance.now();
  });
  function pointerUp(event) { pointers.delete(event.pointerId); if (!pointers.size) { dragging = false; pointerId = null; } else { const [id, p] = [...pointers.entries()][0]; pointerId = id; previousX = p.x; previousY = p.y; } lastInteraction = performance.now(); }
  canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', event => { event.preventDefault(); distance = clamp(distance * Math.exp(event.deltaY * .001), 135, 1100); lastInteraction = performance.now(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
    // Keep fill rate bounded for software WebGL and high-density displays.
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1650000 / (w * h))));
    glowMaterial.uniforms.viewportHeight.value = h;
    glowMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio?.() || 1;
    camera.setViewOffset(w, h, w > 760 && state.ui && !cameraMode && !compare ? -w * .105 : 0, 0, w, h); camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  $('reset').onclick = () => { azimuth = 2.75; elevation = .76; distance = innerWidth < 761 ? 510 : 525; target.set(0, terrainHeight(0, -8), -8); };
  function setOrbit(on) { state.orbit = on; $('orbit').classList.toggle('active', on); $('orbit').setAttribute('aria-pressed', on); }
  $('orbit').onclick = () => setOrbit(!state.orbit); setOrbit(state.orbit);
  function setPlaying(on) { state.playing = on; $('play').textContent = on ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', on ? 'Pause simulation' : 'Play simulation'); document.querySelector('.live').lastChild.textContent = on ? ' SIMULATION LIVE' : ' SIMULATION PAUSED'; }
  $('play').onclick = () => setPlaying(!state.playing);
  const speeds = [1, 3, 10, 30];
  $('speed').onclick = () => { state.speed = speeds.find(s => s > state.speed) || 1; $('speed').textContent = `${state.speed}×`; };
  $('speed').textContent = `${state.speed}×`;
  $('time').oninput = event => { state.t = Number(event.target.value); };
  document.querySelectorAll('[data-scenario]').forEach(button => button.onclick = () => { state.scenario = button.dataset.scenario; updateAlternative(); });
  document.querySelectorAll('[data-alt]').forEach(button => button.onclick = () => { state.alt = button.dataset.alt; updateAlternative(); });
  window.__set = patch => {
    if (!patch || typeof patch !== 'object') return { ...state };
    let experimentChanged = false;
    if (scenarioKeys.includes(patch.scenario) && state.scenario !== patch.scenario) { state.scenario = patch.scenario; experimentChanged = true; }
    if (altKeys.includes(patch.alt) && state.alt !== patch.alt) { state.alt = patch.alt; experimentChanged = true; }
    if (patch.scenario === 'newcafe') { state.scenario = 'baseline'; state.alt = 'cafe'; experimentChanged = true; }
    if (experimentChanged) updateAlternative();
    if (patch.t != null && Number.isFinite(Number(patch.t))) state.t = clamp(Number(patch.t), 360, 1439.99);
    if (patch.speed != null && Number.isFinite(Number(patch.speed))) state.speed = clamp(Number(patch.speed), 0, 120);
    if (patch.orbit != null) setOrbit(Boolean(patch.orbit));
    if (patch.playing != null) setPlaying(Boolean(patch.playing));
    if (patch.ui != null) { state.ui = Boolean(patch.ui) && !hideUI; document.body.classList.toggle('ui-hidden', !state.ui); }
    $('speed').textContent = `${state.speed}×`;
    resize(); lastHUD = -Infinity;
    renderFrame(0, performance.now()); return { ...state };
  };

  let visiblePeople = 0;
  const projected = new THREE.Vector3();
  function updateLabels() {
    const used = [];
    const labels = [...fixedLabels, ...badges].sort((a, b) => b.priority - a.priority);
    for (const label of labels) {
      if (label === eventLabel && state.scenario !== 'event') { label.el.style.display = 'none'; continue; }
      projected.copy(label.position).project(camera);
      const x = (projected.x * .5 + .5) * innerWidth, y = (-projected.y * .5 + .5) * innerHeight;
      let visible = projected.z > -1 && projected.z < 1 && x > 20 && x < innerWidth - 20 && y > (state.ui ? 85 : 20) && y < innerHeight - (state.ui ? 135 : 45);
      if (state.ui && !compare && innerWidth > 760 && x < (innerWidth < 1000 ? 302 : 342) && y > 120) visible = false;
      if (state.ui && label.priority <= 5 && x > innerWidth - 300 && y < 230) visible = false;
      const width = label.el.offsetWidth || 100, height = label.el.offsetHeight || 25;
      const rect = { x: x - width / 2 - 5, y: y - height - 7, w: width + 10, h: height + 14 };
      if (visible && used.some(r => r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y)) visible = false;
      label.el.style.display = visible ? '' : 'none';
      if (visible) { label.el.style.left = `${x}px`; label.el.style.top = `${y}px`; used.push(rect); }
    }
  }
  const figureFoot = new THREE.Vector3(), figureHead = new THREE.Vector3();
  function readableScale(base) {
    // Project a standing body, including the foreshortening from a high camera.
    // Eight CSS pixels is a floor on the capsule itself, not just its glow.
    figureFoot.copy(dummy.position).project(camera);
    figureHead.copy(dummy.position); figureHead.y += 3 * base; figureHead.project(camera);
    const pixels = Math.hypot((figureHead.x - figureFoot.x) * innerWidth, (figureHead.y - figureFoot.y) * innerHeight) * .5;
    return base * Math.max(1, 8.4 / Math.max(.01, pixels));
  }
  function updatePeople() {
    let count = 0;
    for (const track of tracks) {
      const f = track.frames, t = state.t;
      if (t < f[0].t || t > f[f.length - 1].t) continue;
      // Upper bound selects the last state at a timestamp.
      let low = 0, high = f.length;
      while (low < high) { const mid = (low + high) >>> 1; if (f[mid].t <= t) low = mid + 1; else high = mid; }
      const i = Math.max(0, low - 1), a = f[i], b = f[Math.min(i + 1, f.length - 1)];
      if (a.state === '在宅' || a.state === '外出中' || a.state === '乗車' || a.state === '降車' || a.state.includes('通勤先') || a.state.includes('勤務')) continue;
      const walking = a.state === '移動' || a.state === '自転車' || a.state.startsWith('寄り道');
      const u = b.t > a.t && walking ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      dummy.position.copy(a.p).lerp(b.p, u).add(track.offset);
      dummy.position.y = terrainHeight(dummy.position.x, dummy.position.z);
      // Recorded arrivals leave the doors and converge on the station exit.
      if (track.arrival !== null && t >= track.arrival && t < track.arrival + .9) {
        const v = clamp((t - track.arrival) / .9, 0, 1), doorX = platform.x - 65 + (track.index % 9) * 18.8;
        dummy.position.set(THREE.MathUtils.lerp(doorX, a.p.x, v), 0, THREE.MathUtils.lerp(railZ(doorX) - 3, a.p.z, v));
        dummy.position.y = terrainHeight(dummy.position.x, dummy.position.z) + (1 - v) * 5.6;
      }
      if (Math.max(Math.abs(dummy.position.x), Math.abs(dummy.position.z)) > 490) continue;
      dummy.position.y += walking ? Math.abs(Math.sin(t * 16 + track.index)) * .22 : .05;
      dummy.rotation.set(0, Math.atan2(b.p.x - a.p.x, b.p.z - a.p.z), 0);
      const scale = readableScale(agentScale);
      dummy.scale.setScalar(scale); dummy.updateMatrix(); agents.setMatrixAt(count, dummy.matrix); agents.setColorAt(count, track.color);
      glowPositions.set([dummy.position.x, dummy.position.y + 1.5 * scale, dummy.position.z], count * 3);
      glowSizes[count] = 5.8 * scale;
      track.color.toArray(glowColors, count * 3);
      const py = dummy.position.y; dummy.position.y = terrainHeight(dummy.position.x, dummy.position.z) + .24; dummy.scale.setScalar(agentScale * (walking ? 1 : .8)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); tokens.setMatrixAt(count, dummy.matrix); tokens.setColorAt(count, track.color); dummy.position.y = py;
      count++;
    }
    agents.count = tokens.count = count; agents.instanceMatrix.needsUpdate = tokens.instanceMatrix.needsUpdate = true;
    if (agents.instanceColor) agents.instanceColor.needsUpdate = true;
    if (tokens.instanceColor) tokens.instanceColor.needsUpdate = true;
    visiblePeople = count;
  }
  // Sampling the route also supplies trail history after sparse recorder jumps.
  function passengerPosition(s, age, out) {
    const u = clamp((age - s.delay) / s.lifetime, 0, 1);
    let deck = 5.85;
    if (u < .1) out.copy(s.doorPoint).lerp(s.edge, smooth(0, .1, u));
    else if (u < .3) out.copy(s.edge).lerp(s.gate, smooth(.1, .3, u));
    else if (u < .44) { out.copy(s.gate).lerp(s.exit, smooth(.3, .44, u)); deck *= 1 - smooth(.3, .44, u); }
    else { out.copy(s.exit).lerp(s.street, smooth(.44, 1, u)); deck = 0; }
    out.y = terrainHeight(out.x, out.z) + deck + Math.abs(Math.sin(age * 9 + s.door)) * .12;
    return out;
  }
  const trailStart = new THREE.Vector3(), trailEnd = new THREE.Vector3();
  let trainPhase = '', arrivalCount = 0;
  function updateTrain(elapsed) {
    // Six-minute service. Stop for 1.8 simulated minutes; decelerate in quadratically.
    const arrival = Math.floor((state.t + 2.4) / 6) * 6;
    let dt = state.t - arrival;
    const cinematic = timelapse || cameraMode === 'intro', period = timelapse ? 3 : 8, approach = timelapse ? .65 : 1.2;
    if (cinematic) {
      const phase = elapsed % period;
      dt = phase < approach ? -2.4 * (1 - phase / approach) : (phase - approach) * (timelapse ? 1.1 : .4);
    }
    let x;
    if (dt < 0) x = platform.x - 690 * Math.pow(-dt / 2.4, 2);
    else if (dt < 1.8) x = platform.x;
    else x = platform.x + 850 * Math.pow((dt - 1.8) / 1.8, 2);
    train.position.set(x, terrainHeight(x, railZ(x)), railZ(x));
    train.rotation.z = Math.atan2(terrainHeight(x + 10, railZ(x + 10)) - terrainHeight(x - 10, railZ(x - 10)), 20);
    train.rotation.y = -Math.atan2(railZ(x + 5) - railZ(x - 5), 10);
    train.visible = Math.abs(x) < 900;
    trainPhase = dt < 0 ? 'approaching' : dt < 1.8 ? 'stopped' : 'departing';
    arrivalCount = tracks.filter(track => track.arrival === arrival).length;
    let burstCount = 0, trailCount = 0;
    const stopped = dt >= 0 && dt < 1.8;
    // Derive up to four overlapping cohorts directly from real elapsed time.
    // This also works when a recorder jumps RAF timestamps instead of stepping.
    const latest = Math.floor((elapsed - approach) / period);
    const serviceSpeed = state.speed > 0 ? state.speed : 1;
    const serviceAge = (state.t - Math.floor(state.t / 6) * 6) / serviceSpeed;
    const ages = cinematic ? [0, 1, 2, 3].filter(n => latest - n >= 0).map(n => elapsed - ((latest - n) * period + approach))
      : [0, 1, 2, 3].map(n => serviceAge + n * 6 / serviceSpeed);
    for (const age of ages) {
      if (age < 0 || age >= burstLifetime) continue;
      for (const s of burstSeeds) {
        if (age < s.delay || age >= s.delay + s.lifetime) continue;
        passengerPosition(s, age, dummy.position);
        const scale = readableScale(s.scale * agentScale);
        glowPositions.set([dummy.position.x, dummy.position.y + 1.5 * scale, dummy.position.z], (visiblePeople + burstCount) * 3);
        glowSizes[visiblePeople + burstCount] = 5.8 * scale;
        s.color.toArray(glowColors, (visiblePeople + burstCount) * 3);
        dummy.scale.setScalar(scale); dummy.rotation.set(0, -trackAngle, 0); dummy.updateMatrix();
        burst.setMatrixAt(burstCount, dummy.matrix); burst.setColorAt(burstCount++, s.color);
        let trailLength = 0;
        for (let j = 0; j < trailSegments && trailLength < 6; j++) {
          passengerPosition(s, Math.max(s.delay, age - j * .09), trailStart);
          passengerPosition(s, Math.max(s.delay, age - (j + 1) * .09), trailEnd);
          trailStart.y += .8; trailEnd.y += .8;
          const length = trailStart.distanceTo(trailEnd), remaining = 6 - trailLength;
          if (length > remaining) trailEnd.lerp(trailStart, 1 - remaining / length);
          trailLength += Math.min(length, remaining);
          trailPositions.set([...trailStart.toArray(), ...trailEnd.toArray()], trailCount * 6);
          s.color.clone().multiplyScalar((1 - j / trailSegments) * .8).toArray(trailColors, trailCount * 6);
          s.color.clone().multiplyScalar((1 - (j + 1) / trailSegments) * .8).toArray(trailColors, trailCount * 6 + 3);
          trailCount++;
        }
      }
    }
    burst.count = burstCount; burst.instanceMatrix.needsUpdate = true;
    if (burst.instanceColor) burst.instanceColor.needsUpdate = true;
    glowGeometry.setDrawRange(0, visiblePeople + burstCount);
    glowGeometry.attributes.position.needsUpdate = true;
    glowGeometry.attributes.color.needsUpdate = true;
    glowGeometry.attributes.size.needsUpdate = true;
    trailGeometry.setDrawRange(0, trailCount * 2);
    trailGeometry.attributes.position.needsUpdate = trailGeometry.attributes.color.needsUpdate = true;
    sparks.visible = stopped;
    if (stopped) {
      for (let i = 0; i < sparkSeeds.length; i++) {
        const s = sparkSeeds[i], age = (dt + s.phase * .6) % 1.8;
        sparkPositions[i * 3] = station.x + s.x + s.drift * age;
        sparkPositions[i * 3 + 1] = terrainHeight(station.x + s.x, railZ(station.x + s.x)) + 6 + age * 6;
        sparkPositions[i * 3 + 2] = railZ(s.x + station.x) - 3 - age * (6 + s.z * 3);
      }
      sparkGeometry.attributes.position.needsUpdate = true; sparks.material.opacity = .7 * (1 - dt / 2);
    }
  }
  function smooth(a, b, t) { const v = clamp((t - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); }
  const dayColor = new THREE.Color(0x8bacae), dayHorizon = new THREE.Color(0xb8c9b8);
  const sunsetTop = new THREE.Color(0x563c62), sunsetHorizon = new THREE.Color(0xf08b45);
  const twilightTop = new THREE.Color(0x161426), twilightHorizon = new THREE.Color(0xb34d24);
  const nightColor = new THREE.Color(0x01030a), nightHorizon = new THREE.Color(0x030610);
  let shadowTime = -Infinity;
  function updateLighting() {
    const t = state.t, daylight = smooth(350, 440, t) * (1 - smooth(1020, 1230, t));
    const night = smooth(1110, 1230, t), wet = state.scenario === 'rain';
    sky.intensity = .19 + daylight * 1.78; sun.intensity = .025 + daylight * 2.1;
    sun.color.set(daylight > .85 ? 0xffead0 : 0xffb276);
    sun.position.set(-180, 100 + daylight * 220, -120);
    if (Math.abs(t - shadowTime) > 12) { renderer.shadowMap.needsUpdate = true; shadowTime = t; }
    const top = skyMaterial.uniforms.zenith.value, horizon = skyMaterial.uniforms.horizon.value;
    if (t < 1050) {
      top.copy(nightColor).lerp(dayColor, smooth(350, 440, t)).lerp(sunsetTop, smooth(1000, 1050, t));
      horizon.copy(nightHorizon).lerp(dayHorizon, smooth(350, 440, t)).lerp(sunsetHorizon, smooth(1000, 1050, t));
    } else if (t < 1140) {
      top.copy(sunsetTop).lerp(twilightTop, smooth(1050, 1140, t));
      horizon.copy(sunsetHorizon).lerp(twilightHorizon, smooth(1050, 1140, t));
    } else {
      top.copy(twilightTop).lerp(nightColor, smooth(1140, 1230, t));
      horizon.copy(twilightHorizon).lerp(nightHorizon, smooth(1140, 1230, t));
    }
    scene.background.copy(top);
    if (wet) { top.multiplyScalar(.8); horizon.multiplyScalar(.8); scene.background.copy(top); sky.intensity *= .85; sun.intensity *= .55; }
    scene.fog.color.copy(horizon); scene.fog.far = wet ? 1050 : 1450;
    city.buildingMat.color.setScalar(1 - night * .45);
    city.roofLines.material.opacity = .22 - night * .1;
    city.underside.material.color.set(0x10252e).lerp(nightColor, night);
    city.windowMat.opacity = .12 + night * .88; city.lampMat.opacity = .2 + night * .8;
    city.stationLight.intensity = 70 + night * 260;
    heat.mat.opacity = .19 + night * .71;
    renderer.toneMappingExposure = 1.05 - night * .1;
    const phase = t < 480 ? 'EARLY MORNING' : t < 1000 ? 'DAYTIME' : t < 1150 ? 'GOLDEN HOUR' : 'AFTER DARK';
    $('day-phase').textContent = phase;
    $('weather-icon').textContent = wet ? '☂' : state.scenario === 'event' ? '✧' : night > .8 ? '☾' : '◒';
    $('weather-text').textContent = wet ? 'Rain falling · wet streets, quieter corners' : state.scenario === 'event' ? 'A neighborhood event brings people together' : state.scenario === 'newcafe' ? 'A new café changes the daily rhythm' : night > .8 ? 'Window lights & late-night detours' : t < 1000 ? 'Another day in the neighborhood' : 'Golden hour in the neighborhood';
  }
  const cameraFocus = new THREE.Vector3();
  // Try every side of the parcel. Reject sightlines that cross a roof, rather
  // than just lifting a camera which is embedded in the nearest building.
  function blockedSiteRay(from, to, b) {
    let enter = 0, exit = 1;
    for (const [axis, low, high] of [['x', b.minX - 1, b.maxX + 1], ['z', b.minZ - 1, b.maxZ + 1]]) {
      const d = to[axis] - from[axis];
      if (Math.abs(d) < .00001) { if (from[axis] < low || from[axis] > high) return false; }
      else {
        const a = (low - from[axis]) / d, c = (high - from[axis]) / d;
        enter = Math.max(enter, Math.min(a, c)); exit = Math.min(exit, Math.max(a, c));
        if (exit < enter) return false;
      }
    }
    return exit > .01 && enter < .99 && THREE.MathUtils.lerp(from.y, to.y, Math.min(.99, exit)) < b.top + 2;
  }
  const siteFocus = site.clone().add(new THREE.Vector3(0, 2, 0));
  let siteCamera;
  if (cameraMode === 'site') {
    const targets = [[0, 0], [-12, -10], [12, -10], [-12, 10], [12, 10]].map(([x, z]) => site.clone().add(new THREE.Vector3(x, 2, z)));
    const candidates = [];
    for (let i = 0; i < 48; i++) for (const radius of [90, 100, 110]) {
      const angle = i * Math.PI / 24, horizontal = radius * Math.cos(THREE.MathUtils.degToRad(40));
      const p = siteFocus.clone().add(new THREE.Vector3(Math.sin(angle) * horizontal, 0, Math.cos(angle) * horizontal));
      p.y = Math.max(siteFocus.y + horizontal * Math.tan(THREE.MathUtils.degToRad(40)), city.nearbyRoofHeight(p.x, p.z) + 40);
      const blocked = targets.filter(t => city.buildingBounds.some(b => blockedSiteRay(p, t, b))).length;
      const pitch = THREE.MathUtils.radToDeg(Math.atan2(p.y - siteFocus.y, horizontal));
      candidates.push({ position: p, score: blocked * 1000 + Math.abs(pitch - 40) * 4 + Math.abs(p.distanceTo(siteFocus) - 100) + Math.abs(angle - 2.6) * .1 });
    }
    candidates.sort((a, b) => a.score - b.score);
    // Footprint bounds omit trees and other street details. Check the actual
    // city triangles too so regenerated street activity cannot obscure the parcel.
    city.root.updateMatrixWorld(true);
    const meshes = city.root.children.filter(o => o.isMesh), ray = new THREE.Raycaster();
    const visible = candidates.find(candidate => targets.every(target => {
      const direction = target.clone().sub(candidate.position);
      ray.set(candidate.position, direction.clone().normalize()); ray.far = direction.length() - .4;
      return ray.intersectObjects(meshes, false).length === 0;
    }));
    siteCamera = (visible || candidates[0]).position;
  }
  function directCamera(seconds) {
    let focus = platform.clone(), radius, angle, height;
    if (cameraMode === 'site') {
      camera.position.copy(siteCamera);
      camera.position.y = Math.max(camera.position.y, city.nearbyRoofHeight(camera.position.x, camera.position.z) + 40);
      cameraFocus.copy(siteFocus); camera.lookAt(cameraFocus);
      // Keep a 28° horizontal field in portrait and a close 28° vertical field
      // in landscape, making all three forms large without cropping the parcel.
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(28) / 2) / Math.min(1, camera.aspect)));
      camera.updateProjectionMatrix(); return;
    } else {
      const keys = [
        { t: 6, r: 0, a: 0, h: 0 },
        { t: 14, r: 350, a: 1.4, h: .7 }, { t: 22, r: 350, a: -.7, h: .6 },
        { t: 30, r: 700, a: -.6, h: .8 }
      ];
      const t = clamp(seconds, 6, 30), end = keys.findIndex(k => k.t > t);
      const b = end < 0 ? keys.at(-1) : keys[end], a = end < 0 ? b : keys[Math.max(0, end - 1)];
      const u = a === b ? 1 : smooth(a.t, b.t, t);
      radius = THREE.MathUtils.lerp(a.r, b.r, u); angle = THREE.MathUtils.lerp(a.a, b.a, u); height = THREE.MathUtils.lerp(a.h, b.h, u);
      if (t >= 14 && t <= 30 && badges.length) {
        const shops = new THREE.Vector3();
        for (const badge of badges) shops.add(badge.position);
        shops.multiplyScalar(1 / badges.length);
        focus.lerp(shops, .45 * Math.sin((t - 14) / 16 * Math.PI));
      }
      if (seconds < 14) {
        // Interpolate positions, not low polar elevation angles. Roof clearance
        // applies throughout the rise, including the former rooftop clip at 6s.
        const end = platform.clone().add(new THREE.Vector3(Math.sin(1.4) * Math.cos(.7) * 350, Math.sin(.7) * 350, Math.cos(1.4) * Math.cos(.7) * 350));
        camera.position.copy(opening.position).lerp(end, smooth(6, 14, seconds));
        camera.position.y = Math.max(camera.position.y, city.nearbyRoofHeight(camera.position.x, camera.position.z) + 45);
        cameraFocus.copy(focus); camera.lookAt(focus); camera.updateMatrixWorld();
        // Fit the stationary ten-car envelope with screen margins, including
        // perspective at the nearer end and portrait capture aspect ratios.
        let tangent = Math.tan(THREE.MathUtils.degToRad(41) / 2);
        for (const x of [-94, 94]) for (const z of [-2, 2]) for (const y of [5, 10.5]) {
          const corner = new THREE.Vector3(platform.x + x * Math.cos(trackAngle) - z * Math.sin(trackAngle), 0,
            platform.z + x * Math.sin(trackAngle) + z * Math.cos(trackAngle));
          corner.y = terrainHeight(corner.x, corner.z) + y;
          corner.applyMatrix4(camera.matrixWorldInverse);
          tangent = Math.max(tangent, Math.abs(corner.x) / (-corner.z * camera.aspect * .88), Math.abs(corner.y) / (-corner.z * .8));
        }
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent)); camera.updateProjectionMatrix(); return;
      }
    }
    camera.fov = 41; camera.updateProjectionMatrix();
    camera.position.set(focus.x + Math.sin(angle) * Math.cos(height) * radius,
      focus.y + Math.sin(height) * radius, focus.z + Math.cos(angle) * Math.cos(height) * radius);
    if (cameraMode === 'intro') camera.position.y = Math.max(camera.position.y, city.nearbyRoofHeight(camera.position.x, camera.position.z) + 45);
    else camera.position.y = Math.max(camera.position.y, terrainHeight(camera.position.x, camera.position.z) + 4);
    cameraFocus.copy(focus); camera.lookAt(focus);
  }
  function avoidBuildings() {
    const p = camera.position;
    for (const b of city.buildingBounds) {
      if (p.x >= b.minX - 5 && p.x <= b.maxX + 5 && p.z >= b.minZ - 5 && p.z <= b.maxZ + 5)
        p.y = Math.max(p.y, b.top + 10);
    }
  }
  let lastHUD = -1000;
  function renderFrame(delta, now) {
    const elapsed = Math.max(0, (now - readyAt) / 1000);
    if (timelapse) state.t = THREE.MathUtils.lerp(timelapse[0], timelapse[1], clamp(elapsed / 30, 0, 1));
    else if (state.playing) {
      state.t += delta * state.speed;
      if (state.t >= 1440) state.t = 360 + (state.t - 1440) % 1080;
    }
    if (state.orbit && !dragging && now - lastInteraction > 4500) azimuth += delta * .014;
    camera.position.set(target.x + Math.sin(azimuth) * Math.cos(elevation) * distance, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    if (cameraMode) directCamera(elapsed);
    else cameraFocus.copy(target);
    // Independent of director/orbit/drag mode, checked on every rendered frame.
    avoidBuildings(); camera.lookAt(cameraFocus);
    camera.updateMatrixWorld();
    skyDome.position.copy(camera.position);
    updatePeople(); updateTrain(elapsed); updateLighting();
    if (rain.visible) {
      const seconds = now / 1000;
      for (let i = 0; i < rainCount; i++) {
        const s = rainSeeds[i], span = Math.max(130, camera.position.y - cameraFocus.y + 65);
        const fall = ((s[1] * span - seconds * 26) % span + span) % span;
        const x = cameraFocus.x + s[0] + fall * .14, z = cameraFocus.z + s[2];
        const y = terrainHeight(x, z) + fall + 4;
        rainPos.set([x, y, z, x - 1.1, y - 7, z + .4], i * 6);
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (eventGroup.visible) {
      eventRing.material.opacity = .36 + Math.sin(elapsed * 3) * .12;
      eventLight.intensity = 450 + Math.sin(elapsed * 3) * 100;
    }
    renderer.render(scene, camera); updateLabels();
    if (now - lastHUD > 100) {
      const t = Math.floor(state.t); $('clock').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      $('time').value = state.t; $('active-count').textContent = visiblePeople;
      $('train-status').textContent = trainPhase === 'stopped' ? 'Doors open · welcome home' : trainPhase === 'approaching' ? 'Train approaching' : 'Next stop, another story';
      $('arrival-info').textContent = trainPhase === 'stopped' ? `${arrivalCount} recorded arrivals · decorative passenger burst` : trainPhase === 'approaching' ? '10 cars · doors opening shortly' : 'Chūō rapid · six-minute service';
      lastHUD = now;
    }
    window.__stats = { area, exag, agentScale, cameraMode, elapsed, time: state.t, scenario: state.scenario, alt: state.alt, dataKey: `${state.scenario}:${state.alt}`, trackCount: tracks.length, heatSegments: activeData.heat.length, train: trainPhase, recordedArrivals: arrivalCount, activeAgents: visiblePeople, decorativePassengers: burst.count, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  const readyAt = performance.now();
  let previous = readyAt;
  renderFrame(0, previous);
  window.__ready = true; $('loading').classList.add('done');
  function animate(now) {
    const delta = Math.min((now - previous) / 1000, .5); previous = now;
    renderFrame(delta, now); requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
