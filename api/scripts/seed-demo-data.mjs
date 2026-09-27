#!/usr/bin/env node
/**
 * Demo-data seeder: builds one (or more) fully-populated clinics — branches, staff,
 * doctors, patients, doctor appointments, lab-test bookings, payments, receipts,
 * reviews, documents, subscription billing — so every clinic-scoped table has many
 * realistic, FK-consistent rows to exercise the portal and apps against.
 *
 *   npm run db:seed-demo -- --confirm [--dry-run] [--clinics 1] [--patients 60] [--doctors 8]
 *                                     [--branches 3] [--staff 5]
 *
 * - Runs in ONE transaction: any failure rolls everything back.
 * - Purely additive — never updates/deletes existing rows. Global master data
 *   (doctor_specializations, subscription_plans) is reused if present.
 * - Every seeded login shares the password printed at the end; seeded emails use the
 *   `@seed.medinexa.test` domain so they are easy to find.
 * - Skipped on purpose (transient/security or platform-global): refresh_tokens,
 *   otp_codes, password_reset_tokens, email_verification_tokens, idempotency_keys,
 *   super_admins, platform_settings.
 */
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env scripts/seed-demo-data.mjs -- --confirm');
  process.exit(1);
}

const argv = process.argv.slice(2);
const numFlag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  const v = i > -1 ? Number(argv[i + 1]) : def;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
};
const CLINICS = numFlag('clinics', 1);
const PATIENTS = numFlag('patients', 60);
const DOCTORS = numFlag('doctors', 8);
const BRANCHES = numFlag('branches', 3);
const STAFF_PER_BRANCH = numFlag('staff', 5);
const PASSWORD = 'Seed@1234';
// Inserts everything inside the transaction, then rolls back — validates FKs/unique keys
// against the real schema without keeping any rows.
const DRY_RUN = argv.includes('--dry-run');

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
})();

if (!argv.includes('--confirm')) {
  console.error(
    `Refusing to run without --confirm.\n` +
      `This inserts demo data (${CLINICS} clinic(s), ${PATIENTS} patients each, hundreds of appointments) into:\n` +
      `  ${host}\n` +
      `Re-run as: npm run db:seed-demo -- --confirm`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Random + formatting helpers
// ---------------------------------------------------------------------------
const rand = Math.random;
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const sample = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, Math.min(n, arr.length));
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
};
const id = () => randomUUID();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const pad = (n, w = 2) => String(n).padStart(w, '0');

// All DATETIME columns are UTC; business dates/times (scheduled_date, slot times)
// are clinic-local (Asia/Kolkata, UTC+05:30).
const IST_MS = 330 * 60 * 1000;
const dt = (d) => d.toISOString().replace('T', ' ').replace('Z', '');
const dateStr = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const todayIst = dateStr(new Date(now.getTime() + IST_MS));
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
};
const weekdayOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
// Local (IST) date + "HH:MM" → UTC Date.
const istToUtc = (ymd, hhmm = '00:00') => new Date(new Date(`${ymd}T${hhmm}:00Z`).getTime() - IST_MS);
const plusMin = (d, m) => new Date(d.getTime() + m * 60000);
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const clampPast = (d) => (d > now ? new Date(now.getTime() - randInt(1, 3600) * 1000) : d);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const MALE = ['Arjun', 'Rahul', 'Sourav', 'Amit', 'Rohit', 'Vikram', 'Aniket', 'Debashis', 'Sayan', 'Kunal', 'Arnab', 'Rajesh', 'Suman', 'Pritam', 'Abhishek', 'Sandeep', 'Manish', 'Tanmay', 'Subhajit', 'Nikhil', 'Aditya', 'Kaushik', 'Partha', 'Indranil'];
const FEMALE = ['Priya', 'Ananya', 'Sneha', 'Riya', 'Pooja', 'Moumita', 'Sreya', 'Tanisha', 'Payel', 'Ishita', 'Rupa', 'Shreya', 'Nandini', 'Madhurima', 'Kavya', 'Anjali', 'Debolina', 'Srijita', 'Megha', 'Aishwarya', 'Swati', 'Rimpa', 'Oindrila', 'Sohini'];
const LAST = ['Das', 'Banerjee', 'Chatterjee', 'Mukherjee', 'Ghosh', 'Bose', 'Sen', 'Roy', 'Dutta', 'Saha', 'Chakraborty', 'Mondal', 'Sarkar', 'Paul', 'Biswas', 'Sharma', 'Gupta', 'Singh', 'Nandi', 'Kar', 'Majumdar', 'Bhattacharya', 'Halder', 'Pal'];

const LOCATIONS = [
  { city: 'Kolkata', district: 'Kolkata', pin: '700019', po: 'Ballygunge', near: 'Near Gariahat Market', lat: 22.5196, lng: 88.3656 },
  { city: 'Kolkata', district: 'Kolkata', pin: '700091', po: 'Salt Lake', near: 'Opp. City Centre 1', lat: 22.5867, lng: 88.4171 },
  { city: 'Howrah', district: 'Howrah', pin: '711101', po: 'Howrah', near: 'Near Howrah Maidan', lat: 22.5795, lng: 88.3093 },
  { city: 'Durgapur', district: 'Paschim Bardhaman', pin: '713216', po: 'Benachity', near: 'Near City Centre', lat: 23.5204, lng: 87.3119 },
  { city: 'Siliguri', district: 'Darjeeling', pin: '734001', po: 'Siliguri', near: 'Near Hill Cart Road', lat: 26.7271, lng: 88.3953 },
  { city: 'Asansol', district: 'Paschim Bardhaman', pin: '713301', po: 'Asansol', near: 'Near Asansol Station', lat: 23.6739, lng: 86.9524 },
  { city: 'Barasat', district: 'North 24 Parganas', pin: '700124', po: 'Barasat', near: 'Near Champadali More', lat: 22.7236, lng: 88.4806 },
  { city: 'Kalyani', district: 'Nadia', pin: '741235', po: 'Kalyani', near: 'Near AIIMS Kalyani', lat: 22.9751, lng: 88.4345 },
];
const STREETS = ['Rashbehari Avenue', 'Park Street', 'Lake Road', 'GT Road', 'Station Road', 'College Street', 'Sarat Bose Road', 'VIP Road', 'Hazra Road', 'Sector V'];

const CLINIC_NAMES = ['Medinexa Care Clinic', 'Sunrise Health Clinic', 'Lifeline Multispeciality', 'Arogya Family Clinic', 'Nirmal Health Point', 'CityCare Polyclinic'];
const BRANCH_SUFFIXES = ['Main Branch', 'City Centre', 'Station Road', 'Lake Town', 'Salt Lake', 'Riverside'];

const SPECIALIZATIONS = [
  ['General Physician', 'Primary care for common illnesses'],
  ['Cardiologist', 'Heart and blood vessel disorders'],
  ['Dermatologist', 'Skin, hair and nail conditions'],
  ['Pediatrician', 'Medical care for infants and children'],
  ['Gynecologist', "Women's reproductive health"],
  ['Orthopedic Surgeon', 'Bones, joints and muscles'],
  ['ENT Specialist', 'Ear, nose and throat'],
  ['Neurologist', 'Brain and nervous system'],
  ['Psychiatrist', 'Mental health'],
  ['Ophthalmologist', 'Eye care'],
  ['Diabetologist', 'Diabetes management'],
  ['Pulmonologist', 'Lungs and respiratory tract'],
  ['Gastroenterologist', 'Digestive system'],
  ['Dentist', 'Oral and dental care'],
];
const DEGREES = ['MBBS', 'MBBS, MD', 'MBBS, MS', 'MBBS, DNB', 'MBBS, MD, DM', 'BDS, MDS'];
const SMC = 'West Bengal Medical Council';

