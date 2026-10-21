// Pure clock/track rules, shared by the renderer and the offline checks.
export const TRAIN = Object.freeze({ interval: 10, offset: 3, dwell: 5.8, approach: 2.4 });
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function normalizeFrames(frames, position) {
  const sorted = frames.map((f, order) => ({ time: f[0], pos: position(f[1], f[2]), state: f[3], order }))
    .sort((a, b) => a.time - b.time || a.order - b.order);
  // The engine rounds waypoints to minutes and occasionally emits an earlier
  // timestamp after a detour. Sort stably, then spread ties inside that minute.
  for (let a = 0; a < sorted.length;) {
    let b = a + 1;
    while (b < sorted.length && sorted[b].time === sorted[a].time) b++;
    const base = sorted[a].time;
    for (let k = a; k < b; k++) sorted[k].time = base + (k - a) / (b - a) * .8;
    a = b;
  }
  return sorted;
}

export function frameAt(frames, time) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].time <= time) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function trainAtTime(time) {
  const bucket = Math.floor((time - TRAIN.offset) / TRAIN.interval) * TRAIN.interval + TRAIN.offset;
  const arrival = time - bucket >= TRAIN.interval - TRAIN.approach - 1e-8 ? bucket + TRAIN.interval : bucket;
  const age = time - arrival;
  const phase = age < 0 ? 'approaching' : age < TRAIN.dwell ? 'stopped' : 'departing';
  // Both endpoints are beyond the miniature before the next train is recycled.
  const center = age < 0 ? -20 - 160 * age * age : age < TRAIN.dwell ? -20 : -20 + 310 * (age - TRAIN.dwell) ** 2;
  return { arrival, age, phase, center, visible: Math.abs(center) < 790 };
}

export function openingTime(arrivals, speed) {
  const candidates = [];
  for (let arrival = 1053; arrival <= 1163; arrival += TRAIN.interval) {
    const group = arrivals.filter(a => a.time >= arrival && a.time < arrival + TRAIN.dwell - 1.1);
    const immediate = group.filter(a => a.time < arrival + 1);
    if (immediate.length) candidates.push({ arrival, score: group.length + immediate.length * .6 - Math.abs(arrival - 1100) * .004 });
  }
  const arrival = candidates.sort((a, b) => b.score - a.score)[0]?.arrival ?? 1113;
  return clamp(arrival - Math.min(TRAIN.approach, speed * 1.6), 360, 1439.999);
}
