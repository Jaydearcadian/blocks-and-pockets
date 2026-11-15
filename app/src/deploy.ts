import { encodeDeployData, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import { BORROWER_OPERATIONS, MUSD, PRICE_FEED, TROVE_MANAGER } from './config';
import artifact from './vaultArtifact.json';
import { errorCode, messageOf } from './wallet';

// Lets a visitor deploy a fresh vault that their own wallet owns. Same contract, same Mezo testnet addresses.
const constructorAbi = parseAbi([
  'constructor(address borrowerOperations, address troveManager, address priceFeed, address musd, uint256 targetRatioBps, uint256 approvalThreshold)',
]);

export const TARGET_RATIO_BPS = 15_000n;
export const APPROVAL_THRESHOLD = 10n ** 18n;

const GAS_NUM = 3n;
const GAS_DEN = 2n;
const RECEIPT_TIMEOUT_MS = 180_000;
const USER_REJECTED = 4001;

export function deployArgs() {
  return [BORROWER_OPERATIONS, TROVE_MANAGER, PRICE_FEED, MUSD, TARGET_RATIO_BPS, APPROVAL_THRESHOLD] as const;
}

export function deployData(): Hex {
  return encodeDeployData({ abi: constructorAbi, bytecode: artifact.bytecode as Hex, args: deployArgs() });
}

export function vaultLink(base: string, address: Address, block: bigint): string {
  return `${base}?vault=${address}&from=${block.toString()}`;
}

export type DeployOutcome =
  | { kind: 'confirmed'; hash: Hex; address: Address; block: bigint }
  | { kind: 'reverted'; hash: Hex; text: string }
  | { kind: 'refused'; text: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; text: string };

export type DeployDeps = {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Address;
  step: (text: string) => void;
};

export async function deployVault(deps: DeployDeps): Promise<DeployOutcome> {
  const { publicClient, wallet, account, step } = deps;
  let gas: bigint;
  try {
    step('Checking the deployment with Mezo');
    gas = ((await publicClient.estimateGas({ account, data: deployData() })) * GAS_NUM) / GAS_DEN;
  } catch (err) {
    return { kind: 'refused', text: messageOf(err) };
  }

  let hash: Hex;
  try {
    step('Waiting for the wallet to sign the deployment');
    hash = await wallet.deployContract({
      abi: constructorAbi,
      bytecode: artifact.bytecode as Hex,
      args: deployArgs(),
      account,
      chain: wallet.chain,
      gas,
    });
  } catch (err) {
    if (errorCode(err) === USER_REJECTED) return { kind: 'cancelled' };
    return { kind: 'failed', text: messageOf(err) };
  }

  step('Waiting for the receipt');
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  } catch {
    return { kind: 'failed', text: `Sent as ${hash}, but no receipt has come back yet. Check the explorer.` };
  }
  if (receipt.status !== 'success') {
    return { kind: 'reverted', hash, text: 'The deployment reverted on chain. Check the explorer for the transaction.' };
  }
  if (!receipt.contractAddress) {
    return { kind: 'failed', text: `Deployed in ${hash}, but the receipt names no contract address. Check the explorer.` };
  }
  return { kind: 'confirmed', hash, address: receipt.contractAddress, block: receipt.blockNumber };
}
