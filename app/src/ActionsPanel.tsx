import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import type { Address } from 'viem';
import { client } from './chain';
import { explorerTx } from './config';
import {
  ACTIONS,
  actionById,
  blockChoices,
  complete,
  gateReason,
  initialValues,
  isOwner,
  operatorBlocks,
  prepare,
  reviewOf,
  settled,
  type ActionDef,
  type ActionId,
  type Call,
  type Ctx,
  type Field,
  type Review,
  type Values,
} from './actions';
import { OwnVault } from './OwnVault';
import { Callout, Chip, Section } from './ui';
import { fmtAmount, knownName, mandateState, shortAddr, type BlockView, type Snapshot } from './model';
import { runCall, type Outcome } from './txflow';
import { messageOf, walletFor, type WalletState } from './wallet';

// Owner actions, grouped for the page. Operator actions are listed on their own.
const OWNER_GROUPS: { title: string; ids: ActionId[] }[] = [
  {
    title: 'Blocks and mandates',
    ids: ['createBlock', 'setPayee', 'grantMandate', 'revokeMandate', 'fundPocket', 'fundOverhead', 'setThreshold'],
  },
  { title: 'Shared Trove', ids: ['openGroup', 'addCollateral', 'borrow', 'repay', 'accrue', 'closeGroup'] },
  { title: 'Sweeps and recovery', ids: ['sweepResidual', 'sweepBtc', 'recoverMusd'] },
];

type Shown = Outcome | { kind: 'invalid'; text: string } | { kind: 'dismissed' };
type Run = { title: string; busy: boolean; steps: string[]; shown?: Shown };

// A valid action waiting for the user to confirm or cancel. It holds the call that will be sent.
type Pending = { def: ActionDef; values: Values; call: Call; review: Review; account?: Address };

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

