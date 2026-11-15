import { describe, expect, it } from 'vitest';
import { logWindows } from './chain';

// The RPC refuses a log range longer than 10,000 blocks, so every window must stay inside that.
const RPC_LIMIT = 10_000n;

describe('log windows', () => {
  it('covers a long history in order, with no gaps or overlaps', () => {
    const from = 16_779_032n;
    const to = 16_790_849n;
    const windows = logWindows(from, to);
    expect(windows[0][0]).toBe(from);
    expect(windows[windows.length - 1][1]).toBe(to);
    windows.forEach(([start, end], i) => {
      expect(end - start).toBeLessThan(RPC_LIMIT);
      if (i > 0) expect(start).toBe(windows[i - 1][1] + 1n);
    });
  });

  it('keeps a short range in one window', () => {
    expect(logWindows(100n, 105n)).toEqual([[100n, 105n]]);
  });

  it('starts a new window right after a full one', () => {
    expect(logWindows(0n, 8_999n)).toEqual([[0n, 8_999n]]);
    expect(logWindows(0n, 9_000n)).toEqual([
      [0n, 8_999n],
      [9_000n, 9_000n],
    ]);
  });

  it('returns no windows when the range is empty', () => {
    expect(logWindows(200n, 100n)).toEqual([]);
  });
});
