import { getAddress, isAddress, parseUnits, stringToHex, type Address, type Hex } from 'viem';
import { VAULT } from './config';
import { fmtAmount, fmtBtc, type BlockView, type Snapshot } from './model';

// Owner and operator actions for the vault. Each one is data: its form fields, how inputs become contract
// arguments, and when it is blocked. The contract still makes the final call and refuses what it must.

export type Role = 'owner' | 'operator';

export type Field = {
  name: string;
  label: string;
  kind: 'name' | 'amount' | 'address' | 'block' | 'payment' | 'choice' | 'expiry' | 'evidence';
  hint?: string;
  unit?: 'MUSD' | 'BTC';
  options?: { value: string; label: string }[];
  // For blocks: list only shared-Trove blocks.
  crossOnly?: boolean;
  // For addresses: fill in the owner's address when the form opens.
  defaultToOwner?: boolean;
};

export type Values = Record<string, string>;

export type Ctx = { snap: Snapshot; account?: Address; nowSeconds: number };

// The contract call an action makes. `approve` is MUSD the owner must approve to the vault first.
export type Call = {
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  approve?: bigint;
};

export type ActionId =
  | 'createBlock'
  | 'setPayee'
  | 'grantMandate'
  | 'revokeMandate'
  | 'fundPocket'
  | 'fundOverhead'
  | 'setThreshold'
  | 'openGroup'
  | 'addCollateral'
  | 'borrow'
  | 'repay'
  | 'accrue'
  | 'closeGroup'
  | 'sweepResidual'
  | 'sweepBtc'
  | 'recoverMusd'
  | 'approvePayment'
  | 'cancelPayment'
  | 'requestTransfer';

export type ActionDef = {
  id: ActionId;
  role: Role;
  title: string;
  summary: string;
  button: string;
  fields: Field[];
  // Why the group state blocks the action, or undefined when it does not.
  stateGate?: (s: Snapshot) => string | undefined;
  build: (v: Values, ctx: Ctx) => Call;
  describe: (v: Values) => string;
};