const LAB_CATEGORIES = [
  ['Blood Test', '#DC2626'],
  ['Urine Test', '#D97706'],
  ['Imaging', '#2563EB'],
  ['Cardiology', '#DB2777'],
  ['Hormone', '#7C3AED'],
  ['Diabetes', '#059669'],
];
const LAB_TESTS = [
  ['Complete Blood Count', 'CBC', 'Blood Test', 250, 15, true, false],
  ['Liver Function Test', 'LFT', 'Blood Test', 600, 15, true, false],
  ['Kidney Function Test', 'KFT', 'Blood Test', 650, 15, true, false],
  ['Lipid Profile', 'LIPID', 'Blood Test', 550, 15, true, false],
  ['Vitamin D (25-OH)', 'VITD', 'Blood Test', 1200, 15, true, false],
  ['Vitamin B12', 'B12', 'Blood Test', 900, 15, true, false],
  ['C-Reactive Protein', 'CRP', 'Blood Test', 450, 15, true, false],
  ['Thyroid Profile (T3 T4 TSH)', 'TFT', 'Hormone', 500, 15, true, false],
  ['HbA1c', 'HBA1C', 'Diabetes', 450, 15, true, false],
  ['Fasting Blood Sugar', 'FBS', 'Diabetes', 80, 10, true, false],
  ['Post Prandial Blood Sugar', 'PPBS', 'Diabetes', 80, 10, true, false],
  ['Urine Routine & Microscopy', 'URINE-RE', 'Urine Test', 150, 10, true, false],
  ['Chest X-Ray (PA View)', 'XRAY-CHEST', 'Imaging', 400, 20, false, true],
  ['USG Whole Abdomen', 'USG-ABD', 'Imaging', 1400, 30, false, true],
  ['ECG', 'ECG', 'Cardiology', 300, 20, false, false],
  ['2D Echocardiography', 'ECHO', 'Cardiology', 2200, 30, false, true],
];
const PRECAUTIONS = {
  'Blood Test': ['Fast for 8–10 hours before the test', 'Drink plenty of water', 'Carry previous reports if any'],
  Diabetes: ['Fast for 10–12 hours (FBS)', 'Take sample exactly 2 hours after meal (PPBS)'],
  'Urine Test': ['Collect first morning mid-stream sample', 'Use the sterile container provided'],
  Imaging: ['Wear loose clothing', 'Remove metal jewellery', 'Full bladder required for USG'],
  Cardiology: ['Avoid caffeine 4 hours before', 'Wear a front-open top'],
  Hormone: ['Take the test before thyroid medication', 'Early morning sample preferred'],
};

const ALLERGIES = ['Penicillin', 'Sulfa drugs', 'Peanuts', 'Dust mites', 'Pollen', 'Lactose', 'Shellfish', null, null, null];
const CONDITIONS = ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Hypothyroidism', 'Migraine', 'PCOS', 'Arthritis', 'GERD', null, null];
const MEDS = [
  ['Metformin', '500 mg', 'Twice daily', ['08:00', '20:00']],
  ['Amlodipine', '5 mg', 'Once daily', ['09:00']],
  ['Thyronorm', '50 mcg', 'Once daily (empty stomach)', ['06:30']],
  ['Atorvastatin', '10 mg', 'Once at night', ['21:30']],
  ['Pantoprazole', '40 mg', 'Before breakfast', ['07:30']],
  ['Montelukast', '10 mg', 'Once at night', ['22:00']],
  ['Vitamin D3', '60000 IU', 'Once monthly', ['09:00']],
  ['Paracetamol', '650 mg', 'Thrice daily', ['08:00', '14:00', '20:00']],
];
const DEVICES = [
  ['Glucometer', 'glucometer', 'Accu-Chek', 'Active'],
  ['BP Monitor', 'bp_monitor', 'Omron', 'HEM-7120'],
  ['Pulse Oximeter', 'pulse_oximeter', 'Dr Trust', 'Signature 214'],
  ['Nebulizer', 'nebulizer', 'Philips', 'InnoSpire'],
  ['Thermometer', 'thermometer', 'Omron', 'MC-246'],
  ['Weighing Scale', 'weighing_scale', 'HealthSense', 'PS 126'],
];
const RX_TEXTS = [
  'Rx\n1. Tab Paracetamol 650mg — 1-0-1 x 5 days\n2. Tab Cetirizine 10mg — 0-0-1 x 5 days\nAdvice: plenty of fluids, rest.',
  'Rx\n1. Tab Amlodipine 5mg — 1-0-0 x 30 days\nAdvice: low-salt diet, BP log daily. Review after 1 month.',
  'Rx\n1. Tab Metformin 500mg — 1-0-1 x 30 days\nInvestigations: HbA1c, FBS, PPBS. Review with reports.',
  'Rx\n1. Cap Omeprazole 20mg — 1-0-0 before breakfast x 14 days\n2. Syp Antacid 10ml — SOS\nAvoid spicy food.',
  'Rx\n1. Tab Azithromycin 500mg — 1-0-0 x 3 days\n2. Steam inhalation twice daily\nReview if fever persists.',
];
const REVIEW_COMMENTS = ['Very patient and explained everything clearly.', 'Good experience, short waiting time.', 'Doctor was knowledgeable and friendly.', 'Clinic was clean, staff were helpful.', 'Had to wait a bit but consultation was thorough.', 'Highly recommended!', 'Prescription worked well, feeling better now.', null];

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
const conn = await createConnection({ uri: url, dateStrings: true, timezone: 'Z' });
const counts = {};
const buffers = new Map();
const add = (table, row) => {
  if (!buffers.has(table)) buffers.set(table, []);
  buffers.get(table).push(row);
  return row;
};

// FK-safe flush order (parents before children).
const ORDER = [
  'users', 'clinics', 'branches', 'branch_operating_days', 'branch_closures', 'branch_staff',
  'branch_gallery_images', 'doctor_specializations', 'doctor_invites', 'doctor_invite_specializations',
  'doctors', 'doctor_specialization_map', 'doctor_branch_assignments', 'doctor_slot_templates',
  'doctor_slot_exceptions', 'doctor_time_offs', 'patient_medical_profile', 'patient_devices',
  'medications', 'medication_doses', 'medical_documents', 'appointments', 'appointment_patients',
  'appointment_status_log', 'payments', 'refunds', 'prescriptions', 'prescription_scan_jobs', 'reviews',
  'appointment_waitlist', 'lab_test_categories', 'lab_tests', 'branch_lab_tests', 'lab_test_schedules',
  'lab_test_appointments', 'lab_test_appointment_patients', 'lab_test_prescriptions',
  'lab_test_appointment_status_log', 'lab_test_payments', 'receipts', 'clinic_payment_ledger',
  'subscription_plans', 'clinic_subscriptions', 'subscription_payments', 'subscription_history',
  'notifications', 'subscription_offers', 'subscription_offer_recipients', 'patient_documents',
  'patient_document_deliveries', 'device_tokens', 'audit_logs',
];

async function flush(table) {
  const rows = buffers.get(table);
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES ?`;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400).map((r) =>
      cols.map((c) => {
        const v = r[c];
        return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
      }),
    );
    await conn.query(sql, [chunk]);
  }
  counts[table] = (counts[table] ?? 0) + rows.length;
  buffers.set(table, []);
}

// ---------------------------------------------------------------------------
// Uniqueness trackers (globally unique columns)
// ---------------------------------------------------------------------------
const [phoneRows] = await conn.query('SELECT phone FROM users WHERE phone IS NOT NULL');
const usedPhones = new Set(phoneRows.map((r) => r.phone));
const newPhone = () => {
  let p;
  do p = `+91${pick(['6', '7', '8', '9'])}${pad(randInt(0, 999999999), 9)}`;
  while (usedPhones.has(p));
  usedPhones.add(p);
  return p;
};
const usedCodes = new Set();
const uniqueCode = (prefix, datePart) => {
  let c;
  do c = `${prefix}${datePart}${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
  while (usedCodes.has(c));
  usedCodes.add(c);
  return c;
};
const ymdCompact = (d) => dateStr(d).replace(/-/g, '');
const receiptNo = (d) => uniqueCode('RCT', ymdCompact(d));

const passwordHash = await bcrypt.hash(PASSWORD, 10);
let emailSeq = Date.now().toString(36);
let emailCounter = 0;
const seedEmail = (first, last) =>
  `${first}.${last}.${emailSeq}${++emailCounter}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@seed.medinexa.test';

const preferences = [];
function makeUser(role, opts = {}) {
  const gender = opts.gender ?? (chance(0.5) ? 'male' : 'female');
  const first = opts.first ?? pick(gender === 'male' ? MALE : FEMALE);
  const last = opts.last ?? pick(LAST);
  const loc = opts.loc ?? pick(LOCATIONS);
  const heightCm = role === 'patient' ? randInt(145, 185) : null;
  const weightKg = role === 'patient' ? randInt(42, 98) : null;
  const created = opts.createdAt ?? daysAgo(randInt(60, 200));
  const userId = id();
  if (opts.clinicId) preferences.push([opts.clinicId, opts.branchId ?? null, userId]);
  return add('users', {
    id: userId,
    name: `${opts.prefix ?? ''}${first} ${last}`,
    first_name: first,
    last_name: last,
    email: opts.noEmail ? null : seedEmail(first, last),
    phone: newPhone(),
    phone_verified: opts.noLogin ? 0 : 1,
    date_of_birth: opts.dob ?? `${randInt(1955, 2004)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`,
    gender,
    height_cm: heightCm,
    weight_kg: weightKg,
    bmi: heightCm ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10 : null,
    address: `${randInt(1, 250)}, ${pick(STREETS)}, ${loc.city}`,
    nearby_location: loc.near,
    city: loc.city,
    district: loc.district,
    pin_code: loc.pin,
    state: 'West Bengal',
    post_office: loc.po,
    photo_url: chance(0.6) ? `https://i.pravatar.cc/300?u=${randomBytes(6).toString('hex')}` : null,
    // Set after clinics/branches exist (fk_users_preferred_clinic) — see preferences below.
    preferred_clinic_id: null,
    preferred_branch_id: null,
    password_hash: opts.noLogin ? null : passwordHash,
    role,
    status: opts.status ?? 'active',
    created_at: dt(created),
  });
}

