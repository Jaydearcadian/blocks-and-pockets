export type Route = 'landing' | 'app';

// The site is static, so the route lives in the hash. A ?vault link goes straight to the app.
// Any other hash, such as an in-page anchor like #blocks, is the app too, so section links never bounce back.
export function routeFor(hash: string, search: string): Route {
  if (new URLSearchParams(search).has('vault')) return 'app';
  return hash === '' || hash === '#' || hash === '#/' ? 'landing' : 'app';
}
