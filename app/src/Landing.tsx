import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { getAddress, isAddress } from 'viem';
import { Logo } from './ui';
import { PIPELINE } from './model';
import { FAUCET_URL } from './guide';
import { LIVE_RUN_DEPLOY_BLOCK, LIVE_RUN_VAULT } from './config';

const REPO = 'https://github.com/Jaydearcadian/blocks-and-pockets';
const RECORD = `${REPO}/blob/main/logs/live-run/transactions.md`;
const THREAT_MODEL = `${REPO}/blob/main/docs/THREAT-MODEL.md`;
const EXPLORER = 'https://explorer.test.mezo.org';
const LIVE_RUN_LINK = `?vault=${LIVE_RUN_VAULT}&from=${LIVE_RUN_DEPLOY_BLOCK}`;

export const PROOF: { value: string; label: string; note?: string }[] = [
  { value: '113', label: 'transactions on Mezo testnet' },
  { value: '58', label: 'succeeded' },
  { value: '55', label: 'refused on purpose', note: 'each reason decoded from chain data' },
  { value: '26 / 30', label: 'custom errors reached' },
  { value: '15 / 15', label: 'checker claims confirmed', note: 'a read-only script, run by anyone' },
];

export type MenuItem = { title: string; desc: string; note: string; section?: string; href?: string };
export type Menu = { id: string; label: string; items: MenuItem[] };

export const MENUS: Menu[] = [
  {
    id: 'learn',
    label: 'Learn',
    items: [
      { title: 'How it works', desc: 'Blocks, pockets and mandates', note: '3 parts, 1 vault', section: 'pieces' },
      { title: 'The rules', desc: 'What the contract checks on every payment', note: '8 checks, in order', section: 'rules' },
      { title: 'Compare', desc: 'Against handing someone the owner key', note: '6 rows', section: 'compare' },
      { title: 'Threat model', desc: 'Roles, defences and what is not covered', note: 'THREAT-MODEL.md', href: THREAT_MODEL },
    ],
  },
  {
    id: 'proof',
    label: 'Proof',
    items: [
      { title: 'Receipts', desc: 'Six payments from the testnet run', note: '113 tx, 55 refused', section: 'proof' },
      { title: 'Live-run vault', desc: 'Open it in the dashboard, no wallet needed', note: `block ${LIVE_RUN_DEPLOY_BLOCK}`, href: LIVE_RUN_LINK },
      { title: 'Transaction record', desc: 'Every call with its decoded result', note: 'logs/live-run', href: RECORD },
      { title: 'Contract on the explorer', desc: 'Verified source for the live-run vault', note: short(LIVE_RUN_VAULT), href: `${EXPLORER}/address/${LIVE_RUN_VAULT}` },
    ],
  },
];

// Every on-page section a menu can jump to.
export const NAV: { id: string; label: string }[] = [
  ...MENUS.flatMap((m) => m.items.filter((i) => i.section).map((i) => ({ id: i.section as string, label: i.title }))),
  { id: 'faq', label: 'FAQ' },
];

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Turns text typed into the vault box into a dashboard link, or null when it is not an address.
export function vaultLink(input: string): string | null {
  const t = input.trim();
  if (!isAddress(t, { strict: false })) return null;
  return `?vault=${getAddress(t.toLowerCase())}`;
}

const TABS: { id: string; label: string; body: string; flow: [string, string, string]; foot: string }[] = [
  {
    id: 'shared',
    label: 'Shared block',
    body: 'Borrows from the one Mezo Trove the vault opens. The vault tracks how much of the group debt belongs to each block, so every block has its own debt cap and its own books.',
    flow: ['0.048 BTC collateral', 'Vault opens one Trove', '1,800 MUSD debt, split by block'],
    foot: 'Smallest Trove on testnet: about 0.048 BTC and 1,800 MUSD of debt.',
  },
  {
    id: 'pocket',
    label: 'Prefunded pocket',
    body: 'Holds MUSD the owner already has. It never touches the Trove, so it needs no collateral and carries no debt. Good for a vendor run or a small allowance.',
    flow: ['Owner sends MUSD', 'Vault holds it in a pocket', 'Pocket cash, spent under a mandate'],
    foot: 'A pocket needs MUSD, plus a little testnet BTC for gas.',
  },
  {
    id: 'mandate',
    label: 'Mandate',
    body: 'The owner lets one operator key pay approved payees from one block, up to a per-payment cap and a lifetime cap, until an expiry date. The owner can revoke it at any time.',
    flow: ['Operator key requests', 'Vault checks eight rules', 'Payee paid, or refused'],
    foot: 'In this prototype the operator is a plain wallet key.',
  },
];

