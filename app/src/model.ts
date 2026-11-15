import { formatUnits } from 'viem';
import { KNOWN_NAMES, ZERO_ADDRESS } from './config';

export type Hex = `0x${string}`;
export type PaymentStatus = 0 | 1 | 2 | 3;
export type MandateState = 'none' | 'active' | 'revoked' | 'expired';

export type BlockView = {
  id: number;
  name: string;
  cross: boolean;
  cash: bigint;
  reserved: bigint;
  debtCap: bigint;
  principal: bigint;
  interest: bigint;
  operator: string;
  mandateActive: boolean;
  expiry: bigint;
  perTxCap: bigint;
  totalCap: bigint;
  committed: bigint;
  spent: bigint;
  allowed: string[];
};

export type PaymentView = {
  id: number;
  blockId: number;
  to: string;
  amount: bigint;
  evidence: string;
  status: PaymentStatus;
};

// Everything the dashboard shows for one block number (or the latest block).
export type Snapshot = {
  block: number;
  timestamp: number;
  owner: string;
  troveActive: boolean;
  coll: bigint;
  principal: bigint;
  interest: bigint;
  capacity: bigint;
  price: bigint;
  ratioBps: bigint;
  threshold: bigint;
  groupsClosed: number;
  totalCash: bigint;
  totalPrincipal: bigint;
  totalInterest: bigint;
  overheadPrincipal: bigint;
  overheadInterest: bigint;
  overheadCash: bigint;
  vaultMusd: bigint;
  ownerMusd: bigint;
  vendorMusd: bigint;
  ownerBtc: bigint;
  vaultBtc: bigint;
  blocks: BlockView[];
  payments: PaymentView[];
};

export type RecordRow = {
  phase: string;
  label: string;
  result: 'executed' | 'refused';
  tx: Hex;
  block: number;
};

export type Reason = { name: string; args: readonly unknown[] } | { raw: string };

export type Verified = {
  row: RecordRow;
  chainStatus: 'success' | 'reverted' | 'missing';
  chainBlock?: number;
  matches: boolean;
  reason?: Reason;
};

export type TieOut = { label: string; ok: boolean; detail: string };

export type Checkpoint = { id: string; label: string; block: number };

// Shape of app/src/demo-record.json, written by scripts/build_demo_record.py.
export type DemoRecord = {
  chainId: number;
  vault: Hex;
  deploy: { tx: Hex; block: number };
  sources: string[];
  phases: { id: string; title: string }[];
  rows: RecordRow[];
  checkpoints: Checkpoint[];
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  0: 'None',
  1: 'Pending',
  2: 'Executed',
  3: 'Cancelled',
};

// The eight checks a payment passes, in the order requestTransfer runs them.
export const PIPELINE: { title: string; rule: string }[] = [
  { title: 'Block exists', rule: 'The payment names a block the owner created.' },
  { title: 'Caller is the operator', rule: "Only the block's mandate holder can request a payment." },
  {
    title: 'Mandate active and in date',
    rule: 'The owner can revoke the mandate at any time. It also stops at its expiry date.',
  },
  { title: 'Payee on the allowlist', rule: 'Money moves only to addresses the owner approved for that block.' },
  { title: 'Within the per-payment cap', rule: 'Each payment has a ceiling set by the owner.' },
  { title: 'Within the lifetime cap', rule: 'Executed and waiting payments count toward one total limit.' },
  { title: 'Free cash in the pocket', rule: 'A block cannot spend cash that is already reserved.' },
  {
    title: 'Owner approval above the threshold',
    rule: 'Larger payments wait for the owner. Approval checks the mandate and payee again.',
  },
];

export const ZERO = ZERO_ADDRESS;

