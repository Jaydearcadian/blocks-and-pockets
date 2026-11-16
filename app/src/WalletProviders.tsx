import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { buildWagmiConfig } from './wagmiConfig';

const config = buildWagmiConfig();
const queryClient = new QueryClient();
const theme = lightTheme({
  accentColor: '#4338ca',
  accentColorForeground: '#ffffff',
  borderRadius: 'medium',
  fontStack: 'system',
});

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
