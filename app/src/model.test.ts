import { parseEther } from 'viem';
import { describe, expect, it } from 'vitest';
import { AGENT, VENDOR, ZERO_ADDRESS } from './config';
import {
  collateralRatioBps,
  decodeEvidence,
  fmtAmount,
  fmtRatio,
  mandateState,
  paymentPath,
  pctOf,
  reasonText,
  refusalSteps,
  refusalText,
  tieOuts,
  type BlockView,
  type Hex,
  type RecordRow,
  type Snapshot,
  type Verified,
} from './model';

// Exact 18-decimal amount from a value with at most two decimals.
const m = (x: number): bigint => BigInt(Math.round(x * 100)) * 10n ** 16n;

function block(over: Partial<BlockView>): BlockView {
  return {
    id: 1,
    name: 'Test',
    cross: false,
    cash: 0n,
    reserved: 0n,
    debtCap: 0n,
    principal: 0n,
    interest: 0n,
    operator: ZERO_ADDRESS,
    mandateActive: false,
    expiry: 0n,
    perTxCap: 0n,
    totalCap: 0n,
    committed: 0n,
    spent: 0n,
    allowed: [],
    ...over,
  };
}

// The setup checkpoint of the rerun (block 16777231), with the values the chain returned.
function setupSnapshot(): Snapshot {
  return {
    block: 16777231,
    timestamp: 1794667290,
    troveActive: true,
    coll: parseEther('0.048'),
    principal: m(2021.82),
    interest: 0n,
    capacity: parseEther('2111.98951072'),
    price: parseEther('65999.67221'),
    ratioBps: 15000n,
    threshold: m(1),
    groupsClosed: 0,
    totalCash: m(1820.8),
    totalPrincipal: m(2021.82),
    totalInterest: 0n,
    overheadPrincipal: m(200),
    overheadInterest: 0n,
    overheadCash: m(0.5),
    vaultMusd: m(1820.8),
    ownerMusd: m(6.99),
    vendorMusd: m(3.46),
    ownerBtc: parseEther('0.0013'),
    vaultBtc: 0n,
    blocks: [
      block({ id: 1, name: 'Procurement', cross: true, cash: m(1800), principal: m(1801.8) }),
      block({ id: 2, name: 'Operations', cross: true, cash: m(20), principal: m(20.02) }),
      block({ id: 3, name: 'Vendor pocket', cash: m(0.3) }),
    ],
    payments: [],
  };
}

describe('fmtAmount', () => {
  it('formats 18-decimal amounts with grouping and fixed digits', () => {
    expect(fmtAmount(m(1.3))).toBe('1.30');
    expect(fmtAmount(m(2021.82))).toBe('2,021.82');
    expect(fmtAmount(m(2500), 0)).toBe('2,500');
  });
});

describe('pctOf', () => {
  it('clamps to 0..100 and handles a zero whole', () => {
    expect(pctOf(1n, 0n)).toBe(0);
    expect(pctOf(1n, 4n)).toBe(25);
    expect(pctOf(5n, 4n)).toBe(100);
  });
});

describe('collateral ratio', () => {
  it('is 0.048 BTC at $66,000 over 2,021.82 MUSD, about 156.7 percent', () => {
    // By hand: 0.048 x 66,000 = 3,168, and 3,168 / 2,021.82 = 1.566905, so 15,669 basis points.
    const bps = collateralRatioBps(parseEther('0.048'), parseEther('66000'), m(2021.82));
    expect(bps).toBe(15669n);
    expect(fmtRatio(bps)).toBe('156.7%');
  });
  it('is null when there is no debt', () => {
    expect(collateralRatioBps(parseEther('0.048'), parseEther('66000'), 0n)).toBeNull();
    expect(fmtRatio(null)).toBe('n/a');
  });
});

