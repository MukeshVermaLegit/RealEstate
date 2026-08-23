#!/usr/bin/env node
/**
 * Regenerates frontend/lib/contracts/propertyOfferingBytecode.ts from the Foundry
 * artifact. Run after any change to src/core/PropertyOffering.sol, otherwise the
 * admin panel keeps deploying the previously compiled logic.
 *
 *   forge build && node scripts/sync-offering-bytecode.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ARTIFACT = 'out/PropertyOffering.sol/PropertyOffering.json';
const TARGET = 'frontend/lib/contracts/propertyOfferingBytecode.ts';

const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
const bytecode = artifact.bytecode?.object;
if (!bytecode?.startsWith('0x')) {
  throw new Error(`No creation bytecode in ${ARTIFACT} — run \`forge build\` first.`);
}
const ctor = artifact.abi.filter((e) => e.type === 'constructor');
if (ctor.length !== 1) throw new Error('Expected exactly one constructor in the ABI.');

const source = readFileSync(TARGET, 'utf8');
const next = source
  .replace(/'0x[0-9a-fA-F]*' as const;/, `'${bytecode}' as const;`)
  .replace(
    /export const PROPERTY_OFFERING_CONSTRUCTOR_ABI = [\s\S]*? as const;\n/,
    `export const PROPERTY_OFFERING_CONSTRUCTOR_ABI = ${JSON.stringify(ctor, null, 2)} as const;\n`,
  );

writeFileSync(TARGET, next);
console.log(`${TARGET} ← ${(bytecode.length - 2) / 2} bytes of creation bytecode`);
