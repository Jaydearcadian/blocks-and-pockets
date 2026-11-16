import { lazy, Suspense, useSyncExternalStore } from 'react';
import Landing from './Landing';
import { routeFor } from './route';

// The wallet libraries are large, so only the dashboard route loads them.
const Dashboard = lazy(() => import('./Dashboard'));

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export default function App() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  if (routeFor(hash, window.location.search) === 'landing') return <Landing />;
  return (
    <Suspense fallback={<div className="route-loading">Loading the dashboard</div>}>
      <Dashboard />
    </Suspense>
  );
}
