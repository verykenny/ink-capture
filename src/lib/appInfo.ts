/**
 * App-wide constants shared across layers.
 *
 * `APP_NAME` also serves as A3's runtime bundle proof: `App.tsx` imports it via
 * the `@lib` alias, so a successful Metro/Babel bundle confirms the alias
 * resolves at runtime (not just under `tsc`).
 */
export const APP_NAME = 'Ink Capture';