const DECIMAL = /^\d+(\.\d+)?$/;
const ZERO_BYTES32: Hex = `0x${'0'.repeat(64)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Decimal text to an 18-decimal amount. Rejects signs, exponents, and extra precision.
export function parseAmount(text: string, label: string): bigint {
  const t = text.trim();
  if (!DECIMAL.test(t)) throw new Error(`${label} must be a number, such as 1.5`);
  const decimals = t.split('.')[1]?.length ?? 0;
  if (decimals > 18) throw new Error(`${label} can have at most 18 decimal places`);
  return parseUnits(t, 18);
}

export function parsePositive(text: string, label: string): bigint {
  const amount = parseAmount(text, label);
  if (amount <= 0n) throw new Error(`${label} must be more than zero`);
  return amount;
}

export function parseAddressInput(text: string, label: string): Address {
  const t = text.trim();
  if (!isAddress(t)) throw new Error(`${label} is not a valid address`);
  return getAddress(t);
}

export function parseName(text: string): string {
  const t = text.trim();
  if (t.length === 0) throw new Error('Block name is required');
  if (t.length > 40) throw new Error('Block name must be 40 characters or fewer');
  return t;
}

export function parseBlock(text: string, blocks: BlockView[], crossOnly = false): BlockView {
  const id = Number(text);
  const block = blocks.find((b) => b.id === id);
  if (!block) throw new Error('Choose a block');
  if (crossOnly && !block.cross) throw new Error(`Block ${id} is a prefunded slice, not a shared-Trove block`);
  return block;
}

export function parsePaymentId(text: string, s: Snapshot): bigint {
  const id = Number(text);
  const payment = s.payments.find((p) => p.id === id);
  if (!payment || payment.status !== 1) throw new Error('That payment is not waiting for approval');
  return BigInt(id);
}

// A datetime-local value, read as UTC like the rest of the dashboard. Must be in the future.
export function parseExpiry(text: string, nowSeconds: number): bigint {
  const t = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) throw new Error('Expiry must be a date and time in UTC');
  const seconds = Date.parse(`${t}:00Z`) / 1000;
  if (!Number.isFinite(seconds)) throw new Error('Expiry is not a real date');
  if (seconds <= nowSeconds) throw new Error('Expiry must be in the future');
  return BigInt(Math.floor(seconds));
}

// ASCII label as bytes32, padded on the right. Empty means no label.
export function parseEvidence(text: string): Hex {
  const t = text.trim();
  if (t === '') return ZERO_BYTES32;
  if (new TextEncoder().encode(t).length > 32) throw new Error('Evidence can be at most 32 bytes');
  return stringToHex(t, { size: 32 });
}

export function isOwner(ctx: Ctx): boolean {
  return ctx.account !== undefined && same(ctx.account, ctx.snap.owner);
}

// Blocks whose mandate names the connected wallet as operator.
export function operatorBlocks(ctx: Ctx): BlockView[] {
  const account = ctx.account;
  if (account === undefined) return [];
  return ctx.snap.blocks.filter((b) => same(b.operator, account));
}

// The blocks a form can pick from. Operators see only their own blocks.
export function blockChoices(def: ActionDef, ctx: Ctx, field: Field): BlockView[] {
  const pool = def.role === 'operator' ? operatorBlocks(ctx) : ctx.snap.blocks;
  return field.crossOnly ? pool.filter((b) => b.cross) : pool;
}

// Why the action cannot run now, or undefined when it can. Role first, then group state.
export function gateReason(def: ActionDef, ctx: Ctx): string | undefined {
  if (def.role === 'owner' && !isOwner(ctx)) return 'Connect the owner wallet to run this.';
  if (def.role === 'operator' && operatorBlocks(ctx).length === 0) {
    return 'Connect the operator wallet of a block to run this.';
  }
  return def.stateGate?.(ctx.snap);
}

// Validates the form and returns the contract call. Throws with a message the form can show.
export function prepare(def: ActionDef, v: Values, ctx: Ctx): Call {
  const why = gateReason(def, ctx);
  if (why) throw new Error(why);
  return def.build(v, ctx);
}

// What the review shows before a wallet is asked to sign. It is built from the same call that gets sent.
export type Review = {
  title: string;
  sender: string;
  account?: Address;
  vault: Address;
  block?: string;
  summary: string;
  notes: string[];
};

// The block an action acts on: its block field, or the block of the payment it approves or cancels.
function blockOf(def: ActionDef, v: Values, snap: Snapshot): BlockView | undefined {
  const blockField = def.fields.find((f) => f.kind === 'block');
  if (blockField) return snap.blocks.find((b) => String(b.id) === v[blockField.name]);
  const paymentField = def.fields.find((f) => f.kind === 'payment');
  if (paymentField) {
    const payment = snap.payments.find((p) => String(p.id) === v[paymentField.name]);
    return snap.blocks.find((b) => b.id === payment?.blockId);
  }
  return undefined;
}

export function reviewOf(def: ActionDef, v: Values, ctx: Ctx, call: Call): Review {
  const block = blockOf(def, v, ctx.snap);
  const notes: string[] = [];
  if (call.approve !== undefined && call.approve > 0n) {
    notes.push(
      `Takes ${fmtAmount(call.approve)} MUSD from the owner wallet. The wallet may first ask for an MUSD approval to the vault.`,
    );
  }
  if (call.value !== undefined && call.value > 0n) {
    notes.push(`Sends ${fmtBtc(call.value)} BTC of collateral with this transaction.`);
  }
  return {
    title: def.title,
    sender: def.role === 'operator' ? `Operator wallet for block ${block?.id ?? '?'}` : 'Owner wallet',
    account: ctx.account,
    vault: VAULT,
    block: block && `Block ${block.id} · ${block.name} · ${block.cross ? 'shared' : 'prefunded'}`,
    summary: def.describe(v),
    notes,
  };
}

// Form values before the user types. Choices take their first option, addresses may default to the owner,
// and expiry defaults to 30 days out.
export function initialValues(def: ActionDef, ctx: Ctx, preset: Values = {}): Values {
  const v: Values = {};
  for (const f of def.fields) {
    if (f.kind === 'choice') v[f.name] = f.options?.[0]?.value ?? '';
    else if (f.kind === 'address' && f.defaultToOwner) v[f.name] = ctx.snap.owner;
    else if (f.kind === 'expiry') v[f.name] = new Date((ctx.nowSeconds + 30 * 86400) * 1000).toISOString().slice(0, 16);
    else if (f.kind === 'block') v[f.name] = String(blockChoices(def, ctx, f)[0]?.id ?? '');
    else v[f.name] = '';
  }
  return { ...v, ...preset };
}

// Every required field has a value.
export function complete(def: ActionDef, v: Values): boolean {
  return def.fields.every((f) => (v[f.name] ?? '').trim() !== '');
}

// Block fields keep a block the form can offer. When the list changes, for example after a block is created,
// the first choice is used so the select and the form agree.
export function settled(def: ActionDef, ctx: Ctx, values: Values): Values {
  const next: Values = { ...values };
  for (const field of def.fields) {
    if (field.kind !== 'block') continue;
    const choices = blockChoices(def, ctx, field);
    if (!choices.some((b) => String(b.id) === next[field.name])) next[field.name] = String(choices[0]?.id ?? '');
  }
  return next;
}

const openGate = (s: Snapshot): string | undefined => {
  if (s.troveActive) return 'The group Trove is already open.';
  const dirty = s.totalPrincipal !== 0n || s.totalInterest !== 0n || s.overheadPrincipal !== 0n || s.overheadInterest !== 0n;
  return dirty ? 'The ledger still tracks an earlier group.' : undefined;
};

const needsOpen = (s: Snapshot): string | undefined => (s.troveActive ? undefined : 'Open the group Trove first.');

const blockField = (hint?: string, crossOnly = false): Field => ({
  name: 'block',
  label: crossOnly ? 'Shared-Trove block' : 'Block',
  kind: 'block',
  hint,
  crossOnly,
});

const amountField = (name: string, label: string, hint?: string): Field => ({
  name,
  label,
  kind: 'amount',
  unit: 'MUSD',
  hint,
});

const toOwnerField = (label: string): Field => ({
  name: 'to',
  label,
  kind: 'address',
  defaultToOwner: true,
});

export const ACTIONS: ActionDef[] = [
  {
    id: 'createBlock',
    role: 'owner',
    title: 'Create a block',
    summary: 'A new pocket. A shared-Trove block draws on the group. A prefunded slice holds its own MUSD.',
    button: 'Create block',
    fields: [
      { name: 'name', label: 'Block name', kind: 'name' },
      {
        name: 'cross',
        label: 'Funding',
        kind: 'choice',
        options: [
          { value: 'yes', label: 'Shared Trove' },
          { value: 'no', label: 'Prefunded slice' },
        ],
      },
      amountField('debtCap', 'Debt cap (MUSD)', "Limit on this block's debt. Only shared-Trove blocks borrow."),
    ],
    build: (v) => ({
      functionName: 'createMoneyblock',
      args: [parseName(v.name), v.cross === 'yes', parseAmount(v.debtCap, 'Debt cap')],
    }),
    describe: (v) =>
      `Create "${v.name}", ${v.cross === 'yes' ? 'a shared-Trove block' : 'a prefunded slice'}, with a ${v.debtCap} MUSD debt cap.`,
  },
  {
    id: 'setPayee',
    role: 'owner',
    title: 'Allow or remove a payee',
    summary: "Money moves only to addresses on a block's allowlist.",
    button: 'Save payee',
    fields: [
      blockField(),
      { name: 'payee', label: 'Payee address', kind: 'address' },
      {
        name: 'allowed',
        label: 'Status',
        kind: 'choice',
        options: [
          { value: 'yes', label: 'Allow' },
          { value: 'no', label: 'Remove' },
        ],
      },
    ],
    build: (v, ctx) => ({
      functionName: 'setRecipient',
      args: [
        BigInt(parseBlock(v.block, ctx.snap.blocks).id),
        parseAddressInput(v.payee, 'Payee address'),
        v.allowed === 'yes',
      ],
    }),
    describe: (v) => `${v.allowed === 'yes' ? 'Allow' : 'Remove'} ${v.payee} on block ${v.block}.`,
  },
  {
    id: 'grantMandate',
    role: 'owner',
    title: 'Grant an operator mandate',
    summary: 'The operator key may request payments from this block, within the caps, until the expiry.',
    button: 'Grant mandate',
    fields: [
      blockField(),
      { name: 'operator', label: 'Operator address', kind: 'address', hint: 'The wallet that requests payments.' },
      amountField('perTxCap', 'Per-payment cap (MUSD)'),
      amountField('totalCap', 'Lifetime cap (MUSD)', 'Executed and waiting payments count toward this total.'),
      { name: 'expiry', label: 'Expires (UTC)', kind: 'expiry' },
    ],
    build: (v, ctx) => {
      const block = parseBlock(v.block, ctx.snap.blocks);
      return {
        functionName: 'grantMandate',
        args: [
          BigInt(block.id),
          parseAddressInput(v.operator, 'Operator address'),
          parseAmount(v.perTxCap, 'Per-payment cap'),
          parseAmount(v.totalCap, 'Lifetime cap'),
          parseExpiry(v.expiry, ctx.nowSeconds),
        ],
      };
    },
    describe: (v) =>
      `Let ${v.operator} request up to ${v.perTxCap} MUSD per payment and ${v.totalCap} MUSD in total from block ${v.block}, until ${v.expiry} UTC.`,
  },
  {
    id: 'revokeMandate',
    role: 'owner',
    title: 'Revoke an operator mandate',
    summary: 'The operator key is refused from now on. A waiting payment is refused too if you approve it.',
    button: 'Revoke mandate',
    fields: [blockField()],
    build: (v, ctx) => ({
      functionName: 'revokeMandate',
      args: [BigInt(parseBlock(v.block, ctx.snap.blocks).id)],
    }),
    describe: (v) => `Revoke the mandate on block ${v.block}.`,
  },
  {
    id: 'fundPocket',
    role: 'owner',
    title: 'Fund a pocket',
    summary: 'Moves MUSD from the owner wallet into a block. The owner approves the vault for this amount first.',
    button: 'Fund pocket',
    fields: [blockField(), amountField('amount', 'Amount (MUSD)')],
    build: (v, ctx) => {
      const amount = parsePositive(v.amount, 'Amount');
      return { functionName: 'fundPocket', args: [BigInt(parseBlock(v.block, ctx.snap.blocks).id), amount], approve: amount };
    },
    describe: (v) => `Move ${v.amount} MUSD from the owner wallet into block ${v.block}.`,
  },
  {
    id: 'fundOverhead',
    role: 'owner',
    title: 'Fund overhead',
    summary: 'MUSD for Mezo interest on the overhead and for closing the group.',
    button: 'Fund overhead',
    fields: [amountField('amount', 'Amount (MUSD)')],
    build: (v) => {
      const amount = parsePositive(v.amount, 'Amount');
      return { functionName: 'fundOverhead', args: [amount], approve: amount };
    },
    describe: (v) => `Move ${v.amount} MUSD from the owner wallet to overhead.`,
  },
  {
    id: 'setThreshold',
    role: 'owner',
    title: 'Set the approval threshold',
    summary: 'Payments above this amount wait for the owner. Zero makes every payment wait.',
    button: 'Set threshold',
    fields: [amountField('amount', 'Threshold (MUSD)')],
    build: (v) => ({ functionName: 'setApprovalThreshold', args: [parseAmount(v.amount, 'Threshold')] }),
    describe: (v) => `Set the owner-approval threshold to ${v.amount} MUSD.`,
  },
  {
    id: 'openGroup',
    role: 'owner',
    title: 'Open the group Trove',
    summary: 'Opens the shared Trove with BTC collateral and borrows into one shared-Trove block.',
    button: 'Open group',
    fields: [
      blockField('The borrowed MUSD goes to this block.', true),
      amountField('borrow', 'MUSD to borrow'),
      { name: 'collateral', label: 'BTC collateral', kind: 'amount', unit: 'BTC' },
    ],
    stateGate: openGate,
    build: (v, ctx) => {
      const block = parseBlock(v.block, ctx.snap.blocks, true);
      return {
        functionName: 'openGroup',
        args: [BigInt(block.id), parsePositive(v.borrow, 'MUSD to borrow')],
        value: parsePositive(v.collateral, 'BTC collateral'),
      };
    },
    describe: (v) => `Open the group Trove with ${v.collateral} BTC and borrow ${v.borrow} MUSD into block ${v.block}.`,
  },
  {
    id: 'addCollateral',
    role: 'owner',
    title: 'Add collateral',
    summary: 'Adds BTC to the open group Trove. This raises the group capacity.',
    button: 'Add collateral',
    fields: [{ name: 'collateral', label: 'BTC to add', kind: 'amount', unit: 'BTC' }],
    stateGate: needsOpen,
    build: (v) => ({ functionName: 'addCollateral', args: [], value: parsePositive(v.collateral, 'BTC to add') }),
    describe: (v) => `Add ${v.collateral} BTC of collateral to the group Trove.`,
  },
  {
    id: 'borrow',
    role: 'owner',
    title: 'Borrow for a shared-Trove block',
    summary: 'Borrows more MUSD for one block. The block cap and the group capacity both apply.',
    button: 'Borrow',
    fields: [blockField(undefined, true), amountField('amount', 'Amount (MUSD)')],
    stateGate: needsOpen,
    build: (v, ctx) => ({
      functionName: 'borrow',
      args: [BigInt(parseBlock(v.block, ctx.snap.blocks, true).id), parsePositive(v.amount, 'Amount')],
    }),
    describe: (v) => `Borrow ${v.amount} MUSD for block ${v.block}.`,
  },
  {
    id: 'repay',
    role: 'owner',
    title: 'Repay a shared-Trove block',
    summary: "Repays part of one block's principal. Each block and the overhead pay their own interest first.",
    button: 'Repay',
    fields: [blockField(undefined, true), amountField('amount', 'Amount (MUSD)')],
    stateGate: needsOpen,
    build: (v, ctx) => ({
      functionName: 'repay',
      args: [BigInt(parseBlock(v.block, ctx.snap.blocks, true).id), parsePositive(v.amount, 'Amount')],
    }),
    describe: (v) => `Repay ${v.amount} MUSD of block ${v.block}'s principal.`,
  },
  {
    id: 'accrue',
    role: 'owner',
    title: 'Accrue interest',
    summary: 'Settles interest up to now and splits it across the blocks. It moves no MUSD.',
    button: 'Accrue interest',
    fields: [],
    stateGate: needsOpen,
    build: () => ({ functionName: 'accrue', args: [] }),
    describe: () => 'Settle interest up to now.',
  },
  {
    id: 'closeGroup',
    role: 'owner',
    title: 'Close the group Trove',
    summary: 'Each block pays its own debt from its own cash. Then the Trove closes and the BTC returns to the vault.',
    button: 'Close group',
    fields: [],
    stateGate: needsOpen,
    build: () => ({ functionName: 'closeGroup', args: [] }),
    describe: () => 'Close the group Trove.',
  },
  {
    id: 'sweepResidual',
    role: 'owner',
    title: 'Sweep leftover MUSD',
    summary: 'After a close, sends the MUSD the vault still tracks to an address. Refused while a group is open.',
    button: 'Sweep MUSD',
    fields: [toOwnerField('Send to')],
    stateGate: (s) => {
      if (s.troveActive) return 'Close the group first.';
      return s.groupsClosed === 0 ? 'No group has closed yet.' : undefined;
    },
    build: (v) => ({ functionName: 'sweepResidualMUSD', args: [parseAddressInput(v.to, 'Send to')] }),
    describe: (v) => `Send all leftover MUSD tracked by the vault to ${v.to}.`,
  },
  {
    id: 'sweepBtc',
    role: 'owner',
    title: 'Sweep BTC',
    summary: 'Sends all BTC the vault holds, such as collateral returned at close.',
    button: 'Sweep BTC',
    fields: [toOwnerField('Send to')],
    build: (v) => ({ functionName: 'sweepBTC', args: [parseAddressInput(v.to, 'Send to')] }),
    describe: (v) => `Send all BTC held by the vault to ${v.to}.`,
  },
  {
    id: 'recoverMusd',
    role: 'owner',
    title: 'Recover unallocated MUSD',
    summary: 'Returns MUSD that arrived outside the ledger, such as a direct transfer. Moves no tracked cash.',
    button: 'Recover MUSD',
    fields: [toOwnerField('Send to')],
    build: (v) => ({ functionName: 'recoverUnallocatedMUSD', args: [parseAddressInput(v.to, 'Send to')] }),
    describe: (v) => `Send MUSD that arrived outside the ledger to ${v.to}.`,
  },
  {
    id: 'approvePayment',
    role: 'owner',
    title: 'Approve a waiting payment',
    summary: 'Releases a payment that is above the threshold. The mandate and payee are checked again.',
    button: 'Approve',
    fields: [{ name: 'payment', label: 'Payment', kind: 'payment' }],
    build: (v, ctx) => ({ functionName: 'approvePayment', args: [parsePaymentId(v.payment, ctx.snap)] }),
    describe: (v) => `Approve payment ${v.payment}.`,
  },
  {
    id: 'cancelPayment',
    role: 'owner',
    title: 'Cancel a waiting payment',
    summary: 'Releases the reserved cash and the lifetime cap. The payment stays on record as cancelled.',
    button: 'Cancel payment',
    fields: [{ name: 'payment', label: 'Payment', kind: 'payment' }],
    build: (v, ctx) => ({ functionName: 'cancelPayment', args: [parsePaymentId(v.payment, ctx.snap)] }),
    describe: (v) => `Cancel payment ${v.payment}.`,
  },
  {
    id: 'requestTransfer',
    role: 'operator',
    title: 'Request a payment',
    summary: "Pays from a block's pocket under its mandate. Above the threshold it waits for the owner.",
    button: 'Request payment',
    fields: [
      blockField('Only blocks where this wallet is the operator are listed.'),
      { name: 'payee', label: 'Payee address', kind: 'address' },
      amountField('amount', 'Amount (MUSD)'),
      {
        name: 'evidence',
        label: 'Evidence label',
        kind: 'evidence',
        hint: 'Up to 32 bytes, such as INV-2041. Stored on chain.',
      },
    ],
    build: (v, ctx) => {
      const block = parseBlock(v.block, ctx.snap.blocks);
      if (!ctx.account || !same(block.operator, ctx.account)) {
        throw new Error(`This wallet is not the operator of block ${block.id}`);
      }
      return {
        functionName: 'requestTransfer',
        args: [
          BigInt(block.id),
          parseAddressInput(v.payee, 'Payee address'),
          parsePositive(v.amount, 'Amount'),
          parseEvidence(v.evidence),
        ],
      };
    },
    describe: (v) => `Request ${v.amount} MUSD from block ${v.block} to ${v.payee}, labelled "${v.evidence}".`,
  },
];

export const actionById = (id: ActionId): ActionDef => {
  const def = ACTIONS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown action ${id}`);
  return def;
};
