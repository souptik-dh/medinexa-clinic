// Seeds the global lab_test_library from api/src/db/lab-test-library.json.
//
// Safe to run any number of times: rows are matched on internal_code and name (both
// unique) and only missing ones are inserted — an existing row is never updated or
// deleted, so manual corrections and clinic-specific tests (lab_tests) are untouched.
//
// Used by db-migrate.mjs. Can also be run on its own:
//   node api/scripts/lab-test-library-seed.mjs --dry-run           (no DB; prints the plan)
//   node --env-file=.env api/scripts/lab-test-library-seed.mjs     (seeds DATABASE_URL)
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_FILE = path.join(__dirname, '..', 'src', 'db', 'lab-test-library.json');

export async function loadLibraryData(file = LIBRARY_FILE) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Splits the dataset into rows to insert and rows already present (by code or by
 * case-insensitive name). Also reports codes/names repeated inside the dataset itself,
 * which would otherwise be silently dropped by the unique keys.
 */
export function planLibrarySeed(data, existing = []) {
  const codes = new Set(existing.map((r) => r.internal_code.toUpperCase()));
  const names = new Set(existing.map((r) => r.name.toLowerCase()));
  const insert = [];
  const skipped = [];
  const duplicates = [];
  const seenCodes = new Set();
  const seenNames = new Set();
  for (const t of data.tests) {
    const code = t.internal_code.toUpperCase();
    const name = t.name.toLowerCase();
    if (seenCodes.has(code) || seenNames.has(name)) {
      duplicates.push(t);
      continue;
    }
    seenCodes.add(code);
    seenNames.add(name);
    if (codes.has(code) || names.has(name)) skipped.push(t);
    else insert.push(t);
  }
  return {
    insert,
    skipped,
    duplicates,
    excluded: data.excluded ?? [],
    review: data.review ?? [],
    related: data.tests.filter((t) => t.review_note),
  };
}

export function formatSeedSummary(plan, inserted = plan.insert.length) {
  return [
    `Lab test library: ${inserted} imported, ${plan.skipped.length} already present (skipped),`,
    `${plan.duplicates.length} duplicate(s) inside the dataset, ${plan.excluded.length} excluded as non-laboratory,`,
    `${plan.review.length} held back for review, ${plan.related.length} imported with a related-entry note.`,
  ].join(' ');
}

export async function seedLabTestLibrary(conn, data) {
  const [existing] = await conn.query(`SELECT internal_code, name FROM lab_test_library`);
  const plan = planLibrarySeed(data, existing);
  let inserted = 0;
  if (plan.insert.length > 0) {
    const [res] = await conn.query(
      `INSERT IGNORE INTO lab_test_library
         (id, internal_code, name, category, abbreviations, description, reference_url, source, status)
       VALUES ?`,
      [
        plan.insert.map((t) => [
          randomUUID(),
          t.internal_code,
          t.name,
          t.category,
          t.abbreviations ?? null,
          t.description ?? null,
          t.reference_url ?? null,
          t.source ?? 'manual',
          'active',
        ]),
      ],
    );
    inserted = res.affectedRows;
  }
  return { plan, inserted, summary: formatSeedSummary(plan, inserted) };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const data = await loadLibraryData();
  if (process.argv.includes('--dry-run')) {
    const plan = planLibrarySeed(data);
    console.log(formatSeedSummary(plan));
    if (plan.review.length) {
      console.log('\nHeld back for review:');
      for (const r of plan.review) console.log(`  - ${r.name}: ${r.reason}`);
    }
    process.exit(0);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Run with: node --env-file=.env api/scripts/lab-test-library-seed.mjs');
    process.exit(1);
  }
  const { createConnection } = await import('mysql2/promise');
  const conn = await createConnection({ uri: url });
  try {
    const { summary } = await seedLabTestLibrary(conn, data);
    console.log(summary);
  } finally {
    await conn.end();
  }
}
