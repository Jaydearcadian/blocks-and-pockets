import { createPublicClient, decodeErrorResult, defineChain, http, parseAbiItem, type Hex } from 'viem';
import { CHAIN_ID, EXPLORER_URL, MUSD, OWNER, PRICE_FEED, RPC_URL, VAULT, VENDOR } from './config';
import { erc20Abi, priceFeedAbi, vaultAbi } from './abi';
import {
  decodeEvidence,
  type BlockView,
  type PaymentStatus,
  type PaymentView,
  type RecordRow,
  type Reason,
  type Snapshot,
  type Verified,
} from './model';

export const mezoTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Mezo Testnet Explorer', url: EXPLORER_URL } },
  testnet: true,
});

export const client = createPublicClient({
  chain: mezoTestnet,
  transport: http(RPC_URL, { retryCount: 4, retryDelay: 800, timeout: 20_000 }),
});

const recipientSet = parseAbiItem('event RecipientSet(uint256 indexed blockId, address indexed to, bool allowed)');

// Mezo's RPC refuses an eth_getLogs range longer than 10,000 blocks. Each window stays under that limit.
const LOG_WINDOW = 9_000n;

// Inclusive windows that cover from..to in order, with no gaps or overlaps. Empty when from is after to.
export function logWindows(from: bigint, to: bigint): [bigint, bigint][] {
  const windows: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n;
    windows.push([start, end < to ? end : to]);
  }
  return windows;
}

type AtBlock = { blockNumber?: bigint };
const at = (blockNumber?: bigint): AtBlock => (blockNumber === undefined ? {} : { blockNumber });

// Reads the vault as of `blockNumber`, or the latest block when it is undefined.
export async function readSnapshot(blockNumber: bigint | undefined, deployBlock: bigint): Promise<Snapshot> {
  const o = at(blockNumber);
  const head = await client.getBlock(o);
  const V = { address: VAULT, abi: vaultAbi } as const;

  const [
    owner,
    ratioBps,
    threshold,
    blockCount,
    paymentCount,
    groupsClosed,
    troveActive,
    totalCash,
    totalPrincipal,
    totalInterest,
    overheadPrincipal,
    overheadInterest,
    overheadCash,
    position,
    capacity,
    price,
    vaultMusd,
    ownerMusd,
    vendorMusd,
    vaultBtc,
    ownerBtc,
  ] = await Promise.all([
    client.readContract({ ...V, functionName: 'owner', ...o }),
    client.readContract({ ...V, functionName: 'targetRatioBps', ...o }),
    client.readContract({ ...V, functionName: 'approvalThreshold', ...o }),
    client.readContract({ ...V, functionName: 'blockCount', ...o }),
    client.readContract({ ...V, functionName: 'paymentCount', ...o }),
    client.readContract({ ...V, functionName: 'groupsClosed', ...o }),
    client.readContract({ ...V, functionName: 'troveActive', ...o }),
    client.readContract({ ...V, functionName: 'totalCash', ...o }),
    client.readContract({ ...V, functionName: 'totalPrincipal', ...o }),
    client.readContract({ ...V, functionName: 'totalInterest', ...o }),
    client.readContract({ ...V, functionName: 'overheadPrincipal', ...o }),
    client.readContract({ ...V, functionName: 'overheadInterest', ...o }),
    client.readContract({ ...V, functionName: 'overheadCash', ...o }),
    client.readContract({ ...V, functionName: 'groupPosition', ...o }),
    client.readContract({ ...V, functionName: 'groupCapacity', ...o }),
    client.readContract({ address: PRICE_FEED, abi: priceFeedAbi, functionName: 'fetchPrice', ...o }),
    client.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [VAULT], ...o }),
    client.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [OWNER], ...o }),
    client.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [VENDOR], ...o }),
    client.getBalance({ address: VAULT, ...o }),
    client.getBalance({ address: OWNER, ...o }),
  ]);

  const blockReads = await Promise.all(
    Array.from({ length: Number(blockCount) }, (_, i) =>
      client.readContract({ ...V, functionName: 'moneyblocks', args: [BigInt(i + 1)], ...o }),
    ),
  );
  const paymentReads = await Promise.all(
    Array.from({ length: Number(paymentCount) }, (_, i) =>
      client.readContract({ ...V, functionName: 'payments', args: [BigInt(i + 1)], ...o }),
    ),
  );

  // Payee allowlist from RecipientSet events. The last event for a block and payee wins, so the windows
  // are read in block order.
  const last = head.number ?? blockNumber ?? deployBlock;
  const logs = [];
  for (const [fromBlock, toBlock] of logWindows(deployBlock, last)) {
    logs.push(...(await client.getLogs({ address: VAULT, event: recipientSet, fromBlock, toBlock })));
  }
  const allowed = new Map<string, { addr: string; ok: boolean }>();
  for (const log of logs) {
    const { blockId, to, allowed: ok } = log.args;
    if (blockId === undefined || to === undefined) continue;
    allowed.set(`${blockId}:${to.toLowerCase()}`, { addr: to, ok: Boolean(ok) });
  }
  const payeesOf = (id: number): string[] =>
    [...allowed.entries()].filter(([key, v]) => v.ok && key.startsWith(`${id}:`)).map(([, v]) => v.addr);

  const blocks: BlockView[] = blockReads.map((r, i) => ({
    id: i + 1,
    name: r[0],
    cross: r[2],
    cash: r[3],
    reserved: r[4],
    debtCap: r[5],
    principal: r[6],
    interest: r[7],
    operator: r[8],
    mandateActive: r[9],
    expiry: r[10],
    perTxCap: r[11],
    totalCap: r[12],
    committed: r[13],
    spent: r[14],
    allowed: payeesOf(i + 1),
  }));

  const payments: PaymentView[] = paymentReads.map((p, i) => ({
    id: i + 1,
    blockId: Number(p[0]),
    to: p[1],
    amount: p[2],
    evidence: decodeEvidence(p[3]),
    status: Number(p[4]) as PaymentStatus,
  }));

  return {
    block: Number(head.number ?? 0n),
    timestamp: Number(head.timestamp),
    owner,
    troveActive,
    coll: position[0],
    principal: position[1],
    interest: position[2],
    capacity,
    price,
    ratioBps,
    threshold,
    groupsClosed: Number(groupsClosed),
    totalCash,
    totalPrincipal,
    totalInterest,
    overheadPrincipal,
    overheadInterest,
    overheadCash,
    vaultMusd,
    ownerMusd,
    vendorMusd,
    vaultBtc,
    ownerBtc,
    blocks,
    payments,
  };
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The public RPC sometimes answers a read with an empty result. A read is tried again, after a short pause.
export async function retryRead<T>(read: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= tries) throw err;
      await pause(600 * attempt);
    }
  }
}

