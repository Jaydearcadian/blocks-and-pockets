import { isAddressEqual, parseAbi, type Address, type Hex, type PublicClient } from 'viem';
import { BORROWER_OPERATIONS, MUSD, PRICE_FEED, TROVE_MANAGER } from './config';
import artifact from './vaultArtifact.json';

// A page opened with ?vault= can name any address. Wallet actions are only offered on code that is this vault,
// pointing at the real Mezo testnet contracts, so a copy cannot send a visitor's MUSD approval somewhere else.

const RUNTIME = artifact.runtime.toLowerCase();
const RANGES = artifact.immutableRanges as [number, number][];

// Immutable values (the Mezo addresses, the owner, the target ratio) are inlined into the runtime code.
// They differ between deployments, so those bytes are skipped. Every other byte must match.
function masked(code: string): string {
  const chars = code.toLowerCase().split('');
  for (const [start, length] of RANGES) {
    for (let i = 2 + start * 2; i < 2 + (start + length) * 2; i++) chars[i] = '0';
  }
  return chars.join('');
}

const EXPECTED = masked(RUNTIME);

export function codeMatches(code: Hex | undefined): boolean {
  if (!code || code.length !== RUNTIME.length) return false;
  return masked(code) === EXPECTED;
}

export type VaultCheck = { ok: true } | { ok: false; reason: string };

const immutablesAbi = parseAbi([
  'function borrowerOperations() view returns (address)',
  'function troveManager() view returns (address)',
  'function priceFeed() view returns (address)',
  'function musd() view returns (address)',
]);

const POINTS_AT: [ 'borrowerOperations' | 'troveManager' | 'priceFeed' | 'musd', Address ][] = [
  ['borrowerOperations', BORROWER_OPERATIONS],
  ['troveManager', TROVE_MANAGER],
  ['priceFeed', PRICE_FEED],
  ['musd', MUSD],
];

export async function verifyVault(client: PublicClient, vault: Address): Promise<VaultCheck> {
  let code: Hex | undefined;
  try {
    code = await client.getCode({ address: vault });
  } catch {
    return { ok: false, reason: 'Could not check this address. Mezo testnet may be slow. Try again.' };
  }
  if (!code || code === '0x') return { ok: false, reason: 'There is no contract at this address on Mezo testnet.' };
  if (!codeMatches(code)) return { ok: false, reason: 'This address is not a Blocks & Pockets vault.' };
  for (const [name, expected] of POINTS_AT) {
    let actual: Address;
    try {
      actual = (await client.readContract({ address: vault, abi: immutablesAbi, functionName: name })) as Address;
    } catch {
      return { ok: false, reason: 'Could not check this address. Mezo testnet may be slow. Try again.' };
    }
    if (!isAddressEqual(actual, expected)) {
      const label = name === 'musd' ? 'MUSD' : name;
      return { ok: false, reason: `This vault points at a different ${label} than Mezo testnet's.` };
    }
  }
  return { ok: true };
}
