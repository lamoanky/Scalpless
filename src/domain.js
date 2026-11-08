export const INPUT_EVENTS = [
  "input:move",
  "input:pinchstart",
  "input:pinchend",
  "input:cutstart",
  "input:cutend",
  "input:zoom",
];
export class CutCoverage {
  constructor(size = 96) {
    this.size = size;
    this.bins = new Uint8Array(size);
    this.last = null;
  }
  get fraction() {
    return this.bins.reduce((sum, n) => sum + n, 0) / this.size;
  }
  get complete() {
    return this.fraction >= 0.9;
  }
  add(t, valid = true) {
    if (!valid || !Number.isFinite(t) || t < 0 || t > 1) {
      this.last = null;
      return false;
    }
    const bin = Math.min(this.size - 1, Math.floor(t * this.size)),
      before = this.fraction;
    this.bins[bin] = 1;
    if (this.last !== null && Math.abs(bin - this.last) <= 8) {
      for (let i = Math.min(bin, this.last); i <= Math.max(bin, this.last); i++)
        this.bins[i] = 1;
    }
    this.last = bin;
    return this.fraction !== before;
  }
  endStroke() {
    this.last = null;
  }
  reset() {
    this.bins.fill(0);
    this.last = null;
  }
  snapshot() {
    return Array.from(this.bins);
  }
  restore(bins) {
    this.bins.set(bins);
    this.last = null;
  }
}
export class OperationHistory {
  constructor(limit = 30) {
    this.limit = limit;
    this.entries = [];
  }
  push(snapshot) {
    this.entries.push(structuredClone(snapshot));
    if (this.entries.length > this.limit) this.entries.shift();
  }
  pop() {
    return this.entries.pop() ?? null;
  }
  clear() {
    this.entries.length = 0;
  }
  get size() {
    return this.entries.length;
  }
}