const RULES: { title: string; body: string; fact: string }[] = [
  { title: 'Caps on chain', body: 'A per-payment cap and a lifetime cap sit in the contract. A payment over either is refused, not flagged.', fact: '1.6 > 1.5 refused' },
  { title: 'Revoke any time', body: 'One owner transaction ends a mandate. Waiting payments are checked again when the owner approves them.', fact: 'revokeMandate(3)' },
  { title: 'Refusals on the record', body: 'A refused payment still lands on chain with its reason. 55 of the 113 live-run transactions were refusals.', fact: '55 / 113' },
  { title: 'Source on the explorer', body: 'The live-run vault is verified on the Mezo explorer, so anyone can read the exact rules.', fact: short(LIVE_RUN_VAULT) },
  { title: 'Books that tie out', body: 'The dashboard compares the vault ledger with Mezo totals and says so when they differ.', fact: 'ledger = Trove' },
];

const COMPARE: { row: string; us: string; them: string }[] = [
  { row: 'Spending limit', us: 'Per-payment and lifetime caps in the contract', them: 'None. The key can move everything' },
  { row: 'Payees', us: 'An approved list for each block', them: 'Any address' },
  { row: 'Stopping access', us: 'Revoke one mandate, the owner key stays private', them: 'Rotate the key and move the funds' },
  { row: 'Large payments', us: 'Wait for the owner above a threshold', them: 'Sent at once' },
  { row: 'Record', us: 'Refusals are on chain with the reason', them: 'Only successful transfers show' },
  { row: 'Reach', us: 'A block cannot touch another block', them: 'All of the money is reachable' },
];

const ENFORCED: { name: string; error: string }[] = [
  { name: 'Per-payment cap', error: 'PerTransactionCapExceeded' },
  { name: 'Lifetime cap', error: 'MandateTotalCapExceeded' },
  { name: 'Approved payees', error: 'RecipientNotAllowed' },
  { name: 'Expiry date', error: 'MandateExpired' },
  { name: 'Revocation', error: 'MandateRevoked' },
  { name: 'Operator only', error: 'NotOperator' },
  { name: 'Free cash only', error: 'PocketInsufficient' },
  { name: 'Owner approval', error: 'pending until approved' },
];

const NOT_YET: { name: string; note: string }[] = [
  { name: 'Audit', note: 'none' },
  { name: 'Mainnet', note: 'not deployed' },
  { name: 'Liquidation', note: 'not run on chain' },
  { name: 'Consumer wallets', note: 'not tried' },
  { name: 'Name', note: 'working name' },
  { name: 'Users', note: 'none yet' },
];

export type Receipt = { n: number; fn: string; what: string; stamp: 'Paid' | 'Approved' | 'Refused'; reason: string; tx: string };

export const RECEIPTS: Receipt[] = [
  {
    n: 52,
    fn: 'requestTransfer',
    what: 'Operator pays 0.05 MUSD to the approved vendor, under the approval threshold.',
    stamp: 'Paid',
    reason: 'sent at once',
    tx: '0x2e33ad8ec93f4f4949ae88987848e101f86c34bfdad913d951e9689788e733c8',
  },
  {
    n: 53,
    fn: 'requestTransfer',
    what: 'Operator asks to pay 1.6 MUSD from a block capped at 1.5 per payment.',
    stamp: 'Refused',
    reason: 'PerTransactionCapExceeded(1.6, 1.5)',
    tx: '0x6eef97002f335a4ad16886785ec3fb0c5c408f172dc7531b6ac124b838f1d2bc',
  },
  {
    n: 54,
    fn: 'requestTransfer',
    what: 'Operator tries to pay an address that is not on the block payee list.',
    stamp: 'Refused',
    reason: 'RecipientNotAllowed(3, 0x…dEaD)',
    tx: '0xe8d6b8f81ed84fa842f4aff551e9fde8948e624b68682348ed05e778c22ba42b',
  },
  {
    n: 63,
    fn: 'approvePayment',
    what: 'Owner approves a 0.5 MUSD payment that was waiting above the threshold.',
    stamp: 'Approved',
    reason: 'payment 3 released',
    tx: '0x9ae15333c00b28f1eb2f88247384aadcc146bf7264a4080c630a624b9e2c5a63',
  },
  {
    n: 73,
    fn: 'requestTransfer',
    what: 'Operator sends a new request after the owner revoked the mandate.',
    stamp: 'Refused',
    reason: 'MandateRevoked(3)',
    tx: '0x12b2d923736ba1297b6a4f40397e038ad7bad5b17f32b06019ef2304cc5412de',
  },
  {
    n: 86,
    fn: 'requestTransfer',
    what: 'Operator sends a request after the mandate on block 4 expired.',
    stamp: 'Refused',
    reason: 'MandateExpired(4)',
    tx: '0x981cbd996e0a40c9c6ffba1e3f6de0a7d350866774bb22aea36d804c50b3d156',
  },
];

