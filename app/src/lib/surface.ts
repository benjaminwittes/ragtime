/**
 * The surface a request serves, from the route: what `x-rt-surface` carries on every call
 * to the worker (`lib/worker-url.ts`), read per request so it follows navigation.
 *
 * The vocabulary is the usage log's (`UsageLogRecord.surface`): a corpus spoke is its
 * slug, the hub is `hub`, the Explorer is `explorer`. A collection-qualified slug keeps
 * its colon (`congress:laws`), which the worker's label alphabet allows. Pages that make
 * no corpus call of their own (`/privacy`, `/terms`, a missing route) are `site`, so a
 * call made from one — the balance, a problem report — still says where it came from.
 */
export function surfaceOf(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  if (path === '/') return 'hub'
  if (path === '/explorer' || path.startsWith('/explorer/')) return 'explorer'
  if (path === '/collections' || path.startsWith('/collections/')) return 'collections'
  if (path === '/demo' || path.startsWith('/demo/')) return 'demo'
  if (path === '/stage' || path === '/present' || path === '/terrain') return path.slice(1)
  const spoke = path.match(/^\/corpus\/([a-z0-9_-]+(?::[a-z0-9_-]+)?)(?:\/|$)/)
  if (spoke) return spoke[1]
  return 'site'
}
