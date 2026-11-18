// Seeded random numbers for Solmar Bay: one small generator (mulberry32) so a
// fixed seed always builds the same city, the same traffic and the same shots.
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] from `rng`. */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of `items`, picked with `rng`. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** Clamp `value` into [low, high]. */
export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Shortest signed turn from `from` to `to`, in radians, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