const USES: { title: string; body: string }[] = [
  { title: 'Team budgets', body: 'One treasury loan, a block for each team with its own cap and its own payees.' },
  { title: 'Vendor runs', body: 'A prefunded pocket for a batch of invoices, with the payees fixed before anyone pays.' },
  { title: 'Scripted spending', body: 'An operator key for automation, limited to one block, easy to revoke.' },
  { title: 'Allowances', body: 'A small capped block that expires on its own date.' },
  { title: 'Approval for big payments', body: 'Small payments go through. Large ones wait for the owner.' },
];

const SECURITY: { title: string; body: string }[] = [
  {
    title: 'The owner key stays with the owner',
    body: 'Operators get a narrow mandate on one block. Nobody else needs the owner key to spend inside it.',
  },
  {
    title: 'Everything can be checked',
    body: 'The dashboard reads the chain directly, the checker script re-verifies the live run, and the threat model lists what is and is not covered.',
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'What is Blocks & Pockets?',
    a: 'A vault contract on Mezo testnet. It opens one Bitcoin-backed MUSD loan and splits it into blocks. Each block has its own cash, payees and spending limits, and an operator key can spend only inside them.',
  },
  {
    q: 'Is this on mainnet, and does it use real money?',
    a: 'No. It runs on Mezo testnet only, with testnet Bitcoin and testnet MUSD. It is a prototype and has not been audited.',
  },
  {
    q: 'Who can spend from a block?',
    a: 'Only the one operator wallet the owner named for that block, only to approved payees, only inside the caps, and only until the mandate expires or the owner revokes it.',
  },
  {
    q: 'Could the operator send money to itself?',
    a: 'Only if the owner put that address on the block allowlist. Any other payee is refused on chain.',
  },
  {
    q: 'Is the operator an AI agent?',
    a: 'In this prototype the operator is a plain wallet key. The contract does not care what holds the key, and nothing here is an AI product.',
  },
  {
    q: 'What if the Bitcoin price falls?',
    a: 'The Trove follows Mezo rules, including liquidation. The vault shows the collateral ratio, but liquidation was not run on chain in this project.',
  },
  {
    q: 'How do I try it?',
    a: (
      <>
        Open the dashboard, connect a testnet wallet and deploy your own vault. You need testnet BTC from the{' '}
        <a href={FAUCET_URL} target="_blank" rel="noreferrer">
          Mezo faucet
        </a>
        . Or read the finished live run, no wallet needed.
      </>
    ),
  },
];

const READ_NEXT: { title: string; label: string; href: string }[] = [
  { title: 'Threat model: roles, defences and what is not covered', label: 'Document', href: THREAT_MODEL },
  { title: 'The live run: all 113 transactions, with every refusal reason', label: 'Record', href: RECORD },
  { title: 'Security notes and how to report a problem', label: 'Document', href: `${REPO}/blob/main/SECURITY.md` },
  { title: 'Feedback for the Mezo team from building on testnet', label: 'Document', href: `${REPO}/blob/main/feedback.md` },
];

export const CTA_WORDS = ['a limit.', 'a payee list.', 'an end date.', 'an off switch.'];
export const WORDMARK = 'Blocks & Pockets';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// The router treats any hash other than #/ as the dashboard, so a landing link must scroll without touching the hash.
export function scrollToSection(id: string, doc: Document = document): boolean {
  const el = doc.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  return true;
}

function SectionLink({ id, children, onGo, className }: { id: string; children: ReactNode; onGo?: () => void; className?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onGo?.();
    if (scrollToSection(id)) e.preventDefault();
  };
  return (
    <a href="#/" onClick={onClick} data-section={id} className={className}>
      {children}
    </a>
  );
}

function MenuLink({ item, onGo, children, className }: { item: MenuItem; onGo?: () => void; children: ReactNode; className?: string }) {
  if (item.section)
    return (
      <SectionLink id={item.section} onGo={onGo} className={className}>
        {children}
      </SectionLink>
    );
  const external = item.href?.startsWith('http');
  return (
    <a href={item.href} className={className} onClick={onGo} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {children}
    </a>
  );
}

function Arrow() {
  return (
    <svg className="lp-arrow" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3 8h9M8.5 4 12.5 8l-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="lp-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// True once the page has scrolled past the announcement bar.
function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(window.scrollY > px);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [px]);
  return past;
}

