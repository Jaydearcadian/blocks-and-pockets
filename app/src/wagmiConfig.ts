import { connectorsForWallets, type Wallet } from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import type { EIP1193Provider } from 'viem';
import { createConfig, createConnector, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { mezoTestnet } from './chain';
import { RPC_URL } from './config';
import { createTestWallet, parseAccounts, testWalletEnabled, type TestWallet } from './testWallet';

type Env = Record<string, string | undefined>;
const env = import.meta.env as Env;

// WalletConnect (mobile and QR wallets) needs a project ID from cloud.reown.com. Without one the connect dialog
// lists browser wallets only, which is enough for a desktop testnet check.
export const WALLETCONNECT_PROJECT_ID = env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined;

declare global {
  interface Window {
    __testWallet?: TestWallet;
  }
}

function localTestWallet(): (() => Wallet) | undefined {
  const accounts = parseAccounts(env.VITE_TEST_WALLET_ACCOUNTS);
  if (typeof window === 'undefined' || !testWalletEnabled(accounts, RPC_URL, window.location.hostname)) return undefined;
  const provider = createTestWallet({
    rpcUrl: RPC_URL,
    accounts,
    chainId: mezoTestnet.id,
    startChainId: env.VITE_TEST_WALLET_WRONG_CHAIN === '1' ? 1 : undefined,
  });
  window.__testWallet = provider;
  return () => ({
    id: 'local-test-wallet',
    name: 'Local test wallet',
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIyOCI+PHJlY3Qgd2lkdGg9IjI4IiBoZWlnaHQ9IjI4IiByeD0iNiIgZmlsbD0iIzE3MTcxNyIvPjwvc3ZnPg==',
    iconBackground: '#171717',
    installed: true,
    createConnector: (details) =>
      createConnector((config) => ({
        ...injected({ target: { id: 'localTestWallet', name: 'Local test wallet', provider: provider as unknown as EIP1193Provider } })(config),
        ...details,
      })),
  });
}

export function buildWagmiConfig() {
  const test = localTestWallet();
  const wallets = [
    ...(test ? [test] : []),
    injectedWallet,
    metaMaskWallet,
    rabbyWallet,
    coinbaseWallet,
    ...(WALLETCONNECT_PROJECT_ID ? [walletConnectWallet] : []),
  ];
  const connectors = connectorsForWallets([{ groupName: 'Wallets', wallets }], {
    appName: 'Blocks & Pockets',
    // RainbowKit requires a value here. Wallets that need WalletConnect are left out when it is not set.
    projectId: WALLETCONNECT_PROJECT_ID ?? 'not-configured',
  });
  return createConfig({
    chains: [mezoTestnet],
    connectors,
    transports: { [mezoTestnet.id]: http(RPC_URL) },
    ssr: false,
  });
}
