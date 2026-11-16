import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { CHAIN_ID } from './config';
import { errorCode, isTestnetChain, messageOf, USER_REJECTED, type Eip1193Provider, type WalletState } from './wallet';

// Wallet state for the dashboard, read from wagmi. RainbowKit owns the connect dialog. The dashboard signs through
// the connected wallet's own EIP-1193 provider, so walletFor and the review step work with any wallet.
export function useWallet(): WalletState {
  const { address, chainId, connector, isConnected, status } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [provider, setProvider] = useState<Eip1193Provider>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    if (!isConnected || !connector) {
      setProvider(undefined);
      return;
    }
    connector
      .getProvider()
      .then((found) => current && setProvider(found as Eip1193Provider))
      .catch((err: unknown) => current && setError(messageOf(err)));
    return () => {
      current = false;
    };
  }, [connector, isConnected, address, chainId]);

  const connect = useCallback(async () => {
    setError(undefined);
    openConnectModal?.();
  }, [openConnectModal]);

  const switchNetwork = useCallback(async () => {
    setError(undefined);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (err) {
      setError(errorCode(err) === USER_REJECTED ? 'Network switch cancelled in the wallet.' : messageOf(err));
    }
  }, [switchChainAsync]);

  const connected = isConnected && address !== undefined;
  return {
    connected,
    account: connected ? address : undefined,
    provider: connected ? provider : undefined,
    chainId: connected ? chainId : undefined,
    onTestnet: connected && isTestnetChain(chainId),
    busy: status === 'connecting' || status === 'reconnecting' || switching,
    error,
    connect,
    switchNetwork,
  };
}
