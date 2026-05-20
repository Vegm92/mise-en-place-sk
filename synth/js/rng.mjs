/** Mulberry32 seeded PRNG — deterministic, matches Python random.Random API shape. */
export class SeededRng {
  constructor(seed) {
    this._s = (seed >>> 0) || 1;
  }

  _next() {
    this._s = (this._s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(this._s ^ (this._s >>> 15), 1 | this._s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  random() { return this._next(); }

  randint(a, b) { return a + Math.floor(this._next() * (b - a + 1)); }

  uniform(a, b) { return a + this._next() * (b - a); }

  choice(arr) { return arr[Math.floor(this._next() * arr.length)]; }

  sample(arr, k) {
    const copy = [...arr];
    const result = [];
    const n = Math.min(k, copy.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this._next() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
      result.push(copy[i]);
    }
    return result;
  }

  choices(arr, weights, k) {
    const total = weights.reduce((a, b) => a + b, 0);
    const result = [];
    for (let i = 0; i < k; i++) {
      let r = this._next() * total;
      for (let j = 0; j < arr.length; j++) {
        r -= weights[j];
        if (r <= 0) { result.push(arr[j]); break; }
        if (j === arr.length - 1) result.push(arr[j]);
      }
    }
    return result;
  }
}
