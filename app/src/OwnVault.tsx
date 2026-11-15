import { useState } from 'react';
import { client } from './chain';
import { explorerAddress, explorerTx } from './config';
import { deployVault, vaultLink, type DeployOutcome } from './deploy';
import { OWN_VAULT_NOTES } from './guide';
import { Callout } from './ui';
import { walletFor, type WalletState } from './wallet';

type State = { busy: boolean; steps: string[]; outcome?: DeployOutcome };

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

// Lets any visitor with a testnet wallet deploy a vault they own, so the owner actions can be tried end to end.
export function OwnVault({ wallet }: { wallet: WalletState }) {
  const [state, setState] = useState<State>({ busy: false, steps: [] });
  const ready = wallet.connected && wallet.onTestnet && wallet.provider !== undefined && wallet.account !== undefined;

  async function deploy() {
    const { provider, account } = wallet;
    if (!provider || !account) return;
    setState({ busy: true, steps: [] });
    const outcome = await deployVault({
      publicClient: client,
      wallet: walletFor(provider, account),
      account,
      step: (text) => setState((prev) => ({ ...prev, steps: [...prev.steps, text] })),
    });
    setState({ busy: false, steps: [], outcome });
  }

  const out = state.outcome;
  return (
    <div className="card own-vault">
      <p className="kicker">Try it yourself</p>
      <h3>Deploy your own vault</h3>
      {OWN_VAULT_NOTES.map((n) => (
        <p key={n} className="muted small">
          {n}
        </p>
      ))}
      <div className="own-vault-actions">
        <button className="btn btn-primary" type="button" onClick={() => void deploy()} disabled={!ready || state.busy}>
          {state.busy ? 'Deploying…' : 'Deploy my vault'}
        </button>
        {!ready && (
          <span className="muted small">
            {wallet.connected ? 'Switch the wallet to Mezo testnet first.' : 'Connect a testnet wallet first.'}
          </span>
        )}
      </div>
      {state.busy && (
        <ol className="run-steps" role="status">
          {state.steps.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      )}
      {out?.kind === 'confirmed' && (
        <Callout tone="ok" title={`Vault deployed in block ${out.block.toString()}`}>
          <p className="small">
            Your vault{' '}
            <a href={explorerAddress(out.address)} target="_blank" rel="noreferrer">
              <code>{out.address}</code>
            </a>
            , transaction{' '}
            <a href={explorerTx(out.hash)} target="_blank" rel="noreferrer">
              {shortHash(out.hash)}
            </a>
            .
          </p>
          <p className="small">
            <a
              className="btn btn-primary"
              href={vaultLink(new URL(import.meta.env.BASE_URL, window.location.origin).href, out.address, out.block)}
            >
              Open my vault
            </a>{' '}
            Keep this link: the page does not store your vault anywhere else.
          </p>
        </Callout>
      )}
      {out?.kind === 'reverted' && (
        <Callout tone="bad" title="Deployment reverted">
          {out.text}{' '}
          <a href={explorerTx(out.hash)} target="_blank" rel="noreferrer">
            {shortHash(out.hash)}
          </a>
        </Callout>
      )}
      {out?.kind === 'refused' && (
        <Callout tone="warn" title="Nothing was sent">
          Mezo refused the deployment check: {out.text}. The wallet needs a little testnet BTC for gas.
        </Callout>
      )}
      {out?.kind === 'failed' && (
        <Callout tone="bad" title="Deployment failed">
          {out.text}
        </Callout>
      )}
      {out?.kind === 'cancelled' && (
        <Callout tone="info" title="Cancelled">
          You rejected the signature. Nothing was sent.
        </Callout>
      )}
    </div>
  );
}
