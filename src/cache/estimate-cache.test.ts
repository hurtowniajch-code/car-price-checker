import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EstimateCache } from './estimate-cache';

let file: string;
let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-')), 'estimates.json');
  clock = 1_000_000;
});
afterEach(() => {
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch {}
});

describe('EstimateCache', () => {
  it('gives back what it was given', () => {
    const c = new EstimateCache<number>(file, 1000, 100, now);
    c.set('golf', 42);
    expect(c.get('golf')).toBe(42);
    expect(c.get('polo')).toBeNull();
  });

  // A median of the Polish market does not move in a day; it does move in a month.
  it('forgets an answer once it is stale', () => {
    const c = new EstimateCache<number>(file, 1000, 100, now);
    c.set('golf', 42);
    clock += 1001;
    expect(c.get('golf')).toBeNull();
  });

  // The point of the file: a bulk run is several processes over several hours.
  it('survives a restart', () => {
    const first = new EstimateCache<number>(file, 10_000, 100, now);
    first.set('golf', 42);
    first.save();

    const second = new EstimateCache<number>(file, 10_000, 100, now);
    expect(second.get('golf')).toBe(42);
  });

  it('does not reload what has gone stale in the meantime', () => {
    const first = new EstimateCache<number>(file, 1000, 100, now);
    first.set('golf', 42);
    first.save();
    clock += 5000;
    expect(new EstimateCache<number>(file, 1000, 100, now).get('golf')).toBeNull();
  });

  it('stays bounded, dropping the oldest', () => {
    const c = new EstimateCache<number>(file, 10_000, 3, now);
    for (const k of ['a', 'b', 'c', 'd']) c.set(k, 1);
    expect(c.size).toBe(3);
    expect(c.get('a')).toBeNull();
    expect(c.get('d')).toBe(1);
  });

  it('treats a corrupt file as an empty one rather than crashing', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not json at all');
    const c = new EstimateCache<number>(file, 10_000, 100, now);
    expect(c.get('golf')).toBeNull();
    c.set('golf', 7);
    expect(c.get('golf')).toBe(7);
  });
});