// Revert data from a viem error chain. Nested errors keep it in `data`, or in `data.data`.
export function revertData(err: unknown): Hex | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = err;
  for (let depth = 0; depth < 10 && cur; depth++) {
    const d = cur.data;
    if (typeof d === 'string' && d.startsWith('0x')) return d as Hex;
    if (d && typeof d.data === 'string' && d.data.startsWith('0x')) return d.data as Hex;
    cur = cur.cause;
  }
  return undefined;
}

// Replays a refused transaction at the block before it was mined and decodes the revert.
export async function reasonFor(hash: Hex): Promise<Reason> {
  try {
    const tx = await retryRead(() => client.getTransaction({ hash }));
    if (!tx.to || tx.blockNumber === null) return { raw: 'transaction not mined' };
    try {
      await client.call({ account: tx.from, to: tx.to, data: tx.input, blockNumber: tx.blockNumber - 1n });
      return { raw: 'replay did not revert' };
    } catch (err) {
      const data = revertData(err);
      if (!data) return { raw: 'revert data not found' };
      try {
        const decoded = decodeErrorResult({ abi: vaultAbi, data });
        return { name: decoded.errorName, args: decoded.args ?? [] };
      } catch {
        return { raw: data.slice(0, 10) };
      }
    }
  } catch {
    return { raw: 'could not read the transaction' };
  }
}

// Checks one record row against its receipt. A refusal also gets its reason decoded.
export async function verifyRow(row: RecordRow): Promise<Verified> {
  try {
    const receipt = await retryRead(() => client.getTransactionReceipt({ hash: row.tx }));
    const chainStatus = receipt.status;
    const chainBlock = Number(receipt.blockNumber);
    const matches = chainBlock === row.block && (row.result === 'executed') === (chainStatus === 'success');
    const reason = chainStatus === 'reverted' ? await reasonFor(row.tx) : undefined;
    return { row, chainStatus, chainBlock, matches, reason };
  } catch {
    return { row, chainStatus: 'missing', matches: false };
  }
}
