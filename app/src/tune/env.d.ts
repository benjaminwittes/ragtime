/**
 * `__RT_TUNE__` — is the design-tuning layer in this build?
 *
 * Substituted by Vite's `define` (see `vite.config.ts`), so it is a literal
 * `true` or `false` in the emitted code rather than a variable. That is what
 * lets a production build delete the panel entirely instead of shipping a
 * chunk it will never load.
 *
 * Declared here rather than assumed, because it is *not* defined everywhere:
 * Vitest runs without the define, so anything reading it must tolerate its
 * absence (`store.ts` does, with a `typeof` guard).
 */
declare const __RT_TUNE__: boolean | undefined
