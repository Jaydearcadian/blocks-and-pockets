import { getAddress, parseEther } from 'viem';
import { describe, expect, it } from 'vitest';
import { AGENT, OWNER, VAULT, VENDOR } from './config';
import {
  ACTIONS,
  actionById,
  blockChoices,
  complete,
  gateReason,
  initialValues,
  isOwner,
  operatorBlocks,
  parseAddressInput,
  parseAmount,
  parseEvidence,
  parseExpiry,
  parseName,
  parsePositive,
  prepare,
  reviewOf,
  settled,
  type Ctx,
} from './actions';
import { m, setupSnapshot } from './fixtures';
import { decodeEvidence, type Snapshot } from './model';

// 2026-11-14 16:30 UTC. The setup snapshot is older, so the tests pass the clock in.
const NOW = Date.parse('2026-11-14T16:30:00Z') / 1000;
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

const ctxFor = (snap: Snapshot, account?: `0x${string}`): Ctx => ({ snap, account, nowSeconds: NOW });

// Block 3 is a pocket that AGENT operates under an active mandate.
function withOperator(): Snapshot {
  const snap = setupSnapshot();
  return {
    ...snap,
    blocks: snap.blocks.map((b) =>
      b.id === 3
        ? {
            ...b,
            operator: AGENT,
            mandateActive: true,
            expiry: BigInt(NOW + 30 * 86400),
            perTxCap: m(1.5),
            totalCap: m(3),
            allowed: [VENDOR],
          }
        : b,
    ),
  };
}

// No group is open and every ledger total is clean, so a new group can open.
function closedSnapshot(): Snapshot {
  return {
    ...setupSnapshot(),
    troveActive: false,
    coll: 0n,
    principal: 0n,
    groupsClosed: 1,
    totalPrincipal: 0n,
    overheadPrincipal: 0n,
  };
}

describe('amount and text inputs', () => {
  it('reads a decimal amount as 18-decimal units', () => {
    expect(parseAmount(' 1.5 ', 'Amount')).toBe(parseEther('1.5'));
  });

  it('rejects signs, exponents, and numbers without a whole part', () => {
    for (const text of ['-1', '1e3', '.5', '5.', 'abc', '']) {
      expect(() => parseAmount(text, 'Amount')).toThrow(/must be a number/);
    }
  });

  it('rejects more than 18 decimal places', () => {
    expect(() => parseAmount('0.1234567890123456789', 'Amount')).toThrow(/at most 18 decimal places/);
  });

  it('requires a positive amount where zero makes no sense', () => {
    expect(() => parsePositive('0.00', 'Amount')).toThrow(/more than zero/);
    expect(parsePositive('0.01', 'Amount')).toBe(parseEther('0.01'));
  });

  it('checksums a pasted address and rejects a short one', () => {
    expect(parseAddressInput(OWNER.toLowerCase(), 'Payee')).toBe(getAddress(OWNER));
    expect(() => parseAddressInput('0x1234', 'Payee')).toThrow(/not a valid address/);
  });

  it('trims block names and limits them to 40 characters', () => {
    expect(parseName('  Procurement  ')).toBe('Procurement');
    expect(() => parseName('   ')).toThrow(/required/);
    expect(() => parseName('x'.repeat(41))).toThrow(/40 characters/);
  });

  it('pads an evidence label to 32 bytes and reads it back', () => {
    const hex = parseEvidence('INV-2041');
    expect(hex.length).toBe(66);
    expect(decodeEvidence(hex)).toBe('INV-2041');
  });

  it('sends zero bytes for an empty evidence label', () => {
    expect(parseEvidence('')).toBe(ZERO_BYTES32);
  });

  it('counts evidence in bytes, so an accented letter takes two', () => {
    expect(parseEvidence('é'.repeat(16)).length).toBe(66);
    expect(() => parseEvidence('é'.repeat(17))).toThrow(/at most 32 bytes/);
  });

  it('needs an expiry in UTC that is still in the future', () => {
    expect(parseExpiry('2026-12-14T16:00', NOW)).toBe(BigInt(Date.parse('2026-12-14T16:00:00Z') / 1000));
    expect(() => parseExpiry('2026-11-01T00:00', NOW)).toThrow(/in the future/);
    expect(() => parseExpiry('2026-11-20', NOW)).toThrow(/UTC/);
  });
});

