import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import demoRecord from './demo-record.json';
import { ActionsSection } from './ActionsPanel';
import { WalletProviders } from './WalletProviders';
import { CHAIN_ID, DEMO_VAULT, IS_DEMO_VAULT, RPC_URL, VAULT, VAULT_WARNING } from './config';
import { balancesSubtitle, vaultNotice } from './guide';
import { useNow, useSnapshot, useVaultStatus, useVerification } from './hooks';
import { BlockCard, ContractList, PaymentsTable, PipelineSteps, RecordTable, TieOutList } from './sections';
import { Glossary, StartHere } from './StartHere';
import { Callout, Chip, Kpi, Logo, Section, Spinner, Stack, type Tone } from './ui';
import { useWallet } from './useWallet';
import {
  collateralRatioBps,
  fmtAmount,
  fmtBtc,
  fmtRatio,
  groupDebt,
  pctOf,
  refusalSteps,
  tieOuts,
  type DemoRecord,
  type RecordRow,
  type Snapshot,
} from './model';
import { nextView, parseHash, viewHref, viewsFor, type View, type ViewId } from './views';

const demo = demoRecord as DemoRecord;
// The demo record describes the demo vault only. Other vaults show no record and no demo counts.
const DEMO_ROWS: RecordRow[] = IS_DEMO_VAULT ? demo.rows : [];

const VIEW_LIST = viewsFor(IS_DEMO_VAULT);

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function useView(): { view: ViewId; section?: string } {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  return parseHash(hash);
}

// Scrolls once per view or section change: to the top for a view, to the section for an old anchor once it renders.
function useScrollOnNavigate(view: ViewId, section: string | undefined, ready: boolean) {
  const done = useRef('');
  useEffect(() => {
    const key = `${view}|${section ?? ''}`;
    if (done.current === key) return;
    if (section) {
      const el = document.getElementById(section);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo({ top: 0 });
    }
    done.current = key;
  }, [view, section, ready]);
}

function scrollToSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

const VIEW_NOTES: Record<string, string> = {
  live: 'The vault as of the newest Mezo testnet block, which is after the demo. Refreshes every 20 seconds.',
  setup: 'Trove open, blocks funded, and an operator mandate on block 3. Payments above 1.00 MUSD wait for the owner.',
  repaid: 'Block 1 repays 10 MUSD of the group debt.',
  closed: 'The group Trove is closed. The vault still holds the returned BTC and the cash that is left.',
  swept: 'The leftover MUSD and the BTC go to the owner. The vault is empty.',
  revoked: "The owner revokes block 3's mandate. The operator key is refused from then on.",
};

// Opens on the first checkpoint. The demo has finished, so the newest block shows an empty vault.
// Another vault has no checkpoints, so it opens on the live view.
const DEFAULT_VIEW = IS_DEMO_VAULT ? 'setup' : 'live';

export default function DashboardApp() {
  return (
    <WalletProviders>
      <AppRoute />
    </WalletProviders>
  );
}

function AppRoute() {
  const status = useVaultStatus();
  if (status.state === 'ok') return <Dashboard />;
  return (
    <>
      <main className="app">
        <section className="hero hero-slim" id="top">
          <div className="hero-copy">
            <a className="back-link" href="#/">
              ← Blocks &amp; Pockets
            </a>
            <h1 id="hero-title">Vault check</h1>
          </div>
        </section>
        {status.state === 'checking' ? (
          <div className="card loading">
            <Spinner />
            <span>Checking that {shortVault(VAULT)} is a Blocks &amp; Pockets vault</span>
          </div>
        ) : (
          <Callout tone="bad" title="This is not a vault this page can open">
            {status.reason} Vault {VAULT}. The page reads nothing from it and offers no actions on it.{' '}
            <a href={`?vault=${DEMO_VAULT}`}>Open the demo vault instead.</a>
          </Callout>
        )}
      </main>
      <Footer />
    </>
  );
}

const shortVault = (a: string): string => `${a.slice(0, 8)}…${a.slice(-6)}`;