// ---------------------------------------------------------------------------
// Global master data (reused if already present)
// ---------------------------------------------------------------------------
const slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const [specRows] = await conn.query('SELECT id, name, slug FROM doctor_specializations');
const specBySlug = new Map(specRows.map((r) => [r.slug, r]));
for (const [name, description] of SPECIALIZATIONS) {
  const slug = slugify(name);
  if (!specBySlug.has(slug)) {
    specBySlug.set(slug, add('doctor_specializations', { id: id(), name, slug, description, status: 'active' }));
  }
}
const specs = SPECIALIZATIONS.map(([name]) => specBySlug.get(slugify(name)));

const [planRows] = await conn.query(
  'SELECT id, amount, currency FROM subscription_plans WHERE is_active = 1 ORDER BY effective_from DESC LIMIT 1',
);
const plan =
  planRows[0] ??
  add('subscription_plans', {
    id: id(), name: 'Clinic Monthly', billing_period: 'monthly', amount: 49.0, currency: 'INR',
    trial_months: 2, is_active: 1, effective_from: dt(daysAgo(365)), created_by: null,
  });

const [adminRows] = await conn.query(
  `SELECT u.id FROM users u JOIN super_admins s ON s.user_id = u.id
    WHERE u.role = 'sys_admin' AND s.revoked_at IS NULL LIMIT 1`,
);
const superAdminId = adminRows[0]?.id ?? null;

// ---------------------------------------------------------------------------
// Build one clinic
// ---------------------------------------------------------------------------
const logins = [];
const PERM_SETS = {
  Manager: ['appointments:confirm', 'appointments:payment', 'appointments:complete', 'appointments:cancel', 'staff:manage', 'doctors:manage', 'patients:view', 'reviews:view', 'branch:settings', 'branch:reports', 'branch:analytics', 'lab_tests:manage', 'lab_appointments:view', 'lab_appointments:approve', 'lab_appointments:reject', 'lab_appointments:cancel', 'lab_appointments:complete', 'lab_payments:view', 'lab_payments:collect', 'lab_prescriptions:view', 'patient_documents:upload', 'patient_documents:view', 'patient_documents:delete', 'patient_documents:email', 'patient_documents:print'],
  Receptionist: ['appointments:confirm', 'appointments:payment', 'appointments:complete', 'appointments:cancel', 'patients:view', 'lab_appointments:view', 'lab_payments:collect', 'patient_documents:view', 'patient_documents:print'],
  'Lab Technician': ['patients:view', 'lab_appointments:view', 'lab_appointments:approve', 'lab_appointments:reject', 'lab_appointments:complete', 'lab_prescriptions:view', 'patient_documents:upload', 'patient_documents:view', 'patient_documents:email'],
  Accountant: ['appointments:payment', 'patients:view', 'lab_payments:view', 'lab_payments:collect', 'branch:reports'],
  Nurse: ['appointments:confirm', 'appointments:complete', 'patients:view', 'patient_documents:view'],
};
const STAFF_ROLES = ['Manager', 'Receptionist', 'Receptionist', 'Lab Technician', 'Accountant', 'Nurse'];

