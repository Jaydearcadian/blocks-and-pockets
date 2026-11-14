import { useEffect, useState } from 'react';
import { readSnapshot, retryRead, verifyRow } from './chain';
import { DEPLOY_BLOCK, POLL_MS } from './config';
import type { RecordRow, Snapshot, Verified } from './model';

export type ChainState = { snap?: Snapshot; error?: string; checkedAt?: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n')[0].slice(0, 160);
}

// Live view (atBlock undefined) polls the newest block. A checkpoint is read at its block until it loads.
export function useSnapshot(atBlock: bigint | undefined): ChainState {
  const [state, setState] = useState<ChainState>({});

  useEffect(() => {
    let active = true;
    let busy = false;
    let loaded = false;
    setState({});

    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const snap = await retryRead(() => readSnapshot(atBlock, DEPLOY_BLOCK));
        loaded = true;
        if (active) setState({ snap, checkedAt: Date.now() });
      } catch (err) {
        if (active) setState((prev) => ({ ...prev, error: describe(err), checkedAt: Date.now() }));
      } finally {
        busy = false;
      }
    };

    void load();
    const timer = window.setInterval(
      () => {
        if (atBlock === undefined || !loaded) void load();
      },
      atBlock === undefined ? POLL_MS : 5_000,
    );
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [atBlock]);

  return state;
}

// Checks each record row against its receipt, three rows at a time.
export function useVerification(rows: RecordRow[]): Record<string, Verified> {
  const [out, setOut] = useState<Record<string, Verified>>({});

  useEffect(() => {
    let active = true;
    let next = 0;
    const worker = async () => {
      while (active && next < rows.length) {
        const row = rows[next++];
        const v = await verifyWithRetry(row);
        if (active) setOut((prev) => ({ ...prev, [row.tx]: v }));
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      active = false;
    };
  }, [rows]);

  return out;
}

// A row that comes back empty, or a refusal without a decoded reason, is read again before it is reported.
async function verifyWithRetry(row: RecordRow): Promise<Verified> {
  let v = await verifyRow(row);
  for (let attempt = 1; attempt <= 3 && needsRetry(row, v); attempt++) {
    await sleep(1_000 * attempt);
    v = await verifyRow(row);
  }
  return v;
}

function needsRetry(row: RecordRow, v: Verified): boolean {
  if (v.chainStatus === 'missing') return true;
  return row.result === 'refused' && !(v.reason && 'name' in v.reason);
}

export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
