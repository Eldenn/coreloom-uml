/**
 * The catalog's version, stored on every generation (`catalog_version`) to know which
 * questionnaires and templates produced it. Always equal to `version` in this package's
 * `package.json` (a test checks it): bump both together whenever a questionnaire, a fragment,
 * a template or the renderer changes its output.
 */
export const CATALOG_VERSION = '0.2.0'
