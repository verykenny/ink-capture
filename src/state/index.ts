/**
 * Public surface of the state layer (`@state`).
 *
 * Stores and view-models that orchestrate user actions over the `@services`
 * port *interfaces* and `@domain` types. `@ui` depends on this barrel; `@app`
 * builds the concrete services and feeds them in at the composition root.
 *
 * @format
 */

export * from './collectionStore';
export * from './appServices';