describe('who may act', () => {
  it('treats only the snapshot owner as the owner', () => {
    const snap = setupSnapshot();
    expect(isOwner(ctxFor(snap, OWNER))).toBe(true);
    expect(isOwner(ctxFor(snap, AGENT))).toBe(false);
    expect(isOwner(ctxFor(snap, undefined))).toBe(false);
  });

  it('lists only the blocks where the wallet is the operator', () => {
    const snap = withOperator();
    expect(operatorBlocks(ctxFor(snap, AGENT)).map((b) => b.id)).toEqual([3]);
    expect(operatorBlocks(ctxFor(snap, OWNER))).toEqual([]);
    expect(operatorBlocks(ctxFor(snap, undefined))).toEqual([]);
  });

  it('gates owner actions for other wallets and operator actions for wallets with no block', () => {
    const snap = setupSnapshot();
    expect(gateReason(actionById('createBlock'), ctxFor(snap, AGENT))).toMatch(/owner wallet/);
    expect(gateReason(actionById('createBlock'), ctxFor(snap, undefined))).toMatch(/owner wallet/);
    expect(gateReason(actionById('requestTransfer'), ctxFor(snap, OWNER))).toMatch(/operator wallet/);
    expect(gateReason(actionById('requestTransfer'), ctxFor(withOperator(), AGENT))).toBeUndefined();
  });
});

describe('group state gates', () => {
  it('blocks opening a group while one is open', () => {
    expect(gateReason(actionById('openGroup'), ctxFor(setupSnapshot(), OWNER))).toMatch(/already open/);
  });

  it('blocks opening a group while the ledger still tracks an earlier one', () => {
    const snap = { ...closedSnapshot(), totalPrincipal: m(1) };
    expect(gateReason(actionById('openGroup'), ctxFor(snap, OWNER))).toMatch(/earlier group/);
  });

  it('allows opening a group on a clean, closed ledger', () => {
    expect(gateReason(actionById('openGroup'), ctxFor(closedSnapshot(), OWNER))).toBeUndefined();
  });

  it('needs an open group for borrow, repay, accrue, add collateral, and close', () => {
    for (const id of ['borrow', 'repay', 'accrue', 'addCollateral', 'closeGroup'] as const) {
      expect(gateReason(actionById(id), ctxFor(closedSnapshot(), OWNER))).toMatch(/Open the group Trove first/);
      expect(gateReason(actionById(id), ctxFor(setupSnapshot(), OWNER))).toBeUndefined();
    }
  });

  it('sweeps leftover MUSD only after a group has closed', () => {
    const sweep = actionById('sweepResidual');
    expect(gateReason(sweep, ctxFor(setupSnapshot(), OWNER))).toMatch(/Close the group first/);
    expect(gateReason(sweep, ctxFor({ ...closedSnapshot(), groupsClosed: 0 }, OWNER))).toMatch(/No group has closed/);
    expect(gateReason(sweep, ctxFor(closedSnapshot(), OWNER))).toBeUndefined();
  });
});

