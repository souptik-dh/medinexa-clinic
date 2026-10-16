import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: npm run db:wipe-patient-data');
  process.exit(1);
}

// Removes every patient account and every booking (doctor appointments and lab
// test appointments, plus their payments, receipts, prescriptions and logs),
// while keeping clinics, branches, doctors, staff, lab test catalogues,
// schedules and subscriptions intact.
//
// Without --confirm this is a dry run that only prints row counts.
const confirm = process.argv.includes('--confirm');

// Booking + patient-owned data: emptied completely.
const WIPE = [
  // Doctor bookings
  'appointments', 'appointment_patients', 'appointment_status_log', 'appointment_waitlist',
  'payments', 'refunds', 'receipts', 'reviews', 'clinic_payment_ledger',
  'prescriptions', 'prescription_scan_jobs',
  // Lab bookings
  'lab_test_appointments', 'lab_test_appointment_patients', 'lab_test_appointment_status_log',
  'lab_test_payments', 'lab_test_prescriptions',
  // Patient details
  'patient_medical_profile', 'patient_devices', 'patient_family_links',
  'patient_documents', 'patient_document_deliveries', 'medical_documents',
  'medications', 'medication_doses',
];

const conn = await createConnection({ uri: url });
try {
  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  const tables = new Set(rows.map((r) => r.name));
  const present = WIPE.filter((t) => tables.has(t));

  const count = async (t, where = '') => (await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\` ${where}`))[0][0].c;
  console.log(`Database: ${db}\n`);
  for (const t of present) console.log(`  wipe   ${t.padEnd(34)} ${await count(t)}`);
  console.log(`  delete users (patient)                    ${await count('users', "WHERE role = 'patient'")}`);

  if (!confirm) {
    console.log('\nDry run only. Re-run with -- --confirm to delete. This cannot be undone.');
    process.exit(0);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of present) await conn.query(`TRUNCATE TABLE \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // FK checks back on so ON DELETE CASCADE clears the patients' tokens and notifications.
  const [res] = await conn.query("DELETE FROM users WHERE role = 'patient'");
  console.log(`\nDone. Truncated ${present.length} tables, deleted ${res.affectedRows} patient users.`);
} finally {
  await conn.end();
}