describe('tieOuts', () => {
  it('passes every check on a consistent snapshot', () => {
    const checks = tieOuts(setupSnapshot());
    expect(checks).toHaveLength(5);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('flags only the vault cash check when MUSD is off by one wei', () => {
    const s = setupSnapshot();
    s.vaultMusd = s.totalCash + 1n;
    const failing = tieOuts(s).filter((c) => !c.ok);
    expect(failing.map((c) => c.label)).toEqual(['Vault MUSD equals the cash the vault tracks']);
  });

  it('flags a block principal that does not add up to the ledger', () => {
    const s = setupSnapshot();
    s.blocks[1] = { ...s.blocks[1], principal: m(20) };
    const failing = tieOuts(s).filter((c) => !c.ok);
    expect(failing.map((c) => c.label)).toEqual(['Block and overhead principal add up to the ledger']);
  });
});

describe('mandateState', () => {
  const now = 1794000000;
  it('is none for a block with no operator', () => {
    expect(mandateState(block({}), now)).toBe('none');
  });
  it('is revoked when the mandate is switched off, even before expiry', () => {
    const b = block({ operator: AGENT, mandateActive: false, expiry: BigInt(now + 100) });
    expect(mandateState(b, now)).toBe('revoked');
  });
  it('is expired after the expiry time', () => {
    const b = block({ operator: AGENT, mandateActive: true, expiry: BigInt(now - 1) });
    expect(mandateState(b, now)).toBe('expired');
  });
  it('is active before expiry', () => {
    const b = block({ operator: AGENT, mandateActive: true, expiry: BigInt(now + 100) });
    expect(mandateState(b, now)).toBe('active');
  });
});

describe('paymentPath', () => {
  it('sends amounts above the threshold to the owner', () => {
    expect(paymentPath(m(1.2), m(1))).toBe('owner');
  });
  it('executes amounts at or under the threshold at once', () => {
    expect(paymentPath(m(0.5), m(1))).toBe('auto');
    expect(paymentPath(m(1), m(1))).toBe('auto');
  });
});

describe('refusalText', () => {
  it('maps a revoked mandate to payment check 3', () => {
    expect(refusalText('MandateRevoked', [3n])).toEqual({
      title: 'The mandate for block 3 is revoked',
      step: 3,
    });
  });
  it('maps an over-cap payment to check 5 with both amounts', () => {
    const r = refusalText('PerTransactionCapExceeded', [m(1.6), m(1.5)]);
    expect(r.step).toBe(5);
    expect(r.title).toBe('1.60 MUSD is over the 1.50 MUSD per-payment cap');
  });
  it('maps a payee off the allowlist to check 4 with a short address', () => {
    const r = refusalText('RecipientNotAllowed', [3n, '0x000000000000000000000000000000000000c0de']);
    expect(r.step).toBe(4);
    expect(r.title).toContain('0x0000…c0de');
  });
  it('leaves block-level refusals without a payment check', () => {
    expect(refusalText('GroupCapacityExceeded', [m(2200), m(2111.99)]).step).toBeUndefined();
  });
  it('falls back to the error name for unknown errors', () => {
    expect(refusalText('SomethingNew', []).title).toBe('SomethingNew');
  });
});

describe('reasonText', () => {
  it('is undefined while the reason is not loaded', () => {
    expect(reasonText(undefined)).toBeUndefined();
  });
  it('marks a raw reason as not decoded', () => {
    expect(reasonText({ raw: 'revert data not found' })).toEqual({
      title: 'revert data not found',
      decoded: false,
    });
  });
  it('marks a named reason as decoded', () => {
    expect(reasonText({ name: 'MandateRevoked', args: [3n] })?.decoded).toBe(true);
  });
});

describe('refusalSteps', () => {
  const row = (tx: Hex, result: RecordRow['result']): RecordRow => ({
    phase: 'revoke',
    label: tx,
    result,
    tx,
    block: 1,
  });
  const refused = (name: string, args: readonly unknown[]): Verified => ({
    row: row('0x1', 'refused'),
    chainStatus: 'reverted',
    matches: true,
    reason: { name, args },
  });

  it('counts refusals per payment check and leaves out block-level ones', () => {
    const rows = [
      row('0xa', 'refused'),
      row('0xb', 'refused'),
      row('0xc', 'refused'),
      row('0xd', 'refused'),
      row('0xe', 'executed'),
    ];
    const verified: Record<string, Verified> = {
      '0xa': refused('MandateRevoked', [3n]),
      '0xb': refused('MandateRevoked', [3n]),
      '0xc': refused('RecipientNotAllowed', [3n, VENDOR]),
      '0xd': refused('GroupCapacityExceeded', [m(2200), m(2111.99)]),
      '0xe': refused('MandateRevoked', [3n]),
    };
    expect(refusalSteps(rows, verified)).toEqual({ 3: 2, 4: 1 });
  });

  it('is empty while nothing is decoded yet', () => {
    expect(refusalSteps([row('0xa', 'refused')], {})).toEqual({});
  });
});

describe('decodeEvidence', () => {
  it('reads a right-padded ASCII bytes32 label', () => {
    const hex = `0x494e562d30303500${'00'.repeat(23)}`;
    expect(decodeEvidence(hex)).toBe('INV-005');
  });
  it('returns an empty string for zero bytes', () => {
    expect(decodeEvidence(`0x${'00'.repeat(32)}`)).toBe('');
  });
});

describe('fixtures', () => {
  it('uses the test payee and agent addresses from the demo', () => {
    expect(VENDOR.toLowerCase()).toBe('0x000000000000000000000000000000000000beef');
    expect(AGENT).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