describe('prepare', () => {
  it('builds fundPocket with the MUSD approval it needs', () => {
    const call = prepare(actionById('fundPocket'), { block: '3', amount: '1.5' }, ctxFor(setupSnapshot(), OWNER));
    expect(call).toEqual({ functionName: 'fundPocket', args: [3n, parseEther('1.5')], approve: parseEther('1.5') });
  });

  it('sends the BTC collateral as value and the MUSD borrow as an argument for openGroup', () => {
    const call = prepare(
      actionById('openGroup'),
      { block: '1', borrow: '1800', collateral: '0.041' },
      ctxFor(closedSnapshot(), OWNER),
    );
    expect(call).toEqual({ functionName: 'openGroup', args: [1n, parseEther('1800')], value: parseEther('0.041') });
  });

  it('refuses to open a group into a prefunded slice', () => {
    expect(() =>
      prepare(
        actionById('openGroup'),
        { block: '3', borrow: '1800', collateral: '0.041' },
        ctxFor(closedSnapshot(), OWNER),
      ),
    ).toThrow(/prefunded slice/);
  });

  it('sends a payee as a checksummed address with the allow flag', () => {
    const call = prepare(
      actionById('setPayee'),
      { block: '3', payee: VENDOR.toLowerCase(), allowed: 'no' },
      ctxFor(setupSnapshot(), OWNER),
    );
    expect(call).toEqual({ functionName: 'setRecipient', args: [3n, getAddress(VENDOR), false] });
  });

  it('turns mandate caps and the expiry into contract units', () => {
    const call = prepare(
      actionById('grantMandate'),
      { block: '3', operator: AGENT, perTxCap: '1.5', totalCap: '3', expiry: '2026-12-14T16:00' },
      ctxFor(setupSnapshot(), OWNER),
    );
    expect(call).toEqual({
      functionName: 'grantMandate',
      args: [
        3n,
        getAddress(AGENT),
        parseEther('1.5'),
        parseEther('3'),
        BigInt(Date.parse('2026-12-14T16:00:00Z') / 1000),
      ],
    });
  });

  it('refuses a payment from a block the wallet does not operate', () => {
    expect(() =>
      prepare(
        actionById('requestTransfer'),
        { block: '1', payee: VENDOR, amount: '0.2', evidence: '' },
        ctxFor(withOperator(), AGENT),
      ),
    ).toThrow(/not the operator of block 1/);
  });

  it('builds a payment request with its evidence label', () => {
    const call = prepare(
      actionById('requestTransfer'),
      { block: '3', payee: VENDOR, amount: '0.2', evidence: 'INV-2041' },
      ctxFor(withOperator(), AGENT),
    );
    expect(call).toEqual({
      functionName: 'requestTransfer',
      args: [3n, getAddress(VENDOR), parseEther('0.2'), parseEvidence('INV-2041')],
    });
  });

  it('approves only a payment that is waiting', () => {
    const snap: Snapshot = {
      ...setupSnapshot(),
      payments: [
        { id: 4, blockId: 3, to: VENDOR, amount: m(1.1), evidence: 'INV-1', status: 1 },
        { id: 2, blockId: 3, to: VENDOR, amount: m(0.2), evidence: 'INV-0', status: 2 },
      ],
    };
    expect(prepare(actionById('approvePayment'), { payment: '4' }, ctxFor(snap, OWNER))).toEqual({
      functionName: 'approvePayment',
      args: [4n],
    });
    expect(() => prepare(actionById('approvePayment'), { payment: '2' }, ctxFor(snap, OWNER))).toThrow(
      /not waiting for approval/,
    );
  });

  it('will not build an owner action for another wallet', () => {
    expect(() => prepare(actionById('fundOverhead'), { amount: '1' }, ctxFor(setupSnapshot(), AGENT))).toThrow(
      /owner wallet/,
    );
  });
});

describe('initial values and completeness', () => {
  it('starts the expiry 30 days out and the block at the first choice', () => {
    const v = initialValues(actionById('grantMandate'), ctxFor(withOperator(), OWNER));
    expect(v.expiry).toBe(new Date((NOW + 30 * 86400) * 1000).toISOString().slice(0, 16));
    expect(v.block).toBe('1');
  });

  it('starts a send-to address at the owner', () => {
    expect(initialValues(actionById('sweepBtc'), ctxFor(setupSnapshot(), OWNER)).to).toBe(OWNER);
  });

  it('is ready only when every field has a value', () => {
    const def = actionById('setPayee');
    const v = initialValues(def, ctxFor(setupSnapshot(), OWNER));
    expect(complete(def, v)).toBe(false);
    expect(complete(def, { ...v, payee: VENDOR, allowed: 'yes' })).toBe(true);
  });
});

describe('block choices and settling', () => {
  it('offers only shared-Trove blocks where a field asks for them', () => {
    const def = actionById('openGroup');
    const field = def.fields.find((f) => f.name === 'block');
    if (!field) throw new Error('openGroup has no block field');
    expect(blockChoices(def, ctxFor(setupSnapshot(), OWNER), field).map((b) => b.id)).toEqual([1, 2]);
  });

  it('keeps a block the form still offers', () => {
    const def = actionById('fundPocket');
    expect(settled(def, ctxFor(setupSnapshot(), OWNER), { block: '2', amount: '1' }).block).toBe('2');
  });

  it('moves to the first offered block when the chosen one is gone', () => {
    const def = actionById('requestTransfer');
    const values = settled(def, ctxFor(withOperator(), AGENT), { block: '1', payee: '', amount: '', evidence: '' });
    expect(values.block).toBe('3');
  });

  it('leaves the block empty when the wallet offers none', () => {
    const def = actionById('requestTransfer');
    expect(settled(def, ctxFor(setupSnapshot(), AGENT), { block: '3' }).block).toBe('');
  });
});

