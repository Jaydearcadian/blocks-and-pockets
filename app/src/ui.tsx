import { useId, type ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted' | 'btc' | 'violet';

export function Chip({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Meter({ pct, tone = 'info' }: { pct: number; tone?: Tone }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)}>
      <span className={`meter-fill meter-${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Stack({ parts }: { parts: { pct: number; tone: Tone; label: string }[] }) {
  return (
    <div className="stack" aria-hidden="true">
      {parts.map((p) => (
        <span key={p.label} className={`stack-part meter-${p.tone}`} style={{ width: `${p.pct}%` }} title={p.label} />
      ))}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  note,
  delay,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  delay: number;
}) {
  return (
    <article className="card kpi" style={{ animationDelay: `${delay}ms` }}>
      <p className="kicker">{label}</p>
      <p className="kpi-value">
        <strong>{value}</strong>
        {unit && <span>{unit}</span>}
      </p>
      {note && <p className="muted small">{note}</p>}
    </article>
  );
}

export function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function Callout({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  return (
    <div className={`callout callout-${tone}`} role="status">
      <strong>{title}</strong>
      {children && <span className="callout-body">{children}</span>}
    </div>
  );
}

export function Logo() {
  // Unique ids: a gradient defined inside a hidden copy (display: none) would leave the visible copies unpainted.
  const id = useId();
  return (
    <svg className="logo" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#5eead4" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f7931a" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="#0b1222" stroke="rgba(255,255,255,0.12)" />
      <rect x="9" y="8" width="14" height="10" rx="3" fill={`url(#${id}a)`} />
      <rect x="9" y="21" width="22" height="11" rx="3" fill={`url(#${id}b)`} />
      <rect x="25" y="21" width="6" height="11" rx="2" fill="#0b1222" opacity="0.35" />
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="checking" />;
}