export function fmtAmount(x: bigint, digits = 2): string {
  const n = Number(formatUnits(x, 18));
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtBtc(x: bigint): string {
  return Number(formatUnits(x, 18)).toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function knownName(addr: string): string | undefined {
  return KNOWN_NAMES[addr.toLowerCase()];
}

// Percent of whole, clamped to 0..100. Returns 0 when whole is zero.
export function pctOf(part: bigint, whole: bigint): number {
  if (whole <= 0n || part <= 0n) return 0;
  const pct = Number((part * 10_000n) / whole) / 100;
  return Math.min(100, Math.max(0, pct));
}

export function fmtUtc(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function groupDebt(s: Snapshot): bigint {
  return s.principal + s.interest;
}

export function mandateState(b: BlockView, nowSeconds: number): MandateState {
  if (b.operator.toLowerCase() === ZERO) return 'none';
  if (!b.mandateActive) return 'revoked';
  if (BigInt(nowSeconds) > b.expiry) return 'expired';
  return 'active';
}

// Mirrors the contract: above the threshold a payment waits for the owner.
export function paymentPath(amount: bigint, threshold: bigint): 'auto' | 'owner' {
  return amount > threshold ? 'owner' : 'auto';
}

export function tieOuts(s: Snapshot): TieOut[] {
  const blockPrincipal = s.blocks.reduce((t, b) => t + b.principal, 0n);
  const blockInterest = s.blocks.reduce((t, b) => t + b.interest, 0n);
  return [
    {
      label: 'Mezo principal equals the vault ledger',
      ok: s.principal === s.totalPrincipal,
      detail: `${fmtAmount(s.principal, 6)} vs ${fmtAmount(s.totalPrincipal, 6)} MUSD`,
    },
    {
      label: 'Mezo interest is at least the settled interest',
      ok: s.interest >= s.totalInterest,
      detail: `${fmtAmount(s.interest, 6)} vs ${fmtAmount(s.totalInterest, 6)} MUSD`,
    },
    {
      label: 'Block and overhead principal add up to the ledger',
      ok: blockPrincipal + s.overheadPrincipal === s.totalPrincipal,
      detail: `${fmtAmount(blockPrincipal + s.overheadPrincipal, 6)} vs ${fmtAmount(s.totalPrincipal, 6)} MUSD`,
    },
    {
      label: 'Block and overhead interest add up to the ledger',
      ok: blockInterest + s.overheadInterest === s.totalInterest,
      detail: `${fmtAmount(blockInterest + s.overheadInterest, 6)} vs ${fmtAmount(s.totalInterest, 6)} MUSD`,
    },
    {
      label: 'Vault MUSD equals the cash the vault tracks',
      ok: s.vaultMusd === s.totalCash,
      detail: `${fmtAmount(s.vaultMusd, 6)} vs ${fmtAmount(s.totalCash, 6)} MUSD`,
    },
  ];
}

// Decodes a bytes32 label that holds ASCII, such as INV-001, and drops the zero padding.
export function decodeEvidence(hex: string): string {
  let out = '';
  for (let i = 2; i + 1 < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

// Plain-English reason for a vault revert, with the payment check it belongs to (1-8) when it has one.
export function refusalText(name: string, args: readonly unknown[] = []): { title: string; step?: number } {
  const big = (i: number): bigint => (typeof args[i] === 'bigint' ? (args[i] as bigint) : 0n);
  const text = (i: number): string => (typeof args[i] === 'string' ? (args[i] as string) : '');
  const amt = (x: bigint) => `${fmtAmount(x)} MUSD`;
  switch (name) {
    case 'NotOperator':
      return { title: `Caller is not the operator of block ${big(0)}`, step: 2 };
    case 'MandateRevoked':
      return { title: `The mandate for block ${big(0)} is revoked`, step: 3 };
    case 'MandateExpired':
      return { title: `The mandate for block ${big(0)} has expired`, step: 3 };
    case 'RecipientNotAllowed':
      return { title: `Payee ${shortAddr(text(1))} is not on block ${big(0)}'s allowlist`, step: 4 };
    case 'PerTransactionCapExceeded':
      return { title: `${amt(big(0))} is over the ${amt(big(1))} per-payment cap`, step: 5 };
    case 'MandateTotalCapExceeded':
      return { title: `Only ${amt(big(1))} is left on the mandate, ${amt(big(0))} requested`, step: 6 };
    case 'PocketInsufficient':
      return { title: `Block ${big(0)} has ${amt(big(1))} free, ${amt(big(2))} requested`, step: 7 };
    case 'BlockDebtCapExceeded':
      return { title: `Block ${big(0)} would owe ${amt(big(1))}, over its ${amt(big(2))} cap` };
    case 'GroupCapacityExceeded':
      return { title: `Group debt would reach ${amt(big(0))}, over the ${amt(big(1))} capacity` };
    case 'DebtNotCovered':
      return { title: `Block ${big(0)} holds ${amt(big(2))} free for a ${amt(big(1))} debt` };
    case 'CashReserved':
      return { title: `Block ${big(0)} still reserves ${amt(big(1))} for a pending payment` };
    case 'PaymentNotPending':
      return { title: `Payment ${big(0)} is not pending` };
    case 'NotOwner':
      return { title: 'Only the owner can do this' };
    case 'ZeroAmount':
      return { title: 'The amount must be more than zero' };
    case 'InvalidMandate':
      return { title: 'The mandate needs an operator and an expiry in the future' };
    case 'BlockNotFound':
      return { title: `Block ${big(0)} does not exist` };
    case 'BlockNotCross':
      return { title: `Block ${big(0)} is a prefunded slice, not a shared-Trove block` };
    case 'GroupNotOpen':
      return { title: 'No group Trove is open' };
    case 'GroupAlreadyOpen':
      return { title: 'A group Trove is already open' };
    case 'LedgerDirty':
      return { title: 'The ledger still tracks an earlier group' };
    case 'InterestUnsettled':
      return { title: `Block ${big(0)} cannot cover ${amt(big(1))} of interest from ${amt(big(2))} free` };
    case 'RepayExceedsPrincipal':
      return { title: `Repaying ${amt(big(1))} is more than block ${big(0)}'s ${amt(big(2))} principal` };
    case 'GroupStillOpen':
      return { title: 'The group is still open. Close it first' };
    case 'NoGroupClosed':
      return { title: 'No group has closed yet' };
    case 'ZeroAddress':
      return { title: 'The address is the zero address' };
    case 'TransferFailed':
      return { title: 'A MUSD transfer failed' };
    case 'SendFailed':
      return { title: 'Sending BTC failed' };
    case 'PendingRewards':
      return { title: 'Mezo reports pending rewards, so the ledger waits' };
    case 'LedgerMismatch':
      return { title: "The vault's ledger does not match Mezo" };
    case 'CashMismatch':
      return { title: "The vault's MUSD does not match its ledger" };
    default:
      return { title: name };
  }
}

// Text for a recorded refusal. Undefined means the reason is not loaded yet.
export function reasonText(reason: Reason | undefined): { title: string; step?: number; decoded: boolean } | undefined {
  if (!reason) return undefined;
  if ('name' in reason) {
    return { ...refusalText(reason.name, reason.args), decoded: true };
  }
  return { title: reason.raw, decoded: false };
}

// Collateral value over debt, in basis points. Prices and amounts are 18-decimal, so the scales cancel.
// Null when there is no debt.
export function collateralRatioBps(coll: bigint, price: bigint, debt: bigint): bigint | null {
  if (debt <= 0n) return null;
  return (coll * price * 10_000n) / (debt * 10n ** 18n);
}

export function fmtRatio(bps: bigint | null): string {
  return bps === null ? 'n/a' : `${(Number(bps) / 100).toFixed(1)}%`;
}

// Refusals per payment check (1 to 8) across the record. Block-level refusals have no check and are left out.
export function refusalSteps(rows: RecordRow[], verified: Record<string, Verified>): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const row of rows) {
    if (row.result !== 'refused') continue;
    const step = reasonText(verified[row.tx]?.reason)?.step;
    if (step !== undefined) counts[step] = (counts[step] ?? 0) + 1;
  }
  return counts;
}
