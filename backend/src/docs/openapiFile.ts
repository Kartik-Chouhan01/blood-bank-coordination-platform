import { fileURLToPath } from 'node:url';

/** Where the committed specification lives (repository `docs/openapi.json`). */
export const OPENAPI_PATH = fileURLToPath(new URL('../../../docs/openapi.json', import.meta.url));

export const serializeOpenApi = (document: object) => `${JSON.stringify(document, null, 2)}\n`;
