import { lazy, Suspense, useSyncExternalStore } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import Landing from './Landing';
import { routeFor } from './route';

// The wallet libraries are large, so only the dashboard route loads them.
const Dashboard = lazy(() => import('./Dashboard'));

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

// One element for every render, so a hash change between dashboard views does not re-render the wallet providers.
// Re-rendering them makes wagmi's Hydrate update RainbowKit state mid-render.
const dashboard = (
  <Suspense fallback={<div className="route-loading">Loading the dashboard</div>}>
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  </Suspense>
);

export default function App() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  if (routeFor(hash, window.location.search) === 'landing') return <Landing />;
  return dashboard;
}
