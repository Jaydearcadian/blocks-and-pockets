import { parseEther } from 'viem';
import { OWNER, ZERO_ADDRESS } from './config';
import type { BlockView, Snapshot } from './model';

// Test data only. Not used by the app.

// Exact 18-decimal amount from a value with at most two decimals.
export const m = (x: number): bigint => BigInt(Math.round(x * 100)) * 10n ** 16n;

export function block(over: Partial<BlockView>): BlockView {
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
export function setupSnapshot(): Snapshot {
  return {
    block: 16777231,
    timestamp: 1794667290,
    owner: OWNER,
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