describe('action registry', () => {
  it('has one definition per id, and only requestTransfer is an operator action', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACTIONS.filter((a) => a.role === 'operator').map((a) => a.id)).toEqual(['requestTransfer']);
  });

  it('gives every action a title and a button label', () => {
    for (const a of ACTIONS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.button.length).toBeGreaterThan(0);
    }
  });
});

describe('review before signing', () => {
  it('names the vault the transaction goes to, for the owner and for the operator', () => {
    const ownerDef = actionById('fundPocket');
    const ownerCtx = ctxFor(setupSnapshot(), OWNER);
    const ov = { block: '3', amount: '3' };
    expect(reviewOf(ownerDef, ov, ownerCtx, prepare(ownerDef, ov, ownerCtx)).vault).toBe(VAULT);
    const opDef = actionById('requestTransfer');
    const opCtx = ctxFor(withOperator(), AGENT);
    const pv = { block: '3', payee: VENDOR, amount: '0.5', evidence: 'INV-0001' };
    expect(reviewOf(opDef, pv, opCtx, prepare(opDef, pv, opCtx)).vault).toBe(VAULT);
  });

  it('names the owner wallet, the block, and the MUSD the owner sends', () => {
    const def = actionById('fundPocket');
    const values = { block: '3', amount: '3' };
    const ctx = ctxFor(setupSnapshot(), OWNER);
    const r = reviewOf(def, values, ctx, prepare(def, values, ctx));
    expect(r.sender).toBe('Owner wallet');
    expect(r.account).toBe(OWNER);
    expect(r.block).toBe('Block 3 · Vendor pocket · prefunded');
    expect(r.summary).toBe('Move 3 MUSD from the owner wallet into block 3.');
    expect(r.notes).toEqual([expect.stringContaining('Takes 3.00 MUSD from the owner wallet')]);
  });

  it('names the operator wallet and the block it pays from', () => {
    const def = actionById('requestTransfer');
    const values = { block: '3', payee: VENDOR, amount: '0.5', evidence: 'INV-0001' };
    const ctx = ctxFor(withOperator(), AGENT);
    const r = reviewOf(def, values, ctx, prepare(def, values, ctx));
    expect(r.sender).toBe('Operator wallet for block 3');
    expect(r.account).toBe(AGENT);
    expect(r.block).toBe('Block 3 · Vendor pocket · prefunded');
    expect(r.notes).toEqual([]);
  });

  it('names the block a waiting payment will move money from', () => {
    const snap: Snapshot = {
      ...withOperator(),
      payments: [{ id: 1, blockId: 3, to: VENDOR, amount: m(1.2), evidence: 'INV-0002', status: 1 }],
    };
    const def = actionById('approvePayment');
    const values = { payment: '1' };
    const ctx = ctxFor(snap, OWNER);
    const r = reviewOf(def, values, ctx, prepare(def, values, ctx));
    expect(r.sender).toBe('Owner wallet');
    expect(r.block).toBe('Block 3 · Vendor pocket · prefunded');
    expect(r.summary).toBe('Approve payment 1.');
  });

  it('says there is no block for an action that is vault-wide', () => {
    const def = actionById('setThreshold');
    const values = { amount: '1' };
    const ctx = ctxFor(setupSnapshot(), OWNER);
    const r = reviewOf(def, values, ctx, prepare(def, values, ctx));
    expect(r.block).toBeUndefined();
    expect(r.sender).toBe('Owner wallet');
  });

  it('states the BTC collateral that an open sends with the transaction', () => {
    const def = actionById('openGroup');
    const values = { block: '1', borrow: '1800', collateral: '0.048' };
    const ctx = ctxFor(closedSnapshot(), OWNER);
    const r = reviewOf(def, values, ctx, prepare(def, values, ctx));
    expect(r.block).toBe('Block 1 · Procurement · shared');
    expect(r.notes).toEqual(['Sends 0.0480 BTC of collateral with this transaction.']);
  });
});
