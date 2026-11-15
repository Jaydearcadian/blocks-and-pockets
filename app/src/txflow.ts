import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { erc20Abi, vaultAbi } from './abi';
import { reasonFor, revertData } from './chain';
import { MUSD, VAULT } from './config';
import { fmtAmount, fmtBtc, refusalText, type Reason } from './model';
import type { Call } from './actions';
import { errorCode, messageOf } from './wallet';

export type Outcome =
  | { kind: 'confirmed'; hash: Hex; block: bigint }
  | { kind: 'reverted'; hash: Hex; text: string }
  | { kind: 'refused'; text: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; text: string };

export type Deps = {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Address;
  step: (text: string) => void;
};

// Gas limit is 1.5 times the estimate. The testnet estimate has come in low before.
const GAS_NUM = 3n;
const GAS_DEN = 2n;
const RECEIPT_TIMEOUT_MS = 180_000;
const USER_REJECTED = 4001;

// The revert the contract gave, read from the error chain or from the raw revert data.
export function decodeRevert(err: unknown): Reason | undefined {
  if (err instanceof BaseError) {
    const found = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (found instanceof ContractFunctionRevertedError && found.data) {
      return { name: found.data.errorName, args: found.data.args ?? [] };
    }
  }
  const data = revertData(err);
  if (!data) return undefined;
  try {
    const decoded = decodeErrorResult({ abi: vaultAbi, data });
    return { name: decoded.errorName, args: decoded.args ?? [] };
  } catch {
    return { raw: data.slice(0, 10) };
  }
}

export function reasonLine(reason: Reason): string {
  if ('name' in reason) return `${refusalText(reason.name, reason.args).title} (${reason.name})`;
  if (reason.raw.startsWith('0x')) return `Reverted with an error this dashboard does not decode (${reason.raw})`;
  return reason.raw;
}

function refusalOf(err: unknown): string {
  const reason = decodeRevert(err);
  return reason ? reasonLine(reason) : messageOf(err);
}

type Write = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint };

// Simulates a write, sends it through the wallet, and waits for the receipt. A call that would revert is
// refused before the wallet is asked to sign, so a refused action sends nothing.
async function send(deps: Deps, write: Write, label: string): Promise<Outcome> {
  const { publicClient, wallet, account, step } = deps;
  let prepared;
  let gas: bigint;
  try {
    step(`Checking ${label} with Mezo`);
    prepared = await publicClient.simulateContract({ ...write, account });
    gas = ((await publicClient.estimateContractGas({ ...write, account })) * GAS_NUM) / GAS_DEN;
  } catch (err) {
    return { kind: 'refused', text: refusalOf(err) };
  }

  let hash: Hex;
  try {
    step(`Waiting for the wallet to sign ${label}`);
    hash = await wallet.writeContract({ ...prepared.request, gas });
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
  if (receipt.status === 'success') return { kind: 'confirmed', hash, block: receipt.blockNumber };
  return { kind: 'reverted', hash, text: reasonLine(await reasonFor(hash)) };
}

// Why the wallet cannot pay for the call, read before anything is sent. Undefined when it can pay.
async function shortfall(deps: Deps, call: Call): Promise<string | undefined> {
  const { publicClient, account } = deps;
  if (call.approve !== undefined && call.approve > 0n) {
    const held = await publicClient.readContract({
      address: MUSD,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    });
    if (held < call.approve) {
      return `The wallet holds ${fmtAmount(held)} MUSD, below the ${fmtAmount(call.approve)} MUSD needed`;
    }
  }
  if (call.value !== undefined && call.value > 0n) {
    const held = await publicClient.getBalance({ address: account });
    if (held < call.value) return `The wallet holds ${fmtBtc(held)} BTC, below the ${fmtBtc(call.value)} BTC of collateral`;
  }
  return undefined;
}

// Runs one action. MUSD is approved to the vault first when the call needs more allowance than it has.
export async function runCall(deps: Deps, call: Call): Promise<Outcome> {
  try {
    const short = await shortfall(deps, call);
    if (short) return { kind: 'refused', text: short };
    if (call.approve !== undefined && call.approve > 0n) {
      const allowance = await deps.publicClient.readContract({
        address: MUSD,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [deps.account, VAULT],
      });
      if (allowance < call.approve) {
        const approval: Write = {
          address: MUSD,
          abi: erc20Abi,
          functionName: 'approve',
          args: [VAULT, call.approve],
        };
        const approved = await send(deps, approval, 'the MUSD approval');
        if (approved.kind !== 'confirmed') return approved;
      }
    }
    return await send(
      deps,
      { address: VAULT, abi: vaultAbi, functionName: call.functionName, args: call.args, value: call.value },
      call.functionName,
    );
  } catch (err) {
    return { kind: 'failed', text: messageOf(err) };
  }
}
