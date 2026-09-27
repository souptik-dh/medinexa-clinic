#!/usr/bin/env node
/**
 * One-off: moves the seeded "Medinexa Care Clinic" (owner Vikram Paul) data under
 * "Belari Hazra Clinic" (owner "Hazra Clinic"), then deletes the empty seeded clinic
 * and Vikram Paul's account. Single transaction; dry run (rolled back) unless --commit.
 *
 *   node --env-file=.env api/scripts/move-seed-to-hazra.mjs            # dry run
 *   node --env-file=.env api/scripts/move-seed-to-hazra.mjs --commit   # apply
 */
import { createConnection } from 'mysql2/promise';

const SRC = 'a7e65af7-9cbc-4873-aa8d-77ddb4f796d7'; // Medinexa Care Clinic (seeded)
const DST = 'b353d39f-0814-431b-9686-1c438441bad5'; // Belari Hazra Clinic
const OLD_OWNER = 'e78c1801-5c75-4686-8b72-ba4a3355d1cc'; // Vikram Paul
const NEW_OWNER = '2012430b-131f-4f48-b39d-591045b59966'; // Hazra Clinic
const OLD_NAME = 'Medinexa Care Clinic';
const NEW_NAME = 'Belari Hazra Clinic';
const commit = process.argv.includes('--commit');

const c = await createConnection({ uri: process.env.DATABASE_URL });
const run = async (label, sql, params) => {
  const [r] = await c.query(sql, params);
  if (r.affectedRows) console.log(`  ${label.padEnd(58)} ${r.affectedRows}`);
};

await c.beginTransaction();
try {
  const [[chk]] = await c.query(
    `SELECT (SELECT owner_user_id FROM clinics WHERE id = ?) a, (SELECT owner_user_id FROM clinics WHERE id = ?) b`,
    [SRC, DST],
  );
  if (chk.a !== OLD_OWNER || chk.b !== NEW_OWNER) throw new Error(`clinic/owner mismatch: ${JSON.stringify(chk)}`);
  const [brs] = await c.query(`SELECT id FROM branches WHERE clinic_id = ?`, [SRC]);
  const branchIds = brs.map((b) => b.id);

  // Seed-only subscription records — Belari Hazra Clinic keeps its own subscription.
  const [offers] = await c.query(`SELECT offer_id FROM subscription_offer_recipients WHERE clinic_id = ?`, [SRC]);
  await run('delete subscription_offer_recipients', `DELETE FROM subscription_offer_recipients WHERE clinic_id = ?`, [SRC]);
  for (const { offer_id } of offers) {
    await run(
      'delete seed subscription_offers (no other recipients)',
      `DELETE FROM subscription_offers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscription_offer_recipients WHERE offer_id = ?)`,
      [offer_id, offer_id],
    );
  }
  await run('delete subscription_history', `DELETE FROM subscription_history WHERE clinic_id = ?`, [SRC]);
  await run('delete subscription_payments', `DELETE FROM subscription_payments WHERE clinic_id = ?`, [SRC]);
  await run('delete clinic_subscriptions', `DELETE FROM clinic_subscriptions WHERE clinic_id = ?`, [SRC]);

  // Re-home every clinic-scoped row.
  for (const t of ['branches', 'appointments', 'branch_lab_tests', 'clinic_payment_ledger', 'lab_test_appointments', 'lab_test_categories', 'lab_tests', 'patient_documents', 'receipts']) {
    await run(`move ${t}.clinic_id`, `UPDATE ${t} SET clinic_id = ? WHERE clinic_id = ?`, [DST, SRC]);
  }
  await run('move users.preferred_clinic_id', `UPDATE users SET preferred_clinic_id = ? WHERE preferred_clinic_id = ?`, [DST, SRC]);

  // Rename branches and the clinic name baked into JSON snapshots.
  if (branchIds.length) {
    await run('rename branches', `UPDATE branches SET name = REPLACE(name, ?, ?) WHERE id IN (?)`, [OLD_NAME, NEW_NAME, branchIds]);
    await run(
      'rewrite receipts.details_json',
      `UPDATE receipts SET details_json = CAST(REPLACE(CAST(details_json AS CHAR), ?, ?) AS JSON) WHERE branch_id IN (?)`,
      [OLD_NAME, NEW_NAME, branchIds],
    );
    await run(
      'rewrite notifications.payload_json',
      `UPDATE notifications SET payload_json = CAST(REPLACE(CAST(payload_json AS CHAR), ?, ?) AS JSON)
        WHERE branch_id IN (?) AND payload_json IS NOT NULL`,
      [OLD_NAME, NEW_NAME, branchIds],
    );
  }

  // Hand everything Vikram Paul created/owns to the Hazra owner (every CHAR(36) non-PK column).
  await run('delete old owner device_tokens', `DELETE FROM device_tokens WHERE user_id = ?`, [OLD_OWNER]);
  const [cols] = await c.query(
    `SELECT c.TABLE_NAME t, c.COLUMN_NAME col FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES tb
         ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME AND tb.TABLE_TYPE = 'BASE TABLE'
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.DATA_TYPE = 'char' AND c.CHARACTER_MAXIMUM_LENGTH = 36 AND c.COLUMN_KEY <> 'PRI'`,
  );
  for (const { t, col } of cols) {
    await run(`reassign ${t}.${col}`, `UPDATE \`${t}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`, [NEW_OWNER, OLD_OWNER]);
  }

  await run('delete empty seeded clinic', `DELETE FROM clinics WHERE id = ?`, [SRC]);
  await run('delete Vikram Paul user', `DELETE FROM users WHERE id = ?`, [OLD_OWNER]);

  const [[left]] = await c.query(
    `SELECT (SELECT COUNT(*) FROM branches WHERE clinic_id = ?) branches,
            (SELECT COUNT(*) FROM appointments WHERE clinic_id = ?) appointments,
            (SELECT COUNT(*) FROM lab_test_appointments WHERE clinic_id = ?) lab_appointments`,
    [DST, DST, DST],
  );
  console.log(`\n${NEW_NAME} now has:`, left);
  if (commit) {
    await c.commit();
    console.log('COMMITTED');
  } else {
    await c.rollback();
    console.log('DRY RUN — rolled back. Re-run with --commit to apply.');
  }
} catch (err) {
  await c.rollback();
  console.error('FAILED — rolled back, nothing changed.');
  throw err;
} finally {
  await c.end();
}