function buildClinic(ci) {
  const clinicName = `${CLINIC_NAMES[ci % CLINIC_NAMES.length]}${ci >= CLINIC_NAMES.length ? ` ${ci + 1}` : ''}`;
  const homeLoc = LOCATIONS[ci % LOCATIONS.length];
  const clinicCreated = daysAgo(150);

  // --- owner + clinic -------------------------------------------------------
  const owner = makeUser('clinic_owner', { loc: homeLoc, createdAt: clinicCreated, prefix: '' });
  const clinic = add('clinics', {
    id: id(),
    name: clinicName,
    description: `${clinicName} is a multispeciality outpatient clinic offering consultations, diagnostics and home sample collection.`,
    nearby_location: homeLoc.near, city: homeLoc.city, district: homeLoc.district, pin_code: homeLoc.pin,
    state: 'West Bengal', post_office: homeLoc.po, owner_user_id: owner.id,
    trade_license_number: `TL/WB/${randInt(100000, 999999)}`, trade_license_url: null,
    trade_license_validated: 1, trade_license_validation_status: 'VALID', trade_license_validated_at: dt(daysAgo(140)),
    drug_license_number: `WB/DL/${randInt(10000, 99999)}`, drug_license_url: null,
    clinical_establishment_reg_number: `CE/WB/${randInt(1000, 9999)}/${now.getUTCFullYear() - 1}`, clinical_establishment_reg_url: null,
    created_at: dt(clinicCreated),
  });
  logins.push(['clinic_owner', owner.name, owner.phone, owner.email]);
  const audit = (actor, action, type, resId, changes, at) =>
    add('audit_logs', { id: id(), actor_user_id: actor, action, resource_type: type, resource_id: resId, changes_json: changes ?? null, ip_address: `103.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}`, created_at: dt(at) });
  audit(owner.id, 'clinic.create', 'clinic', clinic.id, { name: clinicName }, clinicCreated);

  // --- branches -----------------------------------------------------------
  const branches = [];
  for (let bi = 0; bi < BRANCHES; bi++) {
    const loc = LOCATIONS[(ci + bi) % LOCATIONS.length];
    const created = plusMin(clinicCreated, (bi + 1) * 60 * 24);
    const branch = add('branches', {
      id: id(), clinic_id: clinic.id, name: `${clinicName} — ${BRANCH_SUFFIXES[bi % BRANCH_SUFFIXES.length]}`,
      address: `${randInt(1, 200)}, ${pick(STREETS)}, ${loc.city} ${loc.pin}`,
      nearby_location: loc.near, city: loc.city, district: loc.district, pin_code: loc.pin, state: 'West Bengal', post_office: loc.po,
      phone: newPhone(), lat: +(loc.lat + (rand() - 0.5) * 0.02).toFixed(7), lng: +(loc.lng + (rand() - 0.5) * 0.02).toFixed(7),
      timezone: 'Asia/Kolkata', photo_url: `https://picsum.photos/seed/medinexa-branch-${randomBytes(4).toString('hex')}/1200/800`,
      trade_license_number: `TL/WB/${randInt(100000, 999999)}`, trade_license_url: null,
      trade_license_validated: bi === BRANCHES - 1 ? 0 : 1, trade_license_validation_status: bi === BRANCHES - 1 ? 'PENDING' : 'VALID',
      trade_license_validated_at: bi === BRANCHES - 1 ? null : dt(plusMin(created, 60 * 24)),
      drug_license_number: `WB/DL/${randInt(10000, 99999)}`, drug_license_url: null,
      clinical_establishment_reg_number: `CE/WB/${randInt(1000, 9999)}`, clinical_establishment_reg_url: null,
      created_at: dt(created),
    });
    audit(owner.id, 'branch.create', 'branch', branch.id, { name: branch.name }, created);

    // Sunday closed at every branch except the first; all other days open.
    const closedWeekdays = new Set(bi === 0 ? [] : [0]);
    for (let wd = 0; wd <= 6; wd++) {
      add('branch_operating_days', { id: id(), branch_id: branch.id, weekday: wd, is_open: closedWeekdays.has(wd) ? 0 : 1 });
    }
    const closures = [
      { start: addDays(todayIst, -randInt(20, 40)), len: 1, reason: 'Staff training day', status: 'active' },
      { start: addDays(todayIst, randInt(18, 30)), len: 3, reason: 'Durga Puja holidays', status: 'active' },
      { start: addDays(todayIst, randInt(5, 12)), len: 1, reason: 'Maintenance (rescheduled)', status: 'cancelled' },
    ];
    const closedDates = new Set();
    for (const c of closures) {
      const end = addDays(c.start, c.len - 1);
      add('branch_closures', { id: id(), branch_id: branch.id, start_date: c.start, end_date: end, reason: c.reason, status: c.status, created_by: owner.id, created_at: dt(daysAgo(randInt(45, 60))) });
      if (c.status === 'active') for (let i = 0; i < c.len; i++) closedDates.add(addDays(c.start, i));
    }
    for (let g = 0; g < 5; g++) {
      const pid = `medinexa/seed/${branch.id.slice(0, 8)}-${g}`;
      add('branch_gallery_images', { id: id(), branch_id: branch.id, public_id: pid, image_url: `https://picsum.photos/seed/${pid.replace(/\//g, '-')}/1200/800`, position: g });
    }

    // --- staff ------------------------------------------------------------
    const staff = [];
    for (let si = 0; si < STAFF_PER_BRANCH; si++) {
      const title = STAFF_ROLES[si % STAFF_ROLES.length];
      const u = makeUser('branch_staff', { loc, createdAt: plusMin(created, randInt(1, 10) * 1440) });
      const joined = si === STAFF_PER_BRANCH - 1 ? null : plusMin(new Date(u.created_at.replace(' ', 'T') + 'Z'), randInt(60, 2880));
      add('branch_staff', { id: id(), branch_id: branch.id, user_id: u.id, added_by: owner.id, permissions_json: PERM_SETS[title], joined_at: joined ? dt(joined) : null, created_at: u.created_at });
      audit(owner.id, 'staff.add', 'branch_staff', u.id, { branch_id: branch.id, title }, new Date(u.created_at.replace(' ', 'T') + 'Z'));
      if (joined) {
        add('notifications', { id: id(), user_id: owner.id, branch_id: branch.id, type: 'staff_joined', payload_json: { staff_user_id: u.id, staff_name: u.name, branch_name: branch.name }, read_at: chance(0.8) ? dt(plusMin(joined, 120)) : null, created_at: dt(joined) });
      }
      staff.push({ user: u, title, joined });
      if (si < 2) logins.push([`branch_staff (${title})`, u.name, u.phone, u.email]);
    }
    const joinedStaff = staff.filter((s) => s.joined);
    branches.push({ row: branch, loc, closedWeekdays, closedDates, staff: joinedStaff.length ? joinedStaff : staff });
  }
  const staffOf = (b) => pick(b.staff).user.id;

  // --- doctors ------------------------------------------------------------
  const doctors = [];
  for (let di = 0; di < DOCTORS; di++) {
    const gender = chance(0.5) ? 'male' : 'female';
    const primary = branches[di % branches.length];
    const u = makeUser('doctor', { gender, loc: primary.loc, prefix: 'Dr. ', dob: `${randInt(1965, 1992)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`, createdAt: daysAgo(randInt(100, 140)) });
    const mySpecs = [specs[di % specs.length], ...(chance(0.35) ? [pick(specs)] : [])].filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
    const doc = add('doctors', {
      id: id(), user_id: u.id, name: u.name, specialization: null,
      reg_no: `${randInt(10000, 99999)}${randomBytes(2).toString('hex').toUpperCase()}`, smc_name: SMC,
      doctor_degree: mySpecs[0].name === 'Dentist' ? 'BDS, MDS' : pick(DEGREES.slice(0, 5)), phone: u.phone,
      certificate_url: null, photo_url: `https://i.pravatar.cc/400?u=${u.id}`,
      bio: `${u.name} is a ${mySpecs.map((s) => s.name).join(' & ')} with ${randInt(5, 25)} years of clinical experience.`,
      created_at: u.created_at,
    });
    for (const s of mySpecs) add('doctor_specialization_map', { id: id(), doctor_id: doc.id, specialization_id: s.id });
    if (di < 2) logins.push(['doctor', u.name, u.phone, u.email]);

    const assignBranches = [primary, ...(di % 2 === 0 && branches.length > 1 ? [branches[(di + 1) % branches.length]] : [])];
    const assignments = assignBranches.map((b, ai) => {
      const slotType = chance(0.25) ? 'sequential' : 'fixed';
      const a = add('doctor_branch_assignments', {
        id: id(), doctor_id: doc.id, branch_id: b.row.id, fee_amount: randInt(6, 20) * 50, currency: 'INR',
        is_active: 1, slot_type: slotType, created_at: u.created_at,
      });
      // Primary branch: mornings Mon–Sat (+ evenings Tue/Thu); secondary branch: evenings Mon/Wed/Fri.
      const dur = pick([10, 15, 20, 30]);
      const maxP = slotType === 'sequential' ? 1 : pick([1, 1, 1, 2]);
      const blocks = ai === 0
        ? [...[1, 2, 3, 4, 5, 6].map((wd) => [wd, 'morning', '09:30', '13:30']), [2, 'evening', '17:00', '20:00'], [4, 'evening', '17:00', '20:00']]
        : [1, 3, 5].map((wd) => [wd, 'evening', '17:30', '20:30']);
      const templates = blocks.map(([weekday, label, start, end]) =>
        add('doctor_slot_templates', {
          id: id(), doctor_branch_assignment_id: a.id, weekday, label, start_time: `${start}:00`, end_time: `${end}:00`,
          slot_duration_minutes: dur, max_patients: maxP, is_active: 1, start_date: addDays(todayIst, -120), end_date: null,
        }),
      );
      // Leaves: one past, one upcoming (both block availability), one cancelled.
      const leaves = new Set();
      const pastLeave = addDays(todayIst, -randInt(10, 50));
      const futureLeave = addDays(todayIst, randInt(3, 12));
      add('doctor_slot_exceptions', { id: id(), doctor_branch_assignment_id: a.id, excluded_date: pastLeave, end_date: addDays(pastLeave, 1), reason: 'Personal leave', status: 'active', created_at: dt(daysAgo(60)) });
      add('doctor_slot_exceptions', { id: id(), doctor_branch_assignment_id: a.id, excluded_date: futureLeave, end_date: null, reason: pick(['Medical conference', 'Family function', 'Out of station']), status: 'active', created_at: dt(daysAgo(2)) });
      add('doctor_slot_exceptions', { id: id(), doctor_branch_assignment_id: a.id, excluded_date: addDays(todayIst, randInt(13, 20)), end_date: null, reason: 'Leave withdrawn', status: 'cancelled', created_at: dt(daysAgo(5)) });
      for (const d of [pastLeave, addDays(pastLeave, 1), futureLeave]) leaves.add(d);
      return { row: a, branch: b, templates, leaves, dur, maxP, slotType };
    });
    const offStart = istToUtc(addDays(todayIst, randInt(1, 14)), '14:00');
    add('doctor_time_offs', { id: id(), doctor_id: doc.id, branch_id: primary.row.id, reason: 'Hospital OT duty', starts_at: dt(offStart), ends_at: dt(plusMin(offStart, 180)), created_by: owner.id, created_at: dt(daysAgo(3)) });
    doctors.push({ row: doc, user: u, assignments });
  }

  // --- doctor invites (pending / expired / revoked) -----------------------
  for (const b of branches) {
    for (const status of ['pending', 'pending', 'expired', 'revoked']) {
      const gender = chance(0.5) ? 'male' : 'female';
      const first = pick(gender === 'male' ? MALE : FEMALE);
      const last = pick(LAST);
      const spec = pick(specs);
      const created = status === 'pending' ? daysAgo(randInt(0, 5)) : daysAgo(randInt(20, 40));
      const invite = add('doctor_invites', {
        id: id(), branch_id: b.row.id, email: seedEmail(first, last), name: `Dr. ${first} ${last}`, specialization: null,
        phone: newPhone(), fee_amount: randInt(6, 16) * 50, currency: 'INR', certificate_url: null,
        slot_template: [1, 3, 5].map((wd) => ({ weekday: wd, label: 'morning', start_time: '10:00', end_time: '13:00', slot_duration_minutes: 15, max_patients: 1, is_active: true, start_date: addDays(todayIst, 1), end_date: null })),
        slot_type: 'fixed', invite_code_hash: sha256(randomBytes(16).toString('hex')),
        reg_no: `${randInt(10000, 99999)}${randomBytes(2).toString('hex').toUpperCase()}`, smc_name: SMC, doctor_degree: 'MBBS, MD',
        status, invited_by: owner.id, expires_at: dt(plusMin(created, 7 * 1440)), created_at: dt(created),
      });
      add('doctor_invite_specializations', { id: id(), doctor_invite_id: invite.id, specialization_id: spec.id });
    }
  }
  for (const d of doctors) {
    add('notifications', { id: id(), user_id: owner.id, branch_id: d.assignments[0].branch.row.id, type: 'doctor_invite_accepted', payload_json: { doctor_id: d.row.id, doctor_name: d.row.name }, read_at: dt(daysAgo(90)), created_at: d.row.created_at });
  }

  // --- patients (+ family members booked on their behalf) -----------------
  const patients = [];
  for (let pi = 0; pi < PATIENTS; pi++) {
    const home = pick(branches);
    const walkIn = chance(0.15); // registered at reception, never logged in
    const u = makeUser('patient', { loc: home.loc, clinicId: clinic.id, branchId: home.row.id, noLogin: walkIn, noEmail: walkIn && chance(0.5), createdAt: daysAgo(randInt(65, 140)) });
    const family = [];
    if (!walkIn && chance(0.35)) {
      const rel = pick(['spouse', 'child', 'parent', 'sibling']);
      const age = rel === 'child' ? randInt(3, 16) : rel === 'parent' ? randInt(55, 80) : randInt(20, 50);
      const fu = makeUser('patient', { loc: home.loc, last: u.last_name, noLogin: true, noEmail: true, dob: `${now.getUTCFullYear() - age}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`, createdAt: new Date(u.created_at.replace(' ', 'T') + 'Z') });
      family.push({ user: fu, relationship: rel, age });
    }
    const p = { user: u, home, walkIn, family, age: now.getUTCFullYear() - Number(u.date_of_birth.slice(0, 4)) };
    patients.push(p);
    if (pi < 3 && !walkIn) logins.push(['patient', u.name, u.phone, u.email]);

    // Medical profile, devices, medications, self-uploaded documents.
    const ec = makeName();
    add('patient_medical_profile', {
      patient_id: u.id, blood_group: pick(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']),
      allergies: pick(ALLERGIES), medical_conditions: pick(CONDITIONS), current_medications: null,
      previous_surgeries: chance(0.2) ? pick(['Appendectomy (2015)', 'C-section (2019)', 'Knee arthroscopy (2021)', 'Cataract surgery (2022)']) : null,
      medical_notes: chance(0.3) ? 'Prefers morning appointments.' : null,
      emergency_contact_name: ec, emergency_contact_relationship: pick(['Spouse', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter']),
      emergency_contact_phone: `+91${pick(['7', '8', '9'])}${pad(randInt(0, 999999999), 9)}`,
    });
    if (walkIn) continue;
    for (const [name, category, brand, model] of sample(DEVICES, chance(0.5) ? randInt(1, 2) : 0)) {
      add('patient_devices', { id: id(), patient_id: u.id, name, category, brand, model, serial_number: `SN${randomBytes(4).toString('hex').toUpperCase()}`, notes: null });
    }
    for (const [name, dosage, freq, times] of sample(MEDS, chance(0.6) ? randInt(1, 3) : 0)) {
      const monthly = name === 'Vitamin D3';
      const med = add('medications', {
        id: id(), patient_id: u.id, name, dosage, frequency_label: freq, schedule_type: monthly ? 'monthly' : 'daily',
        day_of_month: monthly ? 1 : null, times, prescriber: pick(doctors).row.name,
        refill_date: addDays(todayIst, randInt(3, 30)), is_active: chance(0.9) ? 1 : 0,
      });
      if (monthly) continue;
      for (let d = 7; d >= 1; d--) {
        const day = addDays(todayIst, -d);
        for (const t of times) {
          if (chance(0.85)) add('medication_doses', { id: id(), medication_id: med.id, patient_id: u.id, dose_date: day, scheduled_time: t, taken_at: dt(plusMin(istToUtc(day, t), randInt(0, 40))) });
        }
      }
    }
    for (let k = 0; k < (chance(0.5) ? randInt(1, 3) : 0); k++) {
      const cat = pick(['prescription', 'lab_report', 'doctor_note', 'other']);
      add('medical_documents', { id: id(), patient_id: u.id, category: cat, file_url: `https://res.cloudinary.com/demo/image/upload/sample.jpg`, file_name: `${cat}_${k + 1}.jpg`, mime_type: 'image/jpeg', size_bytes: randInt(80_000, 2_500_000), uploaded_at: dt(daysAgo(randInt(1, 90))) });
    }
    if (chance(0.6)) {
      add('device_tokens', { id: id(), user_id: u.id, token: `seed_${randomBytes(20).toString('hex')}:APA91b${randomBytes(24).toString('base64url')}`, platform: chance(0.75) ? 'android' : 'ios', app: 'patient' });
    }
  }
  for (const b of branches) {
    for (const s of b.staff.slice(0, 2)) add('device_tokens', { id: id(), user_id: s.user.id, token: `seed_${randomBytes(20).toString('hex')}:APA91b${randomBytes(24).toString('base64url')}`, platform: 'android', app: 'clinic' });
  }
  add('device_tokens', { id: id(), user_id: owner.id, token: `seed_${randomBytes(20).toString('hex')}:APA91b${randomBytes(24).toString('base64url')}`, platform: 'ios', app: 'clinic' });

  const bookableAll = patients.filter((p) => !p.walkIn || chance(0.5));
  const bookable = bookableAll.length ? bookableAll : patients;
  const ledger = new Map();
  const toLedger = (branchId, at, amount) => {
    const key = `${branchId}|${dateStr(at).slice(0, 7)}`;
    const e = ledger.get(key) ?? { branchId, month: dateStr(at).slice(0, 7), total: 0, count: 0 };
    e.total += Number(amount);
    e.count += 1;
    ledger.set(key, e);
  };
  const patientNotif = (userId, branchId, type, payload, at) =>
    add('notifications', { id: id(), user_id: userId, branch_id: branchId, type, payload_json: payload, read_at: at < daysAgo(2) && chance(0.7) ? dt(plusMin(at, randInt(5, 600))) : null, created_at: dt(clampPast(at)) });

  // --- doctor appointments ------------------------------------------------
  const reviewed = new Set();
  const waitlisted = new Set();
  for (const d of doctors) {
    for (const a of d.assignments) {
      const b = a.branch;
      for (let offset = -60; offset <= 14; offset++) {
        const day = addDays(todayIst, offset);
        const wd = weekdayOf(day);
        if (b.closedWeekdays.has(wd) || b.closedDates.has(day) || a.leaves.has(day)) continue;
        for (const t of a.templates.filter((x) => x.weekday === wd)) {
          const slots = [];
          for (let m = toMin(t.start_time.slice(0, 5)); m + a.dur <= toMin(t.end_time.slice(0, 5)); m += a.dur) slots.push(fromMin(m));
          const fill = offset < 0 ? 0.35 : offset === 0 ? 0.5 : Math.max(0.08, 0.4 - offset * 0.025);
          for (const time of slots) {
            for (let seq = 0; seq < a.maxP; seq++) {
              if (!chance(seq === 0 ? fill : fill / 2)) continue;
              const slotStart = istToUtc(day, time);
              const isPast = slotStart < now;
              const status = isPast
                ? weighted([['completed', 70], ['cancelled', 13], ['no_show', 9], ['paid', 5], ['confirmed', 3]])
                : weighted([['pending', 35], ['confirmed', 45], ['paid', 10], ['cancelled', 10]]);
              const patient = pick(bookable);
              const forFamily = patient.family.length && chance(0.3) ? pick(patient.family) : null;
              const reception = patient.walkIn || chance(0.3);
              const receptionist = staffOf(b);
              const bookedAt = clampPast(plusMin(slotStart, -randInt(60, 60 * 24 * 6)));
              const appt = add('appointments', {
                id: id(), patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, doctor_id: d.row.id,
                scheduled_date: day, scheduled_time: time, slot_seq: seq, duration_minutes: a.dur, status,
                fee_amount: a.row.fee_amount, currency: 'INR', payment_method: null, created_at: dt(bookedAt),
              });
              const svc = forFamily ? forFamily.user : patient.user;
              add('appointment_patients', {
                id: id(), appointment_id: appt.id, patient_id: svc.id, booking_source: reception ? 'RECEPTION' : 'PATIENT_APP',
                booked_by: reception ? receptionist : patient.user.id, relationship: forFamily ? forFamily.relationship : 'self',
                name: svc.name, phone: svc.phone, age: forFamily ? forFamily.age : Math.min(patient.age, 120), gender: svc.gender, created_at: dt(bookedAt),
              });
              const details = { doctor_name: d.row.name, branch_name: b.row.name, clinic_name: clinic.name, patient_name: svc.name, scheduled_date: day, scheduled_time: time, fee_amount: Number(a.row.fee_amount), currency: 'INR' };

              // Status trail. Cancelled ones sometimes went through payment first (→ refund).
              const paidThenCancelled = status === 'cancelled' && chance(0.3);
              const path = {
                pending: ['pending'], confirmed: ['pending', 'confirmed'], paid: ['pending', 'confirmed', 'paid'],
                completed: ['pending', 'confirmed', 'paid', 'completed'], no_show: ['pending', 'confirmed', 'no_show'],
                cancelled: paidThenCancelled ? ['pending', 'confirmed', 'paid', 'cancelled'] : chance(0.5) ? ['pending', 'cancelled'] : ['pending', 'confirmed', 'cancelled'],
              }[status];
              let at = bookedAt;
              let prev = null;
              let paymentId = null;
              for (const to of path) {
                if (to === 'completed') at = plusMin(slotStart, a.dur + randInt(0, 30));
                else if (to === 'paid' && isPast) at = plusMin(slotStart, -randInt(5, 30));
                else if (to === 'no_show') at = plusMin(slotStart, 60);
                else if (prev) at = plusMin(at, randInt(10, 240));
                at = clampPast(at);
                const actor = to === 'pending' ? (reception ? receptionist : patient.user.id) : to === 'cancelled' && chance(0.6) ? patient.user.id : receptionist;
                add('appointment_status_log', { id: id(), appointment_id: appt.id, from_status: prev, to_status: to, changed_by: to === 'no_show' ? null : actor, changed_at: dt(at), note: to === 'cancelled' ? pick(['Patient requested cancellation', 'Doctor unavailable', 'Rescheduled by patient']) : to === 'no_show' ? 'Auto-marked: patient did not arrive' : null });
                if (to === 'pending') {
                  add('notifications', { id: id(), user_id: receptionist, branch_id: b.row.id, type: 'new_booking', payload_json: { appointment_id: appt.id, ...details }, read_at: chance(0.8) ? dt(plusMin(at, 15)) : null, created_at: dt(at) });
                }
                if (to === 'confirmed') {
                  patientNotif(patient.user.id, b.row.id, 'appointment_confirmed', { appointment_id: appt.id, ...details }, at);
                  add('receipts', { id: id(), receipt_number: receiptNo(at), source_type: 'appointment', source_id: appt.id, event_type: 'booking_confirmed', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: a.row.fee_amount, currency: 'INR', payment_method: null, reference_no: null, generated_by: receptionist, details_json: details, created_at: dt(at) });
                }
                if (to === 'paid') {
                  const method = chance(0.55) ? 'upi' : 'cash';
                  const ref = method === 'upi' ? `UPI${randInt(100000000000, 999999999999)}` : null;
                  appt.payment_method = method;
                  paymentId = add('payments', { id: id(), appointment_id: appt.id, amount: a.row.fee_amount, currency: 'INR', method, collected_by: receptionist, collected_at: dt(at), reference_no: ref }).id;
                  toLedger(b.row.id, at, a.row.fee_amount);
                  patientNotif(patient.user.id, b.row.id, 'payment_received', { appointment_id: appt.id, amount: Number(a.row.fee_amount), method, currency: 'INR', date: day, time, doctor_name: d.row.name }, at);
                  add('receipts', { id: id(), receipt_number: receiptNo(at), source_type: 'appointment', source_id: appt.id, event_type: 'payment_received', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: a.row.fee_amount, currency: 'INR', payment_method: method, reference_no: ref, generated_by: receptionist, details_json: details, created_at: dt(at) });
                }
                if (to === 'completed') {
                  add('receipts', { id: id(), receipt_number: receiptNo(at), source_type: 'appointment', source_id: appt.id, event_type: 'completed', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: a.row.fee_amount, currency: 'INR', payment_method: appt.payment_method, reference_no: null, generated_by: receptionist, details_json: details, created_at: dt(at) });
                  if (chance(0.75)) {
                    const scan = chance(0.5) ? `https://res.cloudinary.com/demo/image/upload/sample.jpg` : null;
                    const conf = scan ? +(randInt(7200, 9900) / 100).toFixed(2) : null;
                    add('prescriptions', { id: id(), appointment_id: appt.id, doctor_id: d.row.id, scan_url: scan, digitized_text: pick(RX_TEXTS), ocr_confidence: conf, finalized_at: dt(plusMin(at, 5)), created_at: dt(at) });
                    if (scan) add('prescription_scan_jobs', { id: id(), appointment_id: appt.id, doctor_id: d.row.id, status: 'done', draft_text: pick(RX_TEXTS), confidence: conf, scan_url: scan, created_at: dt(at), completed_at: dt(plusMin(at, 1)) });
                  }
                  const rk = `${patient.user.id}|${d.row.id}`;
                  if (!reviewed.has(rk) && chance(0.35)) {
                    reviewed.add(rk);
                    add('reviews', { id: id(), patient_id: patient.user.id, doctor_id: d.row.id, branch_id: b.row.id, appointment_id: appt.id, rating: weighted([[5, 50], [4, 30], [3, 12], [2, 5], [1, 3]]), comment: pick(REVIEW_COMMENTS), created_at: dt(clampPast(plusMin(at, randInt(60, 4000)))) });
                  }
                }
                if (to === 'cancelled') {
                  patientNotif(patient.user.id, b.row.id, 'appointment_cancelled', { appointment_id: appt.id, ...details }, at);
                  if (paymentId) {
                    const done = chance(0.8);
                    add('refunds', { id: id(), appointment_id: appt.id, payment_id: paymentId, amount: a.row.fee_amount, currency: 'INR', reason: 'Appointment cancelled', status: done ? 'processed' : 'pending', processed_by: done ? receptionist : null, processed_at: done ? dt(clampPast(plusMin(at, 180))) : null, reference_no: done ? `RFND${randInt(10000000, 99999999)}` : null, created_at: dt(at) });
                  }
                }
                prev = to;
              }
              // Future, busy slots: someone else on the waitlist for that day.
              if (!isPast && status !== 'cancelled' && chance(0.06)) {
                const w = pick(bookable);
                const wk = `${w.user.id}|${d.row.id}|${day}`;
                if (!waitlisted.has(wk)) {
                  waitlisted.add(wk);
                  add('appointment_waitlist', { id: id(), patient_id: w.user.id, doctor_id: d.row.id, branch_id: b.row.id, scheduled_date: day, preferred_time: time, status: chance(0.8) ? 'waiting' : 'notified', notified_at: null, created_at: dt(daysAgo(randInt(0, 3))) });
                }
              }
            }
          }
        }
      }
    }
  }

  // --- lab tests ----------------------------------------------------------
  for (const [name, color] of LAB_CATEGORIES) add('lab_test_categories', { id: id(), clinic_id: clinic.id, name, badge_color: color });
  const tests = LAB_TESTS.map(([name, code, category, price, dur, home, rx]) => ({
    row: add('lab_tests', {
      id: id(), clinic_id: clinic.id, name, code, description: `${name} — performed in-house with NABL-calibrated equipment.`,
      category, instructions: PRECAUTIONS[category][0], default_precautions: PRECAUTIONS[category], status: code === 'ECHO' ? 'inactive' : 'active',
      created_at: dt(daysAgo(130)),
    }),
    price, dur, home, rx,
  }));
  for (const b of branches) {
    for (let wd = 0; wd <= 6; wd++) {
      if (b.closedWeekdays.has(wd)) continue;
      add('lab_test_schedules', { id: id(), branch_id: b.row.id, weekday: wd, start_time: '07:00:00', end_time: wd === 0 ? '11:00:00' : '13:00:00', is_active: 1 });
      if (wd !== 0) add('lab_test_schedules', { id: id(), branch_id: b.row.id, weekday: wd, start_time: '16:00:00', end_time: '19:00:00', is_active: 1 });
    }
    const offered = tests.filter((t) => t.row.status === 'active' && chance(0.85));
    const blts = offered.map((t) => ({
      t,
      row: add('branch_lab_tests', {
        id: id(), clinic_id: clinic.id, branch_id: b.row.id, test_id: t.row.id, price: Math.round(t.price * (0.9 + rand() * 0.25) / 10) * 10,
        currency: 'INR', duration_minutes: t.dur, clinic_available: 1, home_collection_available: t.home ? 1 : 0,
        prescription_required: t.rx ? 1 : 0, status: 'active', created_at: dt(daysAgo(125)),
      }),
    }));
    const taken = new Set();
    for (let n = 0; blts.length && n < 70; n++) {
      const { t, row: blt } = pick(blts);
      const offset = randInt(-45, 10);
      const day = addDays(todayIst, offset);
      const wd = weekdayOf(day);
      if (b.closedWeekdays.has(wd) || b.closedDates.has(day)) continue;
      const windows = wd === 0 ? [[420, 660]] : [[420, 780], [960, 1140]];
      const [ws, we] = pick(windows);
      const startMin = ws + Math.floor(rand() * Math.floor((we - ws - t.dur) / t.dur + 1)) * t.dur;
      const start = fromMin(startMin);
      const key = `${blt.id}|${day}|${start}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const slotStart = istToUtc(day, start);
      const isPast = slotStart < now;
      const status = isPast
        ? weighted([['COMPLETED', 72], ['CANCELLED', 10], ['REJECTED', 6], ['APPROVED', 12]])
        : weighted([['PENDING', 50], ['APPROVED', 40], ['CANCELLED', 10]]);
      const home = t.home && chance(0.35);
      const online = chance(0.4);
      const paymentStatus = status === 'COMPLETED' ? 'PAID' : status === 'APPROVED' && online ? 'PAID' : status === 'CANCELLED' && online && chance(0.5) ? 'REFUNDED' : online && status === 'PENDING' ? 'PENDING' : 'UNPAID';
      const patient = pick(bookable);
      const forFamily = patient.family.length && chance(0.25) ? pick(patient.family) : null;
      const svc = forFamily ? forFamily.user : patient.user;
      const reception = patient.walkIn || chance(0.25);
      const tech = staffOf(b);
      const bookedAt = clampPast(plusMin(slotStart, -randInt(120, 60 * 24 * 4)));
      const decidedAt = clampPast(plusMin(bookedAt, randInt(15, 300)));
      const doneAt = clampPast(plusMin(slotStart, t.dur + randInt(0, 30)));
      const rxId = t.rx ? id() : null;
      const appt = add('lab_test_appointments', {
        id: id(), appointment_number: uniqueCode('LAB', ymdCompact(bookedAt)), patient_id: patient.user.id, clinic_id: clinic.id,
        branch_id: b.row.id, branch_lab_test_id: blt.id, test_id: t.row.id, service_mode: home ? 'HOME' : 'CLINIC',
        appointment_date: day, start_time: start, end_time: fromMin(startMin + t.dur), duration_minutes: t.dur, price: blt.price, currency: 'INR',
        payment_method: online ? 'ONLINE' : 'PAY_AT_CLINIC', payment_status: paymentStatus, prescription_required: t.rx ? 1 : 0, prescription_id: rxId,
        referring_doctor_name: chance(0.5) ? pick(doctors).row.name : null,
        home_address: home ? patient.user.address : null, home_lat: home ? b.row.lat : null, home_lng: home ? b.row.lng : null,
        home_contact_phone: home ? svc.phone : null, home_notes: home ? pick(['Call before arriving', '2nd floor, lift available', 'Ring the bell twice']) : null,
        patient_notes: chance(0.3) ? pick(['Fasting since last night', 'Please send report on WhatsApp', 'Diabetic patient']) : null,
        clinic_notes: status === 'COMPLETED' && chance(0.4) ? 'Sample collected, report in 24h' : null, precautions: PRECAUTIONS[t.row.category],
        status, approved_by: ['APPROVED', 'COMPLETED'].includes(status) ? tech : null, approved_at: ['APPROVED', 'COMPLETED'].includes(status) ? dt(decidedAt) : null,
        rejected_by: status === 'REJECTED' ? tech : null, rejected_at: status === 'REJECTED' ? dt(decidedAt) : null,
        rejection_reason: status === 'REJECTED' ? pick(['Prescription unclear — please re-upload', 'Slot unavailable due to equipment maintenance']) : null,
        completed_at: status === 'COMPLETED' ? dt(doneAt) : null, cancelled_at: status === 'CANCELLED' ? dt(decidedAt) : null, created_at: dt(bookedAt),
      });
      add('lab_test_appointment_patients', {
        id: id(), appointment_id: appt.id, patient_id: svc.id, booking_source: reception ? 'RECEPTION' : 'PATIENT_APP',
        booked_by: reception ? tech : patient.user.id, relationship: forFamily ? forFamily.relationship : 'self',
        name: svc.name, phone: svc.phone, age: forFamily ? forFamily.age : Math.min(patient.age, 120), gender: svc.gender, created_at: dt(bookedAt),
      });
      if (rxId) add('lab_test_prescriptions', { id: rxId, patient_id: patient.user.id, appointment_id: appt.id, file_name: 'doctor_prescription.jpg', file_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', mime_type: 'image/jpeg', file_size: randInt(150_000, 1_800_000), uploaded_at: dt(bookedAt) });
      const details = { test_name: t.row.name, test_code: t.row.code, branch_name: b.row.name, clinic_name: clinic.name, patient_name: svc.name, appointment_number: appt.appointment_number, appointment_date: day, start_time: start, service_mode: appt.service_mode, price: Number(blt.price), currency: 'INR' };
      const log = (from, to, by, at, note = null) => add('lab_test_appointment_status_log', { id: id(), appointment_id: appt.id, from_status: from, to_status: to, changed_by: by, changed_at: dt(at), note });
      log(null, 'PENDING', reception ? tech : patient.user.id, bookedAt);
      patientNotif(patient.user.id, b.row.id, 'lab_test_booked', { appointment_id: appt.id, ...details }, bookedAt);
      if (['APPROVED', 'COMPLETED'].includes(status)) {
        log('PENDING', 'APPROVED', tech, decidedAt);
        patientNotif(patient.user.id, b.row.id, 'lab_test_approved', { appointment_id: appt.id, ...details }, decidedAt);
        add('receipts', { id: id(), receipt_number: receiptNo(decidedAt), source_type: 'lab_test_appointment', source_id: appt.id, event_type: 'booking_confirmed', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: blt.price, currency: 'INR', payment_method: appt.payment_method, reference_no: null, generated_by: tech, details_json: details, created_at: dt(decidedAt) });
      }
      if (status === 'REJECTED') {
        log('PENDING', 'REJECTED', tech, decidedAt, appt.rejection_reason);
        patientNotif(patient.user.id, b.row.id, 'lab_test_rejected', { appointment_id: appt.id, reason: appt.rejection_reason, ...details }, decidedAt);
      }
      if (status === 'CANCELLED') {
        log('PENDING', 'CANCELLED', patient.user.id, decidedAt, 'Cancelled by patient');
        patientNotif(patient.user.id, b.row.id, 'lab_test_cancelled', { appointment_id: appt.id, ...details }, decidedAt);
      }
      if (status === 'COMPLETED') {
        log('APPROVED', 'COMPLETED', tech, doneAt);
        patientNotif(patient.user.id, b.row.id, 'lab_test_completed', { appointment_id: appt.id, ...details }, doneAt);
        add('receipts', { id: id(), receipt_number: receiptNo(doneAt), source_type: 'lab_test_appointment', source_id: appt.id, event_type: 'completed', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: blt.price, currency: 'INR', payment_method: appt.payment_method, reference_no: null, generated_by: tech, details_json: details, created_at: dt(doneAt) });
      }
      if (paymentStatus !== 'UNPAID') {
        const paidAt = online ? clampPast(plusMin(bookedAt, 2)) : doneAt;
        const paid = ['PAID', 'REFUNDED'].includes(paymentStatus);
        const txn = online ? `pay_${randomBytes(7).toString('hex')}` : null;
        add('lab_test_payments', {
          id: id(), appointment_id: appt.id, patient_id: patient.user.id, amount: blt.price, currency: 'INR', payment_method: appt.payment_method,
          payment_status: paymentStatus, transaction_id: txn, provider: online ? 'razorpay' : null, paid_at: paid ? dt(paidAt) : null,
          refund_status: paymentStatus === 'REFUNDED' ? 'processed' : null, collected_by: online ? null : tech, collected_at: online ? null : dt(paidAt),
          reference_no: online ? null : chance(0.5) ? `UPI${randInt(100000000000, 999999999999)}` : null, created_at: dt(online ? bookedAt : paidAt),
        });
        if (paid) {
          toLedger(b.row.id, paidAt, blt.price);
          patientNotif(patient.user.id, b.row.id, 'lab_test_payment_success', { appointment_id: appt.id, amount: Number(blt.price), ...details }, paidAt);
          add('receipts', { id: id(), receipt_number: receiptNo(paidAt), source_type: 'lab_test_appointment', source_id: appt.id, event_type: 'payment_received', patient_id: patient.user.id, clinic_id: clinic.id, branch_id: b.row.id, amount: blt.price, currency: 'INR', payment_method: appt.payment_method, reference_no: txn, generated_by: online ? null : tech, details_json: details, created_at: dt(paidAt) });
        }
      }
      // Clinic-issued reports for completed tests, delivered over multiple channels.
      if (status === 'COMPLETED' && chance(0.8)) {
        const uploadedAt = clampPast(plusMin(doneAt, randInt(120, 1440)));
        const doc = add('patient_documents', {
          id: id(), patient_id: svc.id, clinic_id: clinic.id, branch_id: b.row.id, document_type: 'LAB_REPORT', title: `${t.row.name} Report`,
          description: `Report for ${appt.appointment_number}`, file_name: `${t.row.code.toLowerCase()}_report.pdf`, file_key: `seed-${id()}.pdf`,
          file_size: randInt(90_000, 900_000), mime_type: 'application/pdf', uploaded_by: tech, uploaded_at: dt(uploadedAt), status: 'GENERATED', created_at: dt(uploadedAt),
        });
        deliver(doc, svc, tech, uploadedAt);
      }
    }
    // A few prescriptions / misc documents per branch not tied to lab tests.
    for (let k = 0; k < 8; k++) {
      const p = pick(bookable);
      const uploadedAt = daysAgo(randInt(1, 50));
      const type = pick(['PRESCRIPTION', 'OTHER']);
      const doc = add('patient_documents', {
        id: id(), patient_id: p.user.id, clinic_id: clinic.id, branch_id: b.row.id, document_type: type,
        title: type === 'PRESCRIPTION' ? 'Consultation Prescription' : pick(['Fitness Certificate', 'Discharge Summary', 'Vaccination Record']),
        description: null, file_name: `${type.toLowerCase()}.pdf`, file_key: `seed-${id()}.pdf`, file_size: randInt(60_000, 600_000),
        mime_type: 'application/pdf', uploaded_by: chance(0.8) ? staffOf(b) : owner.id, uploaded_at: dt(uploadedAt),
        status: chance(0.9) ? 'GENERATED' : 'PENDING', created_at: dt(uploadedAt), deleted_at: chance(0.05) ? dt(plusMin(uploadedAt, 600)) : null,
      });
      deliver(doc, p.user, doc.uploaded_by, uploadedAt);
    }
  }

  // --- monthly ledger (doctor + lab payments) -----------------------------
  for (const e of ledger.values()) {
    add('clinic_payment_ledger', { id: id(), clinic_id: clinic.id, branch_id: e.branchId, period_month: e.month, currency: 'INR', total_amount: e.total.toFixed(2), payment_count: e.count });
  }

  // --- subscription: 2-month trial → lapsed → paid monthly ----------------
  const trialStart = clinicCreated;
  const trialEnd = plusMin(trialStart, 60 * 1440);
  const sub = add('clinic_subscriptions', {
    id: id(), clinic_id: clinic.id, status: 'ACTIVE', plan_id: plan.id, monthly_amount: plan.amount, currency: plan.currency,
    period_start: null, period_end: null, is_trial: 0, trial_started_at: dt(trialStart), trial_ends_at: dt(trialEnd),
    auto_renew: 1, deactivated_at: null, deactivated_by: null, deactivation_reason: null, last_paid_payment_id: null, created_at: dt(trialStart),
  });
  const hist = (from, to, reason, source, by, at) => add('subscription_history', { id: id(), clinic_id: clinic.id, subscription_id: sub.id, from_status: from, to_status: to, reason, changed_by: by, source, created_at: dt(at) });
  hist(null, 'TRIAL', 'Free trial started', 'system', null, trialStart);
  const lapse = plusMin(trialEnd, 3 * 1440);
  hist('TRIAL', 'EXPIRED', 'Trial ended without payment', 'system', null, trialEnd);
  let periodStart = lapse;
  let lastPaid = null;
  const failAt = plusMin(lapse, -60);
  add('subscription_payments', {
    id: id(), clinic_id: clinic.id, subscription_id: sub.id, plan_id: plan.id, invoice_no: `INV-${ymdCompact(failAt)}-${randomBytes(4).toString('hex').toUpperCase()}`,
    amount: plan.amount, currency: plan.currency, months: 1, method: 'upi', provider: 'razorpay', provider_order_id: `order_${randomBytes(7).toString('hex')}`,
    provider_payment_id: null, provider_signature: null, status: 'FAILED', failure_reason: 'Payment declined by bank', reference_no: null,
    verification_method: null, verified_by: null, verified_at: null, period_start: null, period_end: null, initiated_by: owner.id, created_at: dt(failAt),
  });
  while (periodStart < now) {
    const periodEnd = plusMin(periodStart, 30 * 1440);
    const pay = add('subscription_payments', {
      id: id(), clinic_id: clinic.id, subscription_id: sub.id, plan_id: plan.id, invoice_no: `INV-${ymdCompact(periodStart)}-${randomBytes(4).toString('hex').toUpperCase()}`,
      amount: plan.amount, currency: plan.currency, months: 1, method: pick(['upi', 'card', 'netbanking']), provider: 'razorpay',
      provider_order_id: `order_${randomBytes(7).toString('hex')}`, provider_payment_id: `pay_${randomBytes(7).toString('hex')}`, provider_signature: randomBytes(32).toString('hex'),
      status: 'PAID', failure_reason: null, reference_no: null, verification_method: 'signature', verified_by: null, verified_at: dt(plusMin(periodStart, 1)),
      period_start: dt(periodStart), period_end: dt(periodEnd), initiated_by: owner.id, created_at: dt(periodStart),
    });
    hist(lastPaid ? 'ACTIVE' : 'EXPIRED', 'ACTIVE', `Payment ${pay.invoice_no} verified (signature); +1 month(s)`, 'payment', owner.id, periodStart);
    add('notifications', { id: id(), user_id: owner.id, branch_id: null, type: 'subscription_activated', payload_json: { invoice_no: pay.invoice_no, period_end: dt(periodEnd) }, read_at: dt(plusMin(periodStart, 30)), created_at: dt(periodStart) });
    sub.period_start = dt(periodStart);
    sub.period_end = dt(periodEnd);
    lastPaid = pay.id;
    periodStart = periodEnd;
  }
  sub.last_paid_payment_id = lastPaid;
  if (!sub.period_start) {
    sub.period_start = dt(lapse);
    sub.period_end = dt(plusMin(lapse, 30 * 1440));
  }

  // --- offer (only if a Super Admin exists to own it) ---------------------
  if (superAdminId) {
    const offerAt = daysAgo(4);
    const offer = add('subscription_offers', {
      id: id(), title: 'Festive discount', message: 'Renew now and pay just ₹29/month for the next 3 months!', discounted_amount: 29.0, currency: 'INR',
      duration_months: 3, valid_until: dt(plusMin(now, 20 * 1440)), channels_json: ['portal', 'email'], status: 'ACTIVE', created_by: superAdminId,
      created_at: dt(offerAt), cancelled_at: null, cancelled_by: null,
    });
    const notif = add('notifications', { id: id(), user_id: owner.id, branch_id: null, type: 'subscription_offer', payload_json: { offer_id: offer.id, title: offer.title }, read_at: null, created_at: dt(offerAt) });
    add('subscription_offer_recipients', {
      id: id(), offer_id: offer.id, clinic_id: clinic.id, status: 'PENDING', months_remaining: 3, notify_sms_status: 'SKIPPED',
      notify_whatsapp_status: 'SKIPPED', notify_email_status: 'SENT', notified_at: dt(offerAt), portal_notification_id: notif.id, redeemed_at: null,
    });
  }

  return { clinic, branches, doctors, patients };
}

function makeName() {
  return `${pick(chance(0.5) ? MALE : FEMALE)} ${pick(LAST)}`;
}

function deliver(doc, patientUser, by, at) {
  add('patient_document_deliveries', { id: id(), document_id: doc.id, delivery_method: 'APP', status: 'DELIVERED', recipient_email: null, delivered_at: dt(at), attempted_by: by, attempted_at: dt(at), error_message: null });
  if (patientUser.email && chance(0.5)) {
    const ok = chance(0.9);
    add('patient_document_deliveries', { id: id(), document_id: doc.id, delivery_method: 'EMAIL', status: ok ? 'DELIVERED' : 'NOT_DELIVERED', recipient_email: patientUser.email, delivered_at: ok ? dt(plusMin(at, 1)) : null, attempted_by: by, attempted_at: dt(plusMin(at, 1)), error_message: ok ? null : 'Mailbox unavailable' });
  }
  if (chance(0.3)) add('patient_document_deliveries', { id: id(), document_id: doc.id, delivery_method: 'PRINT', status: 'DELIVERED', recipient_email: null, delivered_at: dt(plusMin(at, 5)), attempted_by: by, attempted_at: dt(plusMin(at, 5)), error_message: null });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log(`Seeding ${CLINICS} clinic(s) into ${host} ...`);
const built = [];
for (let ci = 0; ci < CLINICS; ci++) built.push(buildClinic(ci));

await conn.beginTransaction();
try {
  for (const table of ORDER) await flush(table);
  const leftover = [...buffers.entries()].filter(([, rows]) => rows.length).map(([t]) => t);
  if (leftover.length) throw new Error(`Tables missing from flush ORDER: ${leftover.join(', ')}`);
  const byBranch = Map.groupBy(preferences, ([c, b]) => `${c}|${b}`);
  for (const group of byBranch.values()) {
    await conn.query('UPDATE users SET preferred_clinic_id = ?, preferred_branch_id = ? WHERE id IN (?)', [group[0][0], group[0][1], group.map((g) => g[2])]);
  }
  if (DRY_RUN) await conn.rollback();
  else await conn.commit();
} catch (err) {
  await conn.rollback();
  console.error('\nSeed failed — rolled back, nothing was written.');
  throw err;
} finally {
  await conn.end();
}

console.log(DRY_RUN ? '\nDRY RUN — every insert succeeded and was rolled back. Rows that would be inserted:' : '\nRows inserted:');
for (const t of ORDER) if (counts[t]) console.log(`  ${t.padEnd(34)} ${counts[t]}`);
console.log(`\nClinics: ${built.map((b) => `${b.clinic.name} (${b.clinic.id})`).join(', ')}`);
console.log(`\nSample logins (password for all: ${PASSWORD}):`);
for (const [role, name, phone, email] of logins) console.log(`  ${role.padEnd(28)} ${name.padEnd(28)} ${phone}  ${email ?? ''}`);
