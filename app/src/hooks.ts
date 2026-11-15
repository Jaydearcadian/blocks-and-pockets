import { useEffect, useRef, useState } from 'react';
import { client, readSnapshot, retryRead, verifyRow } from './chain';
import { DEPLOY_BLOCK, IS_DEMO_VAULT, POLL_MS, VAULT } from './config';
import { verifyVault, type VaultCheck } from './vaultCheck';
import type { RecordRow, Snapshot, Verified } from './model';

export type ChainState = { snap?: Snapshot; error?: string; checkedAt?: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n')[0].slice(0, 160);
}

// Live view (atBlock undefined) polls the newest block. A checkpoint is read at its block until it loads.
// Each change of refreshKey reads again at once, and keeps the last good read on screen meanwhile.
export function useSnapshot(atBlock: bigint | undefined, refreshKey = 0): ChainState {
  const [state, setState] = useState<ChainState>({});
  const reload = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true;
    let busy = false;
    let queued = false;
    let loaded = false;
    setState({});

    const load = async (): Promise<void> => {
      if (busy) {
        queued = true;
        return;
      }
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
      if (queued && active) {
        queued = false;
        await load();
      }
    };

    reload.current = () => void load();
    void load();
    const timer = window.setInterval(
      () => {
        if (atBlock === undefined || !loaded) void load();
      },
      atBlock === undefined ? POLL_MS : 5_000,
    );
    return () => {
      active = false;
      reload.current = () => undefined;
      window.clearInterval(timer);
    };
  }, [atBlock]);

  useEffect(() => {
    if (refreshKey > 0) reload.current();
  }, [refreshKey]);

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

export type VaultStatus = { state: 'checking' } | { state: 'ok' } | { state: 'rejected'; reason: string };

// The demo vault is known good. Any other address is checked against the vault's code before anything else
// is read or offered, because a look-alike contract could answer owner() and the wallet actions with anything.
export function useVaultStatus(): VaultStatus {
  const [status, setStatus] = useState<VaultStatus>(IS_DEMO_VAULT ? { state: 'ok' } : { state: 'checking' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (IS_DEMO_VAULT) return;
    let active = true;
    let timer: number | undefined;
    void verifyVault(client, VAULT).then((check: VaultCheck) => {
      if (!active) return;
      if (check.ok) setStatus({ state: 'ok' });
      else if (check.reason.startsWith('Could not check')) {
        setStatus({ state: 'checking' });
        timer = window.setTimeout(() => setAttempt((n) => n + 1), 4_000);
      } else setStatus({ state: 'rejected', reason: check.reason });
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);
  return status;
}
