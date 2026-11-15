import { FAUCET_URL, GLOSSARY, START_STEPS, TRY_NEEDS } from './guide';
import { Section } from './ui';

export function StartHere() {
  return (
    <section className="start" id="start" aria-labelledby="start-title">
      <h2 id="start-title" className="start-title">
        Start here
      </h2>
      <ol className="start-grid">
        {START_STEPS.map((s, i) => (
          <li key={s.title} className="card start-card">
            <span className="start-num" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{s.title}</h3>
            <p className="muted">{s.body}</p>
            <a className="start-link" href={`#${s.target}`}>
              Go to {s.target === 'tieouts' ? 'tie-outs' : s.target}
            </a>
          </li>
        ))}
      </ol>
      <div className="card start-needs">
        <h3>What you need to try it</h3>
        <ul>
          {TRY_NEEDS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="small muted">
          Testnet faucet:{' '}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer">
            {FAUCET_URL.replace('https://', '')}
          </a>
          . <a href="#glossary">New to the terms? See the glossary.</a>
        </p>
      </div>
    </section>
  );
}

export function Glossary() {
  return (
    <Section id="glossary" title="Glossary" subtitle="The few terms this page uses, in plain words.">
      <dl className="glossary card">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="glossary-row">
            <dt>{g.term}</dt>
            <dd className="muted">{g.meaning}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
