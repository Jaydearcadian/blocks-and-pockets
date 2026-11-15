import { Logo } from './ui';
import { PIPELINE } from './model';
import { FAUCET_URL } from './guide';
import { LIVE_RUN_DEPLOY_BLOCK, LIVE_RUN_VAULT } from './config';

const REPO = 'https://github.com/Jaydearcadian/blocks-and-pockets';
const RECORD = `${REPO}/blob/main/logs/live-run/transactions.md`;
const LIVE_RUN_LINK = `?vault=${LIVE_RUN_VAULT}&from=${LIVE_RUN_DEPLOY_BLOCK}`;

export const PROOF: { value: string; label: string; note?: string }[] = [
  { value: '113', label: 'transactions on Mezo testnet' },
  { value: '58', label: 'succeeded' },
  { value: '55', label: 'refused on purpose', note: 'each reason decoded from chain data' },
  { value: '26 / 30', label: 'custom errors reached' },
  { value: '15 / 15', label: 'checker claims confirmed', note: 'a read-only script, run by anyone' },
];

const STEPS = [
  {
    title: 'Borrow once',
    body: 'The vault opens one Mezo Trove: BTC collateral, MUSD debt. One loan, one collateral ratio to watch.',
  },
  {
    title: 'Split it into blocks',
    body: 'A shared block draws on the group debt. A prefunded pocket holds its own MUSD. Each keeps its own books.',
  },
  {
    title: 'Spend inside the limits',
    body: 'The owner gives an operator key a mandate on one block: per-payment cap, lifetime cap, expiry, allowed payees.',
  },
];

function Window({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-window" aria-hidden="true">
      <div className="lp-window-bar">
        <span /> <span /> <span />
        <em>Blocks &amp; Pockets · illustration</em>
      </div>
      <div className="lp-window-body">{children}</div>
    </div>
  );
}

function LoanBar() {
  const parts = [
    { w: 38, cls: 'a', label: 'Procurement' },
    { w: 27, cls: 'b', label: 'Operations' },
    { w: 22, cls: 'c', label: 'Vendor pocket' },
    { w: 13, cls: 'd', label: 'Gas' },
  ];
  return (
    <div className="lp-loan">
      <p className="lp-loan-title">One Trove, split into blocks</p>
      <div className="lp-bar">
        {parts.map((p) => (
          <span key={p.label} className={`lp-seg lp-seg-${p.cls}`} style={{ width: `${p.w}%` }}>
            {p.label}
          </span>
        ))}
      </div>
      <div className="lp-pay">
        <div>
          <strong>Pay vendor</strong>
          <span>Vendor pocket · operator key</span>
        </div>
        <span className="lp-pill lp-pill-ok">Executed</span>
      </div>
      <div className="lp-pay lp-pay-refused">
        <div>
          <strong>Pay unknown address</strong>
          <span>Vendor pocket · operator key</span>
        </div>
        <span className="lp-stamp">Refused · payee not on allowlist</span>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="#/">
          <Logo />
          <strong>Blocks &amp; Pockets</strong>
        </a>
        <nav aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <a href="#checks">Checks</a>
          <a href="#status">Status</a>
        </nav>
        <a className="lp-btn lp-btn-primary" href="#/app">
          Open the dashboard
        </a>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-kicker">Mezo testnet · MUSD · testnet only</p>
            <h1>
              One Bitcoin-backed loan.
              <br />
              <span>Many blocks of spending money.</span>
            </h1>
            <p className="lp-lead">
              Borrow MUSD once against Bitcoin, then give each block its own cash, caps and allowed payees. An operator
              key can spend from its block only inside the owner&apos;s limits, and the owner can revoke that key at any
              time.
            </p>
            <div className="lp-cta">
              <a className="lp-btn lp-btn-primary" href="#/app">
                Open the dashboard
              </a>
              <a className="lp-btn lp-btn-ghost" href={REPO} target="_blank" rel="noreferrer">
                View the code
              </a>
            </div>
            <p className="lp-fine">A testnet prototype. Not audited. Not for user funds.</p>
          </div>
          <Window>
            <LoanBar />
          </Window>
        </section>

        <section className="lp-section" id="how">
          <p className="lp-kicker">How it works</p>
          <h2>Borrow once. Split it. Spend inside the limits.</h2>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="lp-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-proof" id="proof">
          <p className="lp-kicker">Run live on Mezo testnet</p>
          <h2>Tried on a real chain. Most of the refusals were the point.</h2>
          <div className="lp-stats">
            {PROOF.map((p) => (
              <div key={p.label} className="lp-stat">
                <strong>{p.value}</strong>
                <span>{p.label}</span>
                {p.note && <em>{p.note}</em>}
              </div>
            ))}
          </div>
          <p className="lp-fine">
            Liquidation was not run on chain. The Foundry and dashboard tests are simulations.{' '}
            <a href={RECORD} target="_blank" rel="noreferrer">
              Read all 113 transactions
            </a>
            {' · '}
            <a href={LIVE_RUN_LINK}>See the live-run vault in the dashboard</a>
          </p>
        </section>

        <section className="lp-section" id="checks">
          <p className="lp-kicker">Guardrails</p>
          <h2>Eight checks on every payment, in this order.</h2>
          <ol className="lp-checks">
            {PIPELINE.map((c, i) => (
              <li key={c.title}>
                <span className="lp-num">{i + 1}</span>
                <div>
                  <strong>{c.title}</strong>
                  <p>{c.rule}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="lp-fine">A failed check stops the payment and reverts the transaction.</p>
        </section>

        <section className="lp-section" id="status">
          <p className="lp-kicker">Honest status</p>
          <h2>A testnet prototype, said plainly.</h2>
          <div className="lp-status">
            <div className="lp-card">
              <h3>Working now</h3>
              <ul>
                <li>Vault contract with 40 Foundry tests</li>
                <li>Live run on Mezo testnet, checked by a read-only script</li>
                <li>Hosted dashboard that reads every number from Mezo</li>
                <li>Deploy your own vault from a testnet wallet</li>
              </ul>
            </div>
            <div className="lp-card lp-card-not">
              <h3>Not yet</h3>
              <ul>
                <li>No audit and no mainnet deployment</li>
                <li>Liquidation not run on chain</li>
                <li>Wallet flow not tried with a consumer wallet</li>
                <li>Name is a working name, not trademark-cleared</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-final">
          <h2>See every number, straight from the chain.</h2>
          <p>
            Open the dashboard to read the vault, its blocks and every payment. Need test BTC? The{' '}
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              Mezo testnet faucet
            </a>{' '}
            has it.
          </p>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href="#/app">
            Open the dashboard
          </a>
        </section>
      </main>

      <footer className="lp-footer">
        <span>Blocks &amp; Pockets · testnet prototype · no real funds</span>
        <span>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          {' · '}
          <a href={RECORD} target="_blank" rel="noreferrer">
            Live-run record
          </a>
        </span>
      </footer>
    </div>
  );
}
