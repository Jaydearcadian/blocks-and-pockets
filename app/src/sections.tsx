import {
  AGENT,
  BORROWER_OPERATIONS,
  MUSD,
  OWNER,
  PRICE_FEED,
  TROVE_MANAGER,
  VAULT,
  explorerAddress,
  explorerTx,
} from './config';
import {
  PAYMENT_STATUS_LABEL,
  PIPELINE,
  fmtAmount,
  fmtUtc,
  knownName,
  mandateState,
  paymentPath,
  pctOf,
  reasonText,
  shortAddr,
  type BlockView,
  type MandateState,
  type PaymentView,
  type RecordRow,
  type TieOut,
  type Verified,
} from './model';
import { Chip, Meter, Stack, type Tone } from './ui';

const STATUS_TONE: Record<PaymentView['status'], Tone> = { 0: 'muted', 1: 'warn', 2: 'ok', 3: 'muted' };

function MandateChip({ state }: { state: MandateState }) {
  const map: Record<MandateState, { tone: Tone; label: string }> = {
    none: { tone: 'muted', label: 'No mandate' },
    active: { tone: 'ok', label: 'Active' },
    revoked: { tone: 'bad', label: 'Revoked' },
    expired: { tone: 'warn', label: 'Expired' },
  };
  return <Chip tone={map[state].tone}>{map[state].label}</Chip>;
}

function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="figure">
      <span className="kicker">{label}</span>
      <strong>{value}</strong>
      <small className="muted">{unit}</small>
    </div>
  );
}