function Dashboard() {
  const [point, setPoint] = useState(DEFAULT_VIEW);
  const [refresh, setRefresh] = useState(0);
  const { view, section } = useView();
  const current = VIEW_LIST.find((v) => v.id === view) ?? VIEW_LIST[0];
  const next = nextView(view);
  const wallet = useWallet();
  const checkpoint = IS_DEMO_VAULT ? demo.checkpoints.find((c) => c.id === point) : undefined;
  const live = checkpoint === undefined;
  const { snap, error, checkedAt } = useSnapshot(checkpoint ? BigInt(checkpoint.block) : undefined, refresh);
  const verified = useVerification(DEMO_ROWS);
  const refusals = DEMO_ROWS.filter((r) => r.result === 'refused').length;
  const steps = refusalSteps(DEMO_ROWS, verified);
  const notice = vaultNotice(VAULT);
  useScrollOnNavigate(view, section, Boolean(snap));

  return (
    <div className="shell">
      <Sidebar view={current} live={live} snap={snap} failing={Boolean(error)} checkedAt={checkedAt} />
      <div className="shell-main">
        <header className="topbar">
          {IS_DEMO_VAULT && <CheckpointPicker point={point} onPick={setPoint} />}
          <div className="topbar-wallet">
            <ConnectButton label="Connect wallet" accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </header>
        <main className="app" aria-labelledby="hero-title">
          {view === 'overview' ? <Hero snap={snap} refusals={IS_DEMO_VAULT ? refusals : undefined} /> : <ViewHead view={current} />}
          {VAULT_WARNING && (
            <Callout tone="warn" title="Link adjusted">
              {VAULT_WARNING}
            </Callout>
          )}
          {view === 'overview' && notice && (
            <Callout tone="info" title={notice.title}>
              {notice.body}
              {notice.recordUrl && (
                <>
                  {' '}
                  <a href={notice.recordUrl} target="_blank" rel="noreferrer">
                    Read the full transaction list.
                  </a>
                </>
              )}
            </Callout>
          )}
          {view === 'overview' && <StartHere />}
          {view === 'overview' && IS_DEMO_VAULT && <Replay view={point} onPick={setPoint} />}
          {snap ? (
            <>
              {error && <Callout tone="warn" title="Latest read failed">Showing the last good read. Retrying.</Callout>}
              {view === 'overview' && (
                <>
                  <TroveSection snap={snap} />
                  <BalancesSection snap={snap} />
                </>
              )}
              {view === 'blocks' && (
                <>
                  <Section
                    id="blocks"
                    title="Blocks"
                    subtitle="Shared Trove blocks draw on the group debt. A prefunded slice holds its own MUSD, paid out only under its mandate."
                  >
                    <div className="block-grid">
                      {snap.blocks.map((b, i) => (
                        <BlockCard key={b.id} block={b} nowSeconds={snap.timestamp} delay={i * 80} />
                      ))}
                    </div>
                  </Section>
                  <Section
                    id="payments"
                    title="Payments"
                    subtitle={`Operator payments run through the same checks. Payments above ${fmtAmount(snap.threshold)} MUSD wait for the owner.`}
                  >
                    <PaymentsTable payments={snap.payments} blocks={snap.blocks} threshold={snap.threshold} />
                  </Section>
                </>
              )}
              {view === 'actions' && (
                <ActionsSection snap={snap} live={live} wallet={wallet} onDone={() => setRefresh((n) => n + 1)} />
              )}
              {view === 'verify' && (
                <>
                  <Section
                    id="guardrails"
                    title="Eight checks on every payment"
                    subtitle="In the order the contract runs them. A failed check stops the payment and reverts the transaction."
                  >
                    <PipelineSteps counts={IS_DEMO_VAULT ? steps : undefined} />
                  </Section>
                  {IS_DEMO_VAULT && (
                    <Section
                      id="record"
                      title="On-chain record"
                      subtitle="Every transaction in the demo. Each receipt is checked against Mezo, and each refusal reason is decoded from chain data."
                    >
                      <RecordTable rows={demo.rows} verified={verified} phases={demo.phases} />
                      <p className="muted small source-line">Source logs: {demo.sources.join(', ')}.</p>
                    </Section>
                  )}
                  <Section
                    id="tieouts"
                    title="Ledger tie-outs"
                    subtitle="Five checks that the vault's books agree with Mezo and with each other. They run on every read."
                  >
                    <TieOutList items={tieOuts(snap)} />
                  </Section>
                </>
              )}
              {view === 'reference' && (
                <>
                  <Glossary />
                  <Section id="contracts" title="Contracts" subtitle={`Mezo testnet, chain ${CHAIN_ID}. Explorer links open in a new tab.`}>
                    <ContractList owner={snap.owner} isDemo={IS_DEMO_VAULT} />
                  </Section>
                </>
              )}
            </>
          ) : (
            <Loading error={error} block={checkpoint?.block} />
          )}
          {next && (
            <a className="pager" href={viewHref(next.id)}>
              <span className="pager-label">Next</span>
              <strong>
                {next.title} <span aria-hidden="true">→</span>
              </strong>
              <span className="pager-blurb">{next.blurb}</span>
            </a>
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
}

function ViewHead({ view }: { view: View }) {
  return (
    <section className="view-head" id="top">
      <h1 id="hero-title">{view.title}</h1>
      <p className="lead">{view.blurb}</p>
    </section>
  );
}

function CheckpointPicker({ point, onPick }: { point: string; onPick: (id: string) => void }) {
  return (
    <label className="point-picker">
      <span>Viewing</span>
      <select value={point} onChange={(e) => onPick(e.target.value)}>
        <option value="live">Live, newest block</option>
        {demo.checkpoints.map((c, i) => (
          <option key={c.id} value={c.id}>
            Step {i + 1}: {c.label} (block {c.block.toLocaleString('en-US')})
          </option>
        ))}
      </select>
    </label>
  );
}

function Sidebar({
  view,
  live,
  snap,
  failing,
  checkedAt,
}: {
  view: View;
  live: boolean;
  snap?: Snapshot;
  failing: boolean;
  checkedAt?: number;
}) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#/">
        <Logo />
        <span className="brand-text">
          <strong>Blocks &amp; Pockets</strong>
          <small>Testnet dashboard</small>
        </span>
      </a>
      <nav className="nav" aria-label="Dashboard views">
        {VIEW_LIST.map((v) => {
          const on = v.id === view.id;
          return (
            <div key={v.id} className="nav-group">
              <a href={viewHref(v.id)} aria-current={on ? 'page' : undefined}>
                {v.label}
              </a>
              {on && v.sections.length > 1 && (
                <div className="nav-sub">
                  {v.sections.map((s) => (
                    <a key={s.id} href={`#${s.id}`} onClick={(e) => scrollToSection(e, s.id)}>
                      {s.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="status">
        {live ? (
          <span className="live">
            <span className="dot" aria-hidden="true" />
            Live
          </span>
        ) : (
          <Chip tone="violet">Replay</Chip>
        )}
        {snap && <Chip tone="muted">Block {snap.block.toLocaleString('en-US')}</Chip>}
        <Updated live={live} failing={failing} checkedAt={checkedAt} />
      </div>
    </aside>
  );
}

function Updated({ live, failing, checkedAt }: { live: boolean; failing: boolean; checkedAt?: number }) {
  const now = useNow();
  if (!live) return <span className="muted small">Fixed checkpoint</span>;
  if (failing) return <Chip tone="warn">Retrying</Chip>;
  if (checkedAt === undefined) {
    return (
      <span className="muted small">
        <Spinner /> Reading
      </span>
    );
  }
  const secs = Math.max(0, Math.round((now - checkedAt) / 1000));
  return <span className="muted small">Checked {secs < 90 ? `${secs}s` : `${Math.round(secs / 60)}m`} ago</span>;
}

function Hero({ snap, refusals }: { snap?: Snapshot; refusals?: number }) {
  const debt = snap ? groupDebt(snap) : undefined;
  const ratio = snap ? collateralRatioBps(snap.coll, snap.price, groupDebt(snap)) : null;
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="kicker accent">Mezo testnet · testnet only</p>
        <h1 id="hero-title">Vault overview</h1>
        <p className="lead">
          One Bitcoin-backed loan, split into blocks of spending money. An operator key spends from its block only inside
          the owner&apos;s limits, and the owner can revoke that key at any time.
        </p>
        <p className="muted small">
          Every number here is read from Mezo testnet at the block shown. The Actions view sends owner and operator
          transactions from a connected testnet wallet, and each one is checked with Mezo first.
        </p>
      </div>
      <div className="hero-stats">
        <Kpi label="Group debt" value={debt === undefined ? 'n/a' : fmtAmount(debt)} unit="MUSD" delay={0} />
        <Kpi label="Collateral ratio" value={fmtRatio(ratio)} delay={60} />
        <Kpi
          label="Cash in blocks"
          value={snap ? fmtAmount(snap.totalCash) : 'n/a'}
          unit="MUSD"
          note="Tracked by the vault"
          delay={120}
        />
        {refusals !== undefined && (
          <Kpi label="Refusals on record" value={String(refusals)} note="Each one decoded from chain data" delay={180} />
        )}
      </div>
    </section>
  );
}

function Replay({ view, onPick }: { view: string; onPick: (id: string) => void }) {
  return (
    <section className="replay" aria-label="Choose a view">
      <div className="replay-buttons" role="group" aria-label="Views">
        <button type="button" className="step-btn" aria-pressed={view === 'live'} onClick={() => onPick('live')}>
          <span className="step-index">Live</span>
          <span className="step-title">Newest block</span>
          <span className="step-sub">Updates every 20 seconds</span>
        </button>
        {demo.checkpoints.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="step-btn"
            aria-pressed={view === c.id}
            onClick={() => onPick(c.id)}
          >
            <span className="step-index">Step {i + 1}</span>
            <span className="step-title">{c.label}</span>
            <span className="step-sub">Block {c.block.toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>
      <p className="replay-note">{VIEW_NOTES[view]}</p>
    </section>
  );
}

function TroveSection({ snap }: { snap: Snapshot }) {
  const debt = groupDebt(snap);
  const ratio = collateralRatioBps(snap.coll, snap.price, debt);
  const room = snap.capacity > debt ? snap.capacity - debt : 0n;
  const parts: { pct: number; tone: Tone; label: string; amount: bigint }[] = [
    ...snap.blocks
      .filter((b) => b.principal > 0n)
      .map((b) => ({
        pct: pctOf(b.principal, snap.principal),
        tone: b.cross ? ('btc' as const) : ('violet' as const),
        label: b.name,
        amount: b.principal,
      })),
    {
      pct: pctOf(snap.overheadPrincipal, snap.principal),
      tone: 'info',
      label: 'Gas deposit and overhead',
      amount: snap.overheadPrincipal,
    },
  ];
  return (
    <Section
      id="trove"
      title="One shared Trove"
      subtitle="The group borrows once against Bitcoin. The vault tracks each block's share of the debt."
    >
      <p className="summary-line">
        <Chip tone={snap.troveActive ? 'ok' : 'muted'}>{snap.troveActive ? 'Trove open' : 'Trove closed'}</Chip>
        <Chip tone="muted">Oracle price {fmtAmount(snap.price, 0)} USD per BTC</Chip>
      </p>
      <div className="kpi-grid">
        <Kpi label="Collateral" value={fmtBtc(snap.coll)} unit="BTC" delay={0} />
        <Kpi label="Collateral ratio" value={fmtRatio(ratio)} note={`Target ${fmtRatio(snap.ratioBps)}`} delay={60} />
        <Kpi label="Group debt" value={fmtAmount(debt)} unit="MUSD" note="Principal plus Mezo interest" delay={120} />
        <Kpi
          label="Room to borrow"
          value={fmtAmount(room)}
          unit="MUSD"
          note={`Capacity ${fmtAmount(snap.capacity)} MUSD at target`}
          delay={180}
        />
      </div>
      <div className="card debt-card">
        <div className="row-label">
          <span>Principal by block</span>
          <span className="num">{fmtAmount(snap.principal)} MUSD</span>
        </div>
        <Stack parts={parts} />
        <ul className="legend">
          {parts.map((p) => (
            <li key={p.label}>
              <span className={`swatch meter-${p.tone}`} aria-hidden="true" />
              {p.label}
              <span className="num">{fmtAmount(p.amount)} MUSD</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function BalancesSection({ snap }: { snap: Snapshot }) {
  const cards = [
    { label: 'Vault MUSD', value: fmtAmount(snap.vaultMusd), unit: 'MUSD', note: `Tracked cash ${fmtAmount(snap.totalCash)} MUSD` },
    { label: 'Owner MUSD', value: fmtAmount(snap.ownerMusd), unit: 'MUSD', note: 'Treasury wallet' },
    ...(IS_DEMO_VAULT
      ? [{ label: 'Vendor MUSD', value: fmtAmount(snap.vendorMusd), unit: 'MUSD', note: 'Test payee' }]
      : []),
    { label: 'Vault BTC', value: fmtBtc(snap.vaultBtc), unit: 'BTC', note: 'Collateral returned at close' },
    { label: 'Owner BTC', value: fmtBtc(snap.ownerBtc), unit: 'BTC', note: 'Treasury wallet, test BTC' },
  ];
  return (
    <Section id="balances" title="Balances" subtitle={balancesSubtitle(IS_DEMO_VAULT)}>
      <div className="kpi-grid">
        {cards.map((c, i) => (
          <Kpi key={c.label} label={c.label} value={c.value} unit={c.unit} note={c.note} delay={i * 60} />
        ))}
      </div>
    </Section>
  );
}

function Loading({ error, block }: { error?: string; block?: number }) {
  if (error) {
    return (
      <Callout tone="bad" title="Could not read Mezo testnet">
        {error}. Retrying.
      </Callout>
    );
  }
  return (
    <div className="card loading">
      <Spinner />
      <span>Reading the vault{block ? ` at block ${block.toLocaleString('en-US')}` : ''}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p>Blocks &amp; Pockets · testnet prototype · no real funds</p>
      <p className="small">
        Reads and wallet actions go through Mezo testnet (chain {CHAIN_ID}, {RPC_URL}). No mainnet, no real funds.
      </p>
    </footer>
  );
}