export function ActionsSection({
  snap,
  live,
  wallet,
  onDone,
}: {
  snap: Snapshot;
  live: boolean;
  wallet: WalletState;
  onDone: () => void;
}) {
  const [run, setRun] = useState<Run>();
  const [pending, setPending] = useState<Pending>();
  const ctx: Ctx = { snap, account: wallet.account, nowSeconds: Math.floor(Date.now() / 1000) };
  const busy = run?.busy === true;
  const owner = wallet.connected && isOwner(ctx);
  const ops = operatorBlocks(ctx);
  const canAct = live && wallet.onTestnet && wallet.provider !== undefined && wallet.account !== undefined && !busy;
  // A review belongs to the wallet that opened it. Switching wallets drops it.
  const reviewing = pending && pending.account === wallet.account ? pending : undefined;

  // Validation failures stop here. A valid action waits in a review until the user confirms it.
  function reviewAction(def: ActionDef, values: Values) {
    let call: Call;
    try {
      call = prepare(def, values, ctx);
    } catch (err) {
      setPending(undefined);
      setRun({ title: def.title, busy: false, steps: [], shown: { kind: 'invalid', text: messageOf(err) } });
      return;
    }
    setPending({ def, values, call, review: reviewOf(def, values, ctx, call), account: wallet.account });
  }

  function cancelReview() {
    if (!reviewing) return;
    setPending(undefined);
    setRun({ title: reviewing.def.title, busy: false, steps: [], shown: { kind: 'dismissed' } });
  }

  // Sends the call the review showed. Nothing is sent before this.
  function confirmReview() {
    if (!reviewing) return;
    const { def, call } = reviewing;
    setPending(undefined);
    if (!canAct) {
      setRun({
        title: def.title,
        busy: false,
        steps: [],
        shown: { kind: 'refused', text: 'The wallet is not ready on Mezo testnet' },
      });
      return;
    }
    void execute(def, call);
  }

  async function execute(def: ActionDef, call: Call) {
    const { provider, account } = wallet;
    if (!provider || !account) return;
    setRun({ title: def.title, busy: true, steps: [] });
    const outcome = await runCall(
      {
        publicClient: client,
        wallet: walletFor(provider, account),
        account,
        step: (text) => setRun((prev) => (prev ? { ...prev, steps: [...prev.steps, text] } : prev)),
      },
      call,
    );
    setRun({ title: def.title, busy: false, steps: [], shown: outcome });
    if (outcome.kind === 'confirmed' || outcome.kind === 'reverted') onDone();
  }

  const payments = snap.payments.filter((p) => p.status === 1);
  const reviewFor = (def: ActionDef) => (reviewing?.def.id === def.id ? reviewing : undefined);
  const cardFor = (def: ActionDef) => (
    <ActionCard
      key={`${def.id}-${wallet.account ?? 'none'}`}
      def={def}
      ctx={ctx}
      canAct={canAct}
      review={reviewFor(def)}
      onReview={(values) => reviewAction(def, values)}
      onConfirm={confirmReview}
      onCancel={cancelReview}
      onEdit={() => setPending((p) => (p?.def.id === def.id ? undefined : p))}
    />
  );

  return (
    <Section id="actions">
      <WalletBar wallet={wallet} ctx={ctx} />
      {!owner && ops.length === 0 && <OwnVault wallet={wallet} />}
      {!live && (
        <Callout tone="info" title="Viewing a past checkpoint">
          Switch to Live to act on the vault. Checkpoints are read-only.
        </Callout>
      )}
      {wallet.connected && !wallet.onTestnet && (
        <Callout tone="warn" title="Wrong network">
          Switch the wallet to Mezo testnet before acting.
        </Callout>
      )}
      {run && <RunStatus run={run} />}

      <div className="action-columns">
        <div className="action-column">
          <h3>Owner</h3>
          <p className="muted small">{owner ? 'The connected wallet is the owner.' : 'Connect the owner wallet to use these.'}</p>
          <div className="action-group">
            <h4>Waiting for approval</h4>
            {payments.length === 0 ? (
              <p className="muted small">No payment is waiting for the owner.</p>
            ) : (
              <ul className="pending-list">
                {payments.map((p) => (
                  <Fragment key={p.id}>
                  <li className="pending-row">
                    <span className="num">#{p.id}</span>
                    <span>{snap.blocks.find((b) => b.id === p.blockId)?.name ?? `Block ${p.blockId}`}</span>
                    <span title={p.to}>{knownName(p.to) ?? shortAddr(p.to)}</span>
                    <span className="num">{fmtAmount(p.amount)} MUSD</span>
                    <span className="pending-actions">
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        disabled={!canAct || !owner}
                        onClick={() => reviewAction(actionById('approvePayment'), { payment: String(p.id) })}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={!canAct || !owner}
                        onClick={() => reviewAction(actionById('cancelPayment'), { payment: String(p.id) })}
                      >
                        Cancel
                      </button>
                    </span>
                  </li>
                  {reviewing &&
                    (reviewing.def.id === 'approvePayment' || reviewing.def.id === 'cancelPayment') &&
                    reviewing.values.payment === String(p.id) && (
                      <li className="pending-review">
                        <ReviewBox pending={reviewing} canAct={canAct} onConfirm={confirmReview} onCancel={cancelReview} />
                      </li>
                    )}
                  </Fragment>
                ))}
              </ul>
            )}
          </div>
          {OWNER_GROUPS.map((group) => (
            <div className="action-group" key={group.title}>
              <h4>{group.title}</h4>
              {group.ids.map((id) => cardFor(actionById(id)))}
            </div>
          ))}
        </div>

        <div className="action-column">
          <h3>Operator</h3>
          <p className="muted small">
            {ops.length > 0
              ? `This wallet operates block${ops.length > 1 ? 's' : ''} ${ops.map((b) => b.id).join(', ')}.`
              : 'Connect the operator wallet of a block to request payments.'}
          </p>
          <div className="action-group">
            <h4>Payments</h4>
            {ACTIONS.filter((a) => a.role === 'operator').map((def) => cardFor(def))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function WalletBar({ wallet, ctx }: { wallet: WalletState; ctx: Ctx }) {
  if (!wallet.connected) {
    return (
      <div className="card wallet-bar">
        <div className="wallet-text">
          <p className="kicker">Wallet</p>
          <p>Connect a wallet on Mezo testnet. Owner and operator actions show up once the wallet has a role.</p>
          {wallet.error && <p className="error-text">{wallet.error}</p>}
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void wallet.connect()} disabled={wallet.busy}>
          {wallet.busy ? 'Connecting…' : 'Connect wallet'}
        </button>
      </div>
    );
  }
  const roles: ReactNode[] = [];
  if (isOwner(ctx)) roles.push(<Chip key="owner" tone="btc">Owner</Chip>);
  const ops = operatorBlocks(ctx);
  if (ops.length > 0) {
    roles.push(
      <Chip key="operator" tone="violet">
        Operator of block {ops.map((b) => b.id).join(', ')}
      </Chip>,
    );
  }
  if (roles.length === 0) roles.push(<Chip key="none" tone="muted">No role on this vault</Chip>);
  return (
    <div className="card wallet-bar">
      <div className="wallet-text">
        <p className="kicker">Connected</p>
        <p>
          <code title={wallet.account}>{wallet.account}</code>
        </p>
        <div className="chips">
          {roles}
          {wallet.onTestnet ? <Chip tone="ok">Mezo testnet</Chip> : <Chip tone="bad">Not on Mezo testnet</Chip>}
        </div>
        {wallet.error && <p className="error-text">{wallet.error}</p>}
      </div>
      {!wallet.onTestnet && (
        <button className="btn btn-primary" type="button" onClick={() => void wallet.switchNetwork()} disabled={wallet.busy}>
          Switch to Mezo testnet
        </button>
      )}
    </div>
  );
}

function RunStatus({ run }: { run: Run }) {
  if (run.busy) {
    return (
      <div className="card run-status" role="status">
        <p className="kicker">{run.title}</p>
        <ol className="run-steps">
          {run.steps.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      </div>
    );
  }
  const shown = run.shown;
  if (!shown) return null;
  const tx = 'hash' in shown ? (
    <p className="small">
      Transaction{' '}
      <a href={explorerTx(shown.hash)} target="_blank" rel="noreferrer">
        {shortHash(shown.hash)}
      </a>
    </p>
  ) : null;
  switch (shown.kind) {
    case 'confirmed':
      return (
        <Callout tone="ok" title={`${run.title}: confirmed in block ${shown.block.toString()}`}>
          {tx}
        </Callout>
      );
    case 'reverted':
      return (
        <Callout tone="bad" title={`${run.title}: reverted on chain`}>
          <span>{shown.text}.</span> {tx}
        </Callout>
      );
    case 'refused':
      return (
        <Callout tone="warn" title={`${run.title}: refused before sending`}>
          <span>{shown.text}.</span> Nothing was sent.
        </Callout>
      );
    case 'invalid':
      return (
        <Callout tone="warn" title={`${run.title}: check the form`}>
          <span>{shown.text}.</span> Nothing was sent.
        </Callout>
      );
    case 'dismissed':
      return (
        <Callout tone="muted" title={`${run.title}: review cancelled`}>
          Nothing was sent.
        </Callout>
      );
    case 'cancelled':
      return (
        <Callout tone="muted" title={`${run.title}: cancelled in the wallet`}>
          Nothing was sent.
        </Callout>
      );
    case 'failed':
      return (
        <Callout tone="bad" title={`${run.title}: not confirmed`}>
          <span>{shown.text}.</span>
        </Callout>
      );
  }
}

function ActionCard({
  def,
  ctx,
  canAct,
  review,
  onReview,
  onConfirm,
  onCancel,
  onEdit,
}: {
  def: ActionDef;
  ctx: Ctx;
  canAct: boolean;
  review?: Pending;
  onReview: (values: Values) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const [raw, setRaw] = useState<Values>(() => initialValues(def, ctx));
  const values = settled(def, ctx, raw);
  const gate = gateReason(def, ctx);
  const ready = complete(def, values);
  const blocked = !canAct || gate !== undefined || !ready;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!blocked) onReview(values);
  };
  const reviewText = ready ? safeDescribe(def, values) : undefined;

  return (
    <details className="action">
      <summary>
        <span className="action-title">{def.title}</span>
        {gate && <span className="action-gate">{gate}</span>}
      </summary>
      <form className="action-body" onSubmit={submit}>
        <p className="muted small">{def.summary}</p>
        {def.fields.map((field) => (
          <FieldInput
            key={field.name}
            id={`${def.id}-${field.name}`}
            field={field}
            value={values[field.name] ?? ''}
            hint={hintFor(def, field, values, ctx)}
            choices={field.kind === 'block' ? blockChoices(def, ctx, field) : undefined}
            onChange={(next) => {
              onEdit();
              setRaw((prev) => ({ ...settled(def, ctx, prev), [field.name]: next }));
            }}
          />
        ))}
        {reviewText && <p className="review">{reviewText}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={blocked}>
            {def.button}
          </button>
          {!ready && gate === undefined && <span className="muted small">Fill in every field.</span>}
        </div>
      </form>
      {review && <ReviewBox pending={review} canAct={canAct} onConfirm={onConfirm} onCancel={onCancel} />}
    </details>
  );
}

// The step between the form and the wallet. It names the sender, the block, and what the call does.
function ReviewBox({
  pending,
  canAct,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  canAct: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const r = pending.review;
  return (
    <div className="card review-box" role="region" aria-label="Review before signing">
      <p className="kicker">Review before signing: {r.title}</p>
      <dl className="review-rows">
        <dt>Sent from</dt>
        <dd>
          {r.sender}
          {r.account && (
            <>
              {' · '}
              <code>{r.account}</code>
            </>
          )}
        </dd>
        <dt>Vault</dt>
        <dd>
          <code>{r.vault}</code>
        </dd>
        <dt>Block</dt>
        <dd>{r.block ?? 'None. This action is vault-wide.'}</dd>
        <dt>Action</dt>
        <dd>{r.summary}</dd>
        {r.notes.map((note) => (
          <Fragment key={note}>
            <dt>Also</dt>
            <dd>{note}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={!canAct}>
          Confirm and sign
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <span className="muted small">Nothing is sent until you confirm.</span>
      </div>
    </div>
  );
}

function safeDescribe(def: ActionDef, values: Values): string | undefined {
  try {
    return def.describe(values);
  } catch {
    return undefined;
  }
}

// Extra help under a field. For payments it names the payees the chosen block allows, and it warns when the
// mandate is not active, because the contract will refuse the request.
function hintFor(def: ActionDef, field: Field, values: Values, ctx: Ctx): string | undefined {
  if (def.id === 'requestTransfer') {
    const block = ctx.snap.blocks.find((b) => String(b.id) === values.block);
    if (block && field.name === 'payee') {
      return block.allowed.length > 0
        ? `Allowed on block ${block.id}: ${block.allowed.map((a) => knownName(a) ?? shortAddr(a)).join(', ')}`
        : `Block ${block.id} has no allowed payees yet.`;
    }
    if (block && field.name === 'block') {
      const state = mandateState(block, ctx.nowSeconds);
      if (state !== 'active') return `Block ${block.id}'s mandate is ${state}. The contract will refuse this request.`;
    }
  }
  return field.hint;
}

function FieldInput({
  id,
  field,
  value,
  hint,
  choices,
  onChange,
}: {
  id: string;
  field: Field;
  value: string;
  hint?: string;
  choices?: BlockView[];
  onChange: (value: string) => void;
}) {
  const label = <label htmlFor={id}>{field.label}</label>;
  let control: ReactNode;
  switch (field.kind) {
    case 'block':
      control = (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {(choices ?? []).length === 0 && <option value="">No eligible block</option>}
          {(choices ?? []).map((b) => (
            <option key={b.id} value={String(b.id)}>
              {`Block ${b.id} · ${b.name} · ${b.cross ? 'shared' : 'prefunded'}`}
            </option>
          ))}
        </select>
      );
      break;
    case 'choice':
      control = (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'amount':
      control = (
        <div className="amount-input">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span>{field.unit}</span>
        </div>
      );
      break;
    case 'address':
      control = (
        <input
          id={id}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="0x…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'expiry':
      control = (
        <input id={id} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case 'name':
      control = (
        <input
          id={id}
          type="text"
          maxLength={40}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'evidence':
      control = (
        <input
          id={id}
          type="text"
          maxLength={32}
          autoComplete="off"
          placeholder="INV-2041"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'payment':
      control = null;
      break;
  }
  if (control === null) return null;
  return (
    <div className="field">
      {label}
      {control}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