export function BlockCard({ block, nowSeconds, delay }: { block: BlockView; nowSeconds: number; delay: number }) {
  const state = mandateState(block, nowSeconds);
  const free = block.cash > block.reserved ? block.cash - block.reserved : 0n;
  const debt = block.principal + block.interest;
  const debtPct = pctOf(debt, block.debtCap);
  const lifetimePct = pctOf(block.committed, block.totalCap);
  return (
    <article className="card block-card" style={{ animationDelay: `${delay}ms` }}>
      <header className="block-head">
        <div>
          <p className="kicker">Block {block.id}</p>
          <h3>{block.name}</h3>
        </div>
        {block.cross ? <Chip tone="btc">Shared Trove</Chip> : <Chip tone="violet">Prefunded slice</Chip>}
      </header>

      <div className="figures">
        <Figure label="Cash" value={fmtAmount(block.cash)} unit="MUSD" />
        <Figure label="Reserved" value={fmtAmount(block.reserved)} unit="MUSD" />
        <Figure label="Free" value={fmtAmount(free)} unit="MUSD" />
      </div>
      <Stack
        parts={
          block.cash === 0n
            ? []
            : [
                { pct: pctOf(block.reserved, block.cash), tone: 'warn', label: 'Reserved' },
                { pct: pctOf(free, block.cash), tone: 'ok', label: 'Free' },
              ]
        }
      />

      {block.cross && (
        <div className="block-row">
          <div className="row-label">
            <span>Debt</span>
            <span className="num">
              {fmtAmount(debt)} of {fmtAmount(block.debtCap, 0)} cap
            </span>
          </div>
          <Meter pct={debtPct} tone={debtPct > 90 ? 'bad' : 'btc'} />
        </div>
      )}

      <div className="block-row">
        <div className="row-label">
          <span>Mandate</span>
          <MandateChip state={state} />
        </div>
        {state === 'none' ? (
          <p className="muted small">The owner directs this block. No agent can spend from it.</p>
        ) : (
          <>
            <dl className="facts">
              <div>
                <dt>Operator</dt>
                <dd title={block.operator}>{knownName(block.operator) ?? shortAddr(block.operator)}</dd>
              </div>
              <div>
                <dt>Per payment</dt>
                <dd className="num">{fmtAmount(block.perTxCap)} MUSD</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{fmtUtc(Number(block.expiry))}</dd>
              </div>
            </dl>
            <div className="row-label">
              <span>Lifetime used</span>
              <span className="num">
                {fmtAmount(block.committed)} of {fmtAmount(block.totalCap)}
              </span>
            </div>
            <Meter pct={lifetimePct} tone="violet" />
          </>
        )}
      </div>

      <div className="block-row">
        <span className="kicker">Allowed payees</span>
        {block.allowed.length === 0 ? (
          <p className="muted small">None</p>
        ) : (
          <ul className="payees">
            {block.allowed.map((a) => (
              <li key={a} title={a}>
                {knownName(a) ?? shortAddr(a)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function PaymentsTable({
  payments,
  blocks,
  threshold,
}: {
  payments: PaymentView[];
  blocks: BlockView[];
  threshold: bigint;
}) {
  if (payments.length === 0) return <p className="muted">No payments at this point.</p>;
  const names = new Map(blocks.map((b) => [b.id, b.name]));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Block</th>
            <th>Payee</th>
            <th className="num">Amount</th>
            <th>Path</th>
            <th>Status</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="muted">{p.id}</td>
              <td>{names.get(p.blockId) ?? `Block ${p.blockId}`}</td>
              <td title={p.to}>{knownName(p.to) ?? shortAddr(p.to)}</td>
              <td className="num">{fmtAmount(p.amount)} MUSD</td>
              <td>
                {paymentPath(p.amount, threshold) === 'owner' ? (
                  <Chip tone="warn">Owner approval</Chip>
                ) : (
                  <Chip tone="muted">Automatic</Chip>
                )}
              </td>
              <td>
                <Chip tone={STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Chip>
              </td>
              <td>
                <code>{p.evidence || '-'}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineSteps({ counts }: { counts: Record<number, number> }) {
  return (
    <ol className="pipeline">
      {PIPELINE.map((s, i) => {
        const step = i + 1;
        const n = counts[step] ?? 0;
        return (
          <li key={s.title} className="card pipe-step">
            <span className="pipe-num">{step}</span>
            <div>
              <h4>{s.title}</h4>
              <p className="muted small">{s.rule}</p>
              <p className={`small ${n > 0 ? 'refused-count' : 'muted'}`}>
                {n > 0 ? `${n} refused in the record` : 'No refusals in the record'}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VerifyChip({ v }: { v?: Verified }) {
  if (!v) return <span className="muted small">Checking</span>;
  if (v.matches) return <Chip tone="ok">Matches chain</Chip>;
  if (v.chainStatus === 'missing') return <Chip tone="warn">Not found</Chip>;
  return <Chip tone="bad">Mismatch</Chip>;
}

export function RecordTable({
  rows,
  verified,
  phases,
}: {
  rows: RecordRow[];
  verified: Record<string, Verified>;
  phases: { id: string; title: string }[];
}) {
  const phaseTitle = (id: string) => phases.find((p) => p.id === id)?.title ?? id;
  const matched = rows.filter((r) => verified[r.tx]?.matches).length;
  const refusals = rows.filter((r) => r.result === 'refused');
  const decoded = refusals.filter((r) => {
    const reason = verified[r.tx]?.reason;
    return reason !== undefined && 'name' in reason;
  }).length;
  return (
    <>
      <p className="summary-line">
        <Chip tone={matched === rows.length ? 'ok' : 'info'}>
          {matched} of {rows.length} transactions match the chain
        </Chip>
        <Chip tone={decoded === refusals.length ? 'ok' : 'info'}>
          {decoded} of {refusals.length} refusals decoded from chain data
        </Chip>
      </p>
      <div className="table-wrap">
        <table className="table record">
          <thead>
            <tr>
              <th>#</th>
              <th>Phase</th>
              <th>Step</th>
              <th>Result</th>
              <th className="num">Block</th>
              <th>Transaction</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const v = verified[row.tx];
              const reason = row.result === 'refused' ? reasonText(v?.reason) : undefined;
              return (
                <tr key={row.tx}>
                  <td className="muted">{i + 1}</td>
                  <td className="muted small">{phaseTitle(row.phase)}</td>
                  <td>{row.label}</td>
                  <td>
                    {row.result === 'executed' ? (
                      <Chip tone="ok">Executed</Chip>
                    ) : (
                      <span className="result-refused">
                        <Chip tone="bad">Refused</Chip>
                        <span className="reason">{reason ? reason.title : 'Decoding'}</span>
                      </span>
                    )}
                  </td>
                  <td className="num">{row.block.toLocaleString('en-US')}</td>
                  <td>
                    <a href={explorerTx(row.tx)} target="_blank" rel="noreferrer">
                      <code>{row.tx.slice(0, 10)}…</code>
                    </a>
                  </td>
                  <td>
                    <VerifyChip v={v} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TieOutList({ items }: { items: TieOut[] }) {
  const failing = items.filter((i) => !i.ok).length;
  return (
    <>
      <p className="summary-line">
        <Chip tone={failing === 0 ? 'ok' : 'bad'}>
          {failing === 0 ? `All ${items.length} checks pass` : `${failing} of ${items.length} checks failing`}
        </Chip>
      </p>
      <ul className="tieouts">
        {items.map((t) => (
          <li key={t.label} className="card tieout">
            <span className={`tick ${t.ok ? 'tick-ok' : 'tick-bad'}`} aria-hidden="true">
              {t.ok ? '✓' : '✕'}
            </span>
            <div>
              <p>{t.label}</p>
              <p className="muted small num">{t.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ContractList() {
  const items: { label: string; addr: string }[] = [
    { label: 'Vault (MoneyblocksVault)', addr: VAULT },
    { label: 'MUSD', addr: MUSD },
    { label: 'BorrowerOperations', addr: BORROWER_OPERATIONS },
    { label: 'TroveManager', addr: TROVE_MANAGER },
    { label: 'PriceFeed', addr: PRICE_FEED },
    { label: 'Owner (treasury)', addr: OWNER },
    { label: 'Agent (operator)', addr: AGENT },
  ];
  return (
    <ul className="contracts">
      {items.map((c) => (
        <li key={c.addr}>
          <span className="kicker">{c.label}</span>
          <a href={explorerAddress(c.addr)} target="_blank" rel="noreferrer">
            <code>{c.addr}</code>
          </a>
        </li>
      ))}
    </ul>
  );
}