function DesktopNav({ compact }: { compact: boolean }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [hover, setHover] = useState(0);
  const [height, setHeight] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = MENUS.find((m) => m.id === menu);

  useEffect(() => {
    if (menu && inner.current) setHeight(inner.current.offsetHeight);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menu]);

  const pinned = useRef(false);
  const open = (id: string, pin: boolean) => {
    window.clearTimeout(timer.current);
    pinned.current = pin;
    setMenu(id);
    setHover(0);
  };
  // With a mouse, hovering already opened the menu, so the first click pins it instead of closing it.
  const toggle = (id: string) => {
    if (menu === id && pinned.current) close();
    else open(id, true);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMenu(null), 140);
  };
  const close = () => setMenu(null);

  return (
    <div className="lp-dnav" ref={root} data-compact={compact} onPointerLeave={leave} onPointerEnter={() => window.clearTimeout(timer.current)}>
      <div className="lp-dnav-in">
        <a className="lp-brand" href="#/">
          <Logo />
          <strong className="lp-wordmark-sm">Blocks &amp; Pockets</strong>
        </a>
        <nav className="lp-pill" aria-label="Main">
          {MENUS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-expanded={menu === m.id}
              aria-controls="lp-dd"
              onClick={() => toggle(m.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && menu !== m.id && open(m.id, false)}
            >
              {m.label}
              <Chevron />
            </button>
          ))}
          <SectionLink id="faq" onGo={close}>
            FAQ
          </SectionLink>
        </nav>
        <a className="lp-btn lp-btn-primary lp-nav-cta" href="#/app">
          Open the dashboard <Arrow />
        </a>
      </div>
      <div className="lp-dd" id="lp-dd" data-open={!!menu} style={{ height }} aria-hidden={!menu} inert={!menu}>
        <div ref={inner} key={current?.id ?? 'none'} className="lp-dd-in">
          {current && (
            <>
              <ul>
                {current.items.map((it, i) => (
                  <li key={it.title} onPointerEnter={() => setHover(i)}>
                    <MenuLink item={it} onGo={close} className={i === hover ? 'on' : ''}>
                      <strong>
                        {it.title} <Arrow />
                      </strong>
                      <span>{it.desc}</span>
                    </MenuLink>
                  </li>
                ))}
              </ul>
              <div className="lp-dd-note" aria-hidden="true">
                {current.items.map((it, i) => (
                  <div key={it.title} className={i === hover ? 'on' : ''}>
                    <span className="lp-ledger-row">
                      <i />
                      <code>{it.note}</code>
                    </span>
                    <p>{it.desc}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileNav({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const wide = window.matchMedia?.('(min-width: 900px)');
    const onWide = () => wide?.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    wide?.addEventListener?.('change', onWide);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      wide?.removeEventListener?.('change', onWide);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setRow(null);
  };

  return (
    <div className="lp-mnav" data-open={open} data-compact={compact}>
      <div className="lp-m-overlay" onClick={close} aria-hidden="true" />
      <div className="lp-m-card">
        <div className="lp-m-bar">
          <a className="lp-brand" href="#/">
            <Logo />
            <strong>Blocks &amp; Pockets</strong>
          </a>
          <button
            type="button"
            className="lp-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="lp-m-body"
            onClick={() => (open ? close() : setOpen(true))}
          >
            {open ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 2l12 12M2 14 14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
                <path d="M1 1h18M1 7h18M1 13h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        <div className="lp-m-body" id="lp-m-body" aria-hidden={!open} inert={!open}>
          <div>
            {MENUS.map((m) => {
              const on = row === m.id;
              return (
                <div key={m.id} className="lp-m-row" data-open={on}>
                  <button type="button" aria-expanded={on} aria-controls={`lp-m-${m.id}`} onClick={() => setRow(on ? null : m.id)}>
                    <span className="lp-m-title">{m.label}</span>
                    <span className="lp-m-preview" aria-hidden="true">
                      <span>
                        {m.items.map((it, i) => (
                          <span key={it.title}>
                            {i > 0 && <b> · </b>}
                            {it.title}
                          </span>
                        ))}
                      </span>
                    </span>
                    <Chevron />
                  </button>
                  <div className="lp-m-panel" id={`lp-m-${m.id}`}>
                    <ul>
                      {m.items.map((it, i) => (
                        <li key={it.title} style={{ '--i': i } as CSSProperties}>
                          <MenuLink item={it} onGo={close}>
                            <code>{it.note}</code>
                            <strong>{it.title}</strong>
                            <span>{it.desc}</span>
                          </MenuLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
            <SectionLink id="faq" onGo={close} className="lp-m-plain">
              FAQ
            </SectionLink>
            <a className="lp-btn lp-btn-primary lp-m-cta" href="#/app" onClick={close}>
              Open the dashboard <Arrow />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slab({ y, w, h, tone }: { y: number; w: number; h: number; tone: 0 | 1 | 2 }) {
  const cx = 220;
  const d = w / 2;
  const t = d / 2;
  const top = `${cx},${y} ${cx + d},${y + t} ${cx},${y + 2 * t} ${cx - d},${y + t}`;
  const left = `${cx - d},${y + t} ${cx},${y + 2 * t} ${cx},${y + 2 * t + h} ${cx - d},${y + t + h}`;
  const right = `${cx + d},${y + t} ${cx},${y + 2 * t} ${cx},${y + 2 * t + h} ${cx + d},${y + t + h}`;
  return (
    <g>
      <polygon points={left} fill={`url(#lp-l${tone})`} />
      <polygon points={right} fill={`url(#lp-r${tone})`} />
      <polygon points={top} fill={`url(#lp-t${tone})`} stroke="rgba(255,253,248,0.8)" strokeWidth="1" />
    </g>
  );
}

function HeroArt() {
  const tones: [string, string, string][] = [
    ['#fffdf8', '#e9e0cd', '#d6c9ae'],
    ['#e3ede5', '#9ebfa9', '#7aa48a'],
    ['#efe6d6', '#cdbb9b', '#b39f7c'],
  ];
  return (
    <svg className="lp-art" viewBox="0 0 440 460" role="img" aria-label="Three stacked blocks with a paid stamp and a refused stamp">
      <defs>
        {tones.map((t, i) => (
          <g key={i}>
            <linearGradient id={`lp-t${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fffdf8" />
              <stop offset="1" stopColor={t[0]} />
            </linearGradient>
            <linearGradient id={`lp-l${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={t[1]} />
              <stop offset="1" stopColor={t[2]} />
            </linearGradient>
            <linearGradient id={`lp-r${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={t[0]} />
              <stop offset="1" stopColor={t[1]} />
            </linearGradient>
          </g>
        ))}
      </defs>
      <ellipse cx="220" cy="430" rx="150" ry="16" fill="rgba(29,27,23,0.10)" />
      <Slab y={290} w={300} h={52} tone={2} />
      <Slab y={200} w={250} h={52} tone={1} />
      <Slab y={110} w={200} h={52} tone={0} />
      <g className="lp-stamp-svg lp-stamp-svg-bad" transform="rotate(-8 370 60)">
        <rect x="310" y="40" width="120" height="40" rx="6" fill="#fffdf8" stroke="#b23a2b" strokeWidth="2" />
        <rect x="315" y="45" width="110" height="30" rx="3" fill="none" stroke="#b23a2b" strokeWidth="1" />
        <text x="370" y="65" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#b23a2b">
          REFUSED
        </text>
      </g>
      <g className="lp-stamp-svg" transform="rotate(5 80 170)">
        <rect x="26" y="150" width="108" height="40" rx="6" fill="#fffdf8" stroke="#2f6b3f" strokeWidth="2" />
        <rect x="31" y="155" width="98" height="30" rx="3" fill="none" stroke="#2f6b3f" strokeWidth="1" />
        <text x="80" y="175" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" fontWeight="500" fill="#2f6b3f">
          PAID
        </text>
      </g>
    </svg>
  );
}

function ProductTabs() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tab = TABS[i];

  useEffect(() => {
    setAuto(!prefersReducedMotion());
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = (k: number) => setI((k + TABS.length) % TABS.length);
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const k = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    go(k);
    document.getElementById(`tab-${TABS[k].id}`)?.focus();
  };
  const running = auto && seen && !held;

  return (
    <div
      className="lp-tabs"
      ref={box}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="lp-tablist" role="tablist" aria-label="Parts of the vault" onKeyDown={onKey}>
        {TABS.map((t, k) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={k === i}
            aria-controls="tabpanel"
            tabIndex={k === i ? 0 : -1}
            className={k === i ? 'on' : ''}
            onClick={() => go(k)}
          >
            {t.label}
            {k === i && auto && (
              <span className="lp-rail" key={`${t.id}-${i}`} data-run={running} onAnimationEnd={(e) => e.animationName === 'lp-rail' && go(i + 1)} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <div className="lp-tabpanel" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        <div className="lp-tab-enter" key={tab.id}>
          <div className="lp-tabcopy">
            <h3>{tab.label}</h3>
            <p>{tab.body}</p>
            <p className="lp-note">{tab.foot}</p>
          </div>
          <ol className="lp-flow" aria-label={`${tab.label}, step by step`}>
            {tab.flow.map((f, k) => (
              <li key={f} style={{ '--i': k } as CSSProperties} className={k === 1 ? 'main' : ''}>
                {f}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function VaultForm() {
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const link = vaultLink(value);
    if (!link) {
      setBad(true);
      return;
    }
    window.location.assign(`${window.location.pathname}${link}`);
  };
  return (
    <form className="lp-form" onSubmit={onSubmit} noValidate>
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste any vault address"
        aria-label="Vault address"
        aria-invalid={bad}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
      />
      <button type="submit">Look up</button>
      {bad && (
        <span className="lp-form-err" role="alert">
          That is not a valid address.
        </span>
      )}
    </form>
  );
}

function Accordion({ items, numbered, first, id }: { items: { title: string; body: ReactNode }[]; numbered?: boolean; first?: boolean; id: string }) {
  const [open, setOpen] = useState<number | null>(first ? 0 : null);
  return (
    <div className={`lp-acc${numbered ? ' lp-acc-num' : ''}`}>
      {items.map((it, k) => {
        const on = open === k;
        return (
          <div key={it.title} className="lp-acc-item" data-open={on}>
            <h3>
              <button type="button" aria-expanded={on} aria-controls={`${id}-${k}`} onClick={() => setOpen(on ? null : k)}>
                {numbered && <span className="lp-acc-n">{k + 1}.</span>}
                <span className="lp-acc-t">{it.title}</span>
                <Chevron />
              </button>
            </h3>
            <div className="lp-acc-panel" id={`${id}-${k}`} role="region" aria-label={it.title}>
              <div>
                <p>{it.body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function CycleWord({ words }: { words: string[] }) {
  const [text, setText] = useState(words[0]);
  useEffect(() => {
    const reduce = prefersReducedMotion();
    let k = 0;
    let raf = 0;
    const id = window.setInterval(() => {
      k = (k + 1) % words.length;
      const target = words[k];
      if (reduce) {
        setText(target);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 560);
        const done = Math.floor(p * target.length);
        setText(
          target
            .split('')
            .map((c, j) => (j < done || c === ' ' || c === '.' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
            .join(''),
        );
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 2600);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [words]);
  return <span className="lp-cycle">{text}</span>;
}

function Wordmark() {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    setArmed(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="lp-wm" data-armed={armed} data-in={shown} aria-hidden="true">
      {WORDMARK.split('').map((c, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties}>
          {c === ' ' ? '\u00a0' : c}
        </span>
      ))}
    </div>
  );
}

function Receipts() {
  return (
    <ul className="lp-receipts">
      {RECEIPTS.map((r) => (
        <li key={r.n} className={`lp-receipt lp-receipt-${r.stamp === 'Refused' ? 'bad' : 'ok'}`}>
          <div className="lp-receipt-head">
            <code>
              #{r.n} of 113 · {r.fn}
            </code>
            <span className="lp-stamp">{r.stamp}</span>
          </div>
          <p>{r.what}</p>
          <div className="lp-receipt-foot">
            <code>{r.reason}</code>
            <a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" aria-label={`Transaction ${r.n} on the Mezo explorer`}>
              <code>{short(r.tx)}</code> <Arrow />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  const compact = useScrolledPast(40);
  return (
    <div className="lp">
      <div className="lp-banner">
        <span>
          Testnet run finished: <code>113</code> transactions, <code>15/15</code> checks confirmed.
        </span>
        <a href={LIVE_RUN_LINK}>
          See the live-run vault <Arrow />
        </a>
      </div>

      <header className="lp-header">
        <DesktopNav compact={compact} />
        <MobileNav compact={compact} />
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-inner lp-hero-grid">
            <div className="lp-hero-copy">
              <h1>
                <span className="lp-line">
                  <span>One loan</span>
                </span>
                <span className="lp-line">
                  <span>
                    <em>to</em> many blocks
                  </span>
                </span>
              </h1>
              <p className="lp-lead lp-up" style={{ '--d': '.35s' } as CSSProperties}>
                Blocks &amp; Pockets turns one Bitcoin-backed MUSD loan on Mezo into separate blocks of spending money.
                Each block has its own cash, caps and payees, and an operator key can spend only inside them.
              </p>
              <div className="lp-cta lp-up" style={{ '--d': '.45s' } as CSSProperties}>
                <a className="lp-btn lp-btn-primary" href="#/app">
                  Open the dashboard <Arrow />
                </a>
                <VaultForm />
              </div>
              <dl className="lp-metrics lp-up" style={{ '--d': '.55s' } as CSSProperties}>
                <div>
                  <dd>113</dd>
                  <dt>Testnet transactions</dt>
                </div>
                <div>
                  <dd>55</dd>
                  <dt>Refused on purpose</dt>
                </div>
                <div>
                  <dd>15/15</dd>
                  <dt>Checks confirmed</dt>
                </div>
              </dl>
            </div>
            <div className="lp-hero-art">
              <HeroArt />
            </div>
          </div>
        </section>

        <section className="lp-builton" aria-label="Built on">
          <div className="lp-inner">
            <span>Built on</span>
            <ul>
              <li>Mezo testnet</li>
              <li>MUSD</li>
              <li>Bitcoin collateral</li>
              <li>Foundry</li>
              <li>Mezo explorer</li>
            </ul>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt" id="pieces">
          <div className="lp-inner">
            <p className="lp-label">The pieces</p>
            <h2>
              A loan, split into blocks <br />
              <em>and kept in line.</em>
            </h2>
            <ProductTabs />
          </div>
        </section>

        <section className="lp-sec" id="platform">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">The platform</p>
              <h2>
                One contract.
                <br />
                One dashboard.
              </h2>
              <p>
                The vault is a single Solidity contract. The dashboard reads it straight from Mezo, with no server in
                between, so what you see is what the chain says.
              </p>
              <a className="lp-link" href="#/app">
                Open the dashboard <Arrow />
              </a>
            </div>
            <div className="lp-stack">
              <div className="lp-app" aria-label="Illustration of the dashboard">
                <aside>
                  <b>Blocks &amp; Pockets</b>
                  <span className="on">Overview</span>
                  <span>Blocks</span>
                  <span>Payments</span>
                  <span>Verify</span>
                </aside>
                <div className="lp-app-main">
                  <p className="lp-app-title">Procurement</p>
                  <p className="lp-app-sub">Shared block · made-up numbers</p>
                  <div className="lp-app-cash">
                    <span>Cash in block</span>
                    <strong>1,200 MUSD</strong>
                    <div className="lp-meter">
                      <i style={{ width: '40%' }} />
                    </div>
                    <em>800 of 2,000 MUSD lifetime cap spent</em>
                  </div>
                  <dl>
                    <div>
                      <dt>Per-payment cap</dt>
                      <dd>500 MUSD</dd>
                    </div>
                    <div>
                      <dt>Payees</dt>
                      <dd>Vendor A, Vendor B</dd>
                    </div>
                    <div>
                      <dt>Approval above</dt>
                      <dd>400 MUSD</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="lp-code">
                <span className="lp-code-label">The same rule, on chain (transaction 53)</span>
                <pre>
                  <code>
                    {`requestTransfer(
  blockId: 3,
  to: 0x…bEEF,
  amount: 1.6 MUSD,
  evidence: "INV-002"
)

// reverted on Mezo testnet
PerTransactionCapExceeded(1.6, 1.5)`}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-dark" id="rules">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">The rules</p>
              <h2>
                The rules <br />
                live on chain
              </h2>
              <p>
                Limits that sit in a dashboard can be skipped. These sit in the contract, so a payment outside them
                never moves.
              </p>
            </div>
            <div className="lp-rule-grid">
              {RULES.map((f) => (
                <article key={f.title} className="lp-rule">
                  <code>{f.fact}</code>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-sec" id="compare">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">Compare</p>
              <h2>How it compares to sharing a key</h2>
              <p>To let someone spend from a loan today, you hand over the key or approve every payment yourself.</p>
              <p>Blocks &amp; Pockets keeps the owner key with the owner and gives everyone else a narrow mandate.</p>
            </div>
            <table className="lp-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="lp-sr">Topic</span>
                  </th>
                  <th scope="col" className="us">
                    Blocks &amp; Pockets
                  </th>
                  <th scope="col" className="them">
                    Sharing the owner key
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((c) => (
                  <tr key={c.row}>
                    <th scope="row">{c.row}</th>
                    <td className="us">
                      <span className="lp-tick" aria-label="Yes" />
                      {c.us}
                    </td>
                    <td className="them">
                      <span className="lp-cross" aria-label="No" />
                      {c.them}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt" id="enforced">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">Enforced today</p>
              <h2>
                What the vault <br />
                enforces
              </h2>
              <p>
                Eight checks run on every payment, in this order. A failed check stops the payment and reverts the
                transaction with a named error.
              </p>
              <ol className="lp-pipeline">
                {PIPELINE.map((c, i) => (
                  <li key={c.title}>
                    <code>{i + 1}</code>
                    {c.title}
                  </li>
                ))}
              </ol>
            </div>
            <div className="lp-lists">
              <h3>Enforced</h3>
              <ul className="lp-rows">
                {ENFORCED.map((e) => (
                  <li key={e.name}>
                    <span>{e.name}</span>
                    <code>{e.error}</code>
                  </li>
                ))}
              </ul>
              <h3>Not yet</h3>
              <ul className="lp-rows lp-rows-not">
                {NOT_YET.map((e) => (
                  <li key={e.name}>
                    <span>{e.name}</span>
                    <code>{e.note}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-sec" id="proof">
          <div className="lp-inner">
            <p className="lp-label">Run live on Mezo testnet</p>
            <h2>
              Tried on a real chain. <br />
              <em>Most of the refusals were the point.</em>
            </h2>
            <dl className="lp-stats">
              {PROOF.map((p) => (
                <div key={p.label}>
                  <dd>{p.value}</dd>
                  <dt>
                    {p.label}
                    {p.note && <em>{p.note}</em>}
                  </dt>
                </div>
              ))}
            </dl>
            <Receipts />
            <p className="lp-fine">
              Liquidation was not run on chain. The Foundry and dashboard tests are simulations.{' '}
              <a href={RECORD} target="_blank" rel="noreferrer">
                Read all 113 transactions
              </a>
              {' · '}
              <a href={LIVE_RUN_LINK}>See the live-run vault in the dashboard</a>
            </p>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt" id="uses">
          <div className="lp-inner">
            <div className="lp-two">
              <div className="lp-two-copy">
                <p className="lp-label">Uses</p>
                <h2>
                  Where it <br />
                  fits
                </h2>
                <p>Ideas the design is built for. It is a testnet prototype, so none of these has live users.</p>
              </div>
              <Accordion id="use" items={USES.map((u) => ({ title: u.title, body: u.body }))} />
            </div>
            <div className="lp-security">
              {SECURITY.map((s, i) => (
                <article key={s.title} className="lp-sec-card">
                  <div className={`lp-sec-art lp-sec-art-${i}`} aria-hidden="true">
                    {i === 0 ? (
                      <>
                        <span className="lp-ledger-row">
                          <i />
                          <code>owner 0xA445…0db7</code>
                        </span>
                        <span className="lp-ledger-row lp-ledger-row-dim">
                          <i />
                          <code>operator 0xDb41…3E2E · block 3 only</code>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="lp-ledger-row">
                          <i />
                          <code>checker 15 / 15 PASS</code>
                        </span>
                        <span className="lp-ledger-row lp-ledger-row-dim">
                          <i />
                          <code>threat model · 4 gaps listed</code>
                        </span>
                      </>
                    )}
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta-band">
          <div className="lp-inner">
            <h2>
              <span className="lp-sr">Give every block a limit, a payee list, an end date and an off switch.</span>
              <span aria-hidden="true">
                Give every block <br />
                <CycleWord words={CTA_WORDS} />
              </span>
            </h2>
            <p>Open the dashboard to read the vault, its blocks and every payment.</p>
            <a className="lp-btn lp-btn-paper" href="#/app">
              Open the dashboard <Arrow />
            </a>
          </div>
        </section>

        <section className="lp-sec" id="faq">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">FAQ</p>
              <h2>Questions</h2>
              <p>Short answers about what the vault does, what it does not, and how to try it.</p>
            </div>
            <Accordion id="faq" numbered first items={FAQ.map((f) => ({ title: f.q, body: f.a }))} />
          </div>
        </section>

        <section className="lp-sec lp-sec-alt" id="read">
          <div className="lp-inner lp-two">
            <div className="lp-two-copy">
              <p className="lp-label">Read next</p>
              <h2>The documents behind the claims</h2>
            </div>
            <ul className="lp-read">
              {READ_NEXT.map((r) => (
                <li key={r.title}>
                  <a href={r.href} target="_blank" rel="noreferrer">
                    <span>
                      <strong>{r.title}</strong>
                      <em>{r.label} in the repo</em>
                    </span>
                    <span className="lp-read-go">
                      Read <Arrow />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="lp-foot-grid">
            <div className="lp-foot-brand">
              <a className="lp-brand" href="#/">
                <Logo />
                <strong>Blocks &amp; Pockets</strong>
              </a>
              <p>One loan to many blocks. A testnet prototype on Mezo.</p>
              <p className="lp-status">
                <i aria-hidden="true" />
                Mezo testnet · chain <code>31611</code>
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href="#/app">Dashboard</a>
                </li>
                <li>
                  <a href={LIVE_RUN_LINK}>Live-run vault</a>
                </li>
                <li>
                  <SectionLink id="pieces">How it works</SectionLink>
                </li>
                <li>
                  <SectionLink id="faq">FAQ</SectionLink>
                </li>
              </ul>
            </div>
            <div>
              <h4>Evidence</h4>
              <ul>
                <li>
                  <a href={RECORD} target="_blank" rel="noreferrer">
                    Live-run record
                  </a>
                </li>
                <li>
                  <a href={`${EXPLORER}/address/${LIVE_RUN_VAULT}`} target="_blank" rel="noreferrer">
                    Vault on the explorer
                  </a>
                </li>
                <li>
                  <a href={THREAT_MODEL} target="_blank" rel="noreferrer">
                    Threat model
                  </a>
                </li>
                <li>
                  <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">
                    Security notes
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Project</h4>
              <ul>
                <li>
                  <a href={REPO} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={`${REPO}/blob/main/feedback.md`} target="_blank" rel="noreferrer">
                    Feedback for Mezo
                  </a>
                </li>
                <li>
                  <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                    Mezo testnet faucet
                  </a>
                </li>
                <li>
                  <a href="https://mezo.org" target="_blank" rel="noreferrer">
                    Mezo
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <Wordmark />
          <p className="lp-foot-legal">
            Testnet prototype. Not audited. No real funds. The name is a working name and is not trademark-cleared.
            Contracts are GPL-3.0.
          </p>
        </div>
      </footer>
    </div>
  );
}
