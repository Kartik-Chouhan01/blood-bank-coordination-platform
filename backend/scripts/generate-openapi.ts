/**
 * Writes docs/openapi.json from the live route table. Run after changing routes:
 *   npm run docs:openapi -w @bbms/backend
 * A test fails when the committed file is out of date. No database or secrets are needed: the app
 * configuration only has to load, so placeholders are used when the environment has none.
 */
import { writeFileSync } from 'node:fs';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/openapi-generator';
process.env.JWT_ACCESS_SECRET ??= 'openapi-generator-placeholder-value-not-used';
process.env.LOG_LEVEL ??= 'silent';

const { buildOpenApiDocument } = await import('../src/docs/openapi.js');
const { OPENAPI_PATH, serializeOpenApi } = await import('../src/docs/openapiFile.js');

const document = buildOpenApiDocument(process.env.npm_package_version ?? '0.0.0');
writeFileSync(OPENAPI_PATH, serializeOpenApi(document));
console.log(`Wrote ${Object.keys(document.paths).length} paths to ${OPENAPI_PATH}`);
process.exit(0);
