import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { pool, type Row } from "@api/lib/db";

export type PushApp = "patient" | "clinic";

/**
 * Host env var UIs (Render, etc.) store whatever was pasted verbatim — unlike a local
 * .env file, they don't strip a wrapping quote pair or expand escaped "\n" into real
 * newlines the way dotenv does. Normalize both cases so the same value works whether
 * it arrives already-parsed (local dev) or raw (deployed).
 */
function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.replace(/\\n/g, "\n");
}

/**
 * The patient app and the xclinic (clinic-side) app are separate Firebase projects
 * with their own service accounts, so each gets its own named Admin SDK app instance —
 * a device token registered against one project can only be sent through that project's
 * credentials.
 */
const ENV_PREFIX: Record<PushApp, string> = {
  patient: "FIREBASE",
  clinic: "FIREBASE_CLINIC",
};

const apps: Partial<Record<PushApp, App | null>> = {};

function app(pushApp: PushApp): App | null {
  if (pushApp in apps) return apps[pushApp] ?? null;

  const existing = getApps().find((a) => a.name === pushApp);
  if (existing) {
    apps[pushApp] = existing;
    return existing;
  }

  const prefix = ENV_PREFIX[pushApp];
  const projectId = process.env[`${prefix}_PROJECT_ID`];
  const clientEmail = process.env[`${prefix}_CLIENT_EMAIL`];
  const rawPrivateKey = process.env[`${prefix}_PRIVATE_KEY`];
  const privateKey = rawPrivateKey ? normalizePrivateKey(rawPrivateKey) : undefined;
  if (!projectId || !clientEmail || !privateKey) {
    apps[pushApp] = null;
    return null;
  }

  // A malformed credential (e.g. a private key mangled by a host env var UI —
  // see normalizePrivateKey above) makes initializeApp/cert throw synchronously.
  // sendFcmToUser's callers await this from inside a DB transaction (booking
  // creation, etc), so an uncaught throw here would roll back the triggering
  // request instead of just skipping the push. Cache the failure so we don't
  // re-throw (and re-log) on every subsequent call in this process either.
  try {
    const created = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, pushApp);
    apps[pushApp] = created;
    return created;
  } catch (err) {
    console.error(`[push:${pushApp}] Firebase Admin init failed — check FIREBASE${pushApp === "clinic" ? "_CLINIC" : ""}_* env vars (especially PRIVATE_KEY formatting):`, err);
    apps[pushApp] = null;
    return null;
  }
}

export interface FcmMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Public HTTPS image shown in the expanded notification (FCM caps it at 1 MB). */
  imageUrl?: string;
}

/**
 * The notification fields of an FCM message. An image needs per-platform fields too:
 * Android reads it from android.notification, and iOS only downloads it when the
 * payload is mutable-content (handled by the app's Notification Service Extension).
 */
function notificationFields(msg: FcmMessage) {
  const notification = { title: msg.title, body: msg.body, ...(msg.imageUrl ? { imageUrl: msg.imageUrl } : {}) };
  if (!msg.imageUrl) return { notification };
  return {
    notification,
    android: { notification: { imageUrl: msg.imageUrl } },
    apns: { payload: { aps: { mutableContent: true } }, fcmOptions: { imageUrl: msg.imageUrl } },
  };
}

/**
 * Sends an FCM push to every device token for a user registered under the given app
 * (patient or clinic), dropping tokens FCM reports as unregistered/invalid. Never
 * throws — failures are logged so callers (notification writes) never fail on push
 * delivery.
 */
export async function sendFcmToUser(userId: string, msg: FcmMessage, pushApp: PushApp = "patient"): Promise<void> {
  const firebaseApp = app(pushApp);
  if (!firebaseApp) {
    console.error(`[push:${pushApp}] not configured (missing FIREBASE${pushApp === "clinic" ? "_CLINIC" : ""}_* env vars) — skipping send to user ${userId}.`);
    return;
  }

  try {
    // Inside the try: callers await this from within DB transactions, so even a
    // token-lookup failure must not propagate and roll back the triggering request.
    const [rows] = await pool.query<Row[]>(
      `SELECT token FROM device_tokens WHERE user_id = ? AND app = ?`,
      [userId, pushApp],
    );
    const tokens = rows.map((r) => r.token as string);
    if (tokens.length === 0) {
      console.log(`[push:${pushApp}] ${msg.data?.type ?? "push"} for user ${userId} skipped — no registered devices.`);
      return;
    }

    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens,
      ...notificationFields(msg),
      data: msg.data,
    });
    console.log(`[push:${pushApp}] ${msg.data?.type ?? "push"} for user ${userId}: ${response.successCount}/${tokens.length} delivered to FCM.`);
    if (response.failureCount > 0) {
      response.responses.forEach((r, i) => {
        if (!r.success) console.error(`[push:${pushApp}] send to token ${tokens[i]} failed:`, r.error?.code, r.error?.message);
      });
    }

    const staleTokens = response.responses
      .map((r, i) => (!r.success && isUnregistered(r.error?.code) ? tokens[i] : null))
      .filter((t): t is string => t !== null);
    if (staleTokens.length > 0) {
      await pool.query(`DELETE FROM device_tokens WHERE token IN (?)`, [staleTokens]);
    }
  } catch (err) {
    console.error(`[push:${pushApp}] FCM send failed:`, err);
  }
}

/** FCM's per-call multicast limit. */
const MULTICAST_BATCH = 500;

export interface BroadcastResult {
  devices: number;
  delivered: number;
}

/**
 * Sends one message to many tokens in batches of 500 and prunes tokens FCM reports
 * as unregistered. Never throws — a failed batch is logged and counted as undelivered.
 */
async function multicast(firebaseApp: App, pushApp: PushApp, tokens: string[], msg: FcmMessage): Promise<number> {
  const messaging = getMessaging(firebaseApp);
  const staleTokens: string[] = [];
  let delivered = 0;

  for (let i = 0; i < tokens.length; i += MULTICAST_BATCH) {
    const batch = tokens.slice(i, i + MULTICAST_BATCH);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        ...notificationFields(msg),
        data: msg.data,
      });
      delivered += response.successCount;
      response.responses.forEach((r, j) => {
        if (!r.success && isUnregistered(r.error?.code)) staleTokens.push(batch[j]);
      });
    } catch (err) {
      console.error(`[push:${pushApp}] multicast batch ${i / MULTICAST_BATCH} failed:`, err);
    }
  }

  if (staleTokens.length > 0) {
    try {
      await pool.query(`DELETE FROM device_tokens WHERE token IN (?)`, [staleTokens]);
    } catch (err) {
      console.error(`[push:${pushApp}] pruning stale tokens failed:`, err);
    }
  }
  return delivered;
}

/**
 * Sends one push to every device registered under the given app (all patients, by
 * default) — used for Super Admin broadcasts such as advertisements. Never throws:
 * failures are logged and reflected in the returned counts.
 */
export async function broadcastFcm(msg: FcmMessage, pushApp: PushApp = "patient"): Promise<BroadcastResult> {
  const firebaseApp = app(pushApp);
  if (!firebaseApp) {
    console.error(`[push:${pushApp}] not configured (missing FIREBASE${pushApp === "clinic" ? "_CLINIC" : ""}_* env vars) — broadcast skipped.`);
    return { devices: 0, delivered: 0 };
  }

  try {
    const [rows] = await pool.query<Row[]>(`SELECT token FROM device_tokens WHERE app = ?`, [pushApp]);
    const tokens = rows.map((r) => r.token as string);
    const delivered = await multicast(firebaseApp, pushApp, tokens, msg);
    console.log(`[push:${pushApp}] broadcast ${msg.data?.type ?? "push"}: ${delivered}/${tokens.length} delivered to FCM.`);
    return { devices: tokens.length, delivered };
  } catch (err) {
    console.error(`[push:${pushApp}] broadcast failed:`, err);
    return { devices: 0, delivered: 0 };
  }
}

export type PushLanguage = "en" | "bn";

/**
 * Sends a push to every Patient App device of the given users, each device in the
 * language its app is set to (device_tokens.language, reported at token registration;
 * English when unknown). Never throws.
 */
export async function sendFcmToUsersLocalized(
  userIds: string[],
  messages: Record<PushLanguage, FcmMessage>,
): Promise<BroadcastResult> {
  const firebaseApp = app("patient");
  if (!firebaseApp) {
    console.error(`[push:patient] not configured (missing FIREBASE_* env vars) — localized send skipped.`);
    return { devices: 0, delivered: 0 };
  }
  if (userIds.length === 0) return { devices: 0, delivered: 0 };

  try {
    const byLang: Record<PushLanguage, string[]> = { en: [], bn: [] };
    for (let i = 0; i < userIds.length; i += 1000) {
      const [rows] = await pool.query<Row[]>(
        `SELECT token, language FROM device_tokens WHERE app = 'patient' AND user_id IN (?)`,
        [userIds.slice(i, i + 1000)],
      );
      for (const r of rows) byLang[r.language === "bn" ? "bn" : "en"].push(r.token as string);
    }
    let delivered = 0;
    for (const lang of ["en", "bn"] as const) {
      if (byLang[lang].length > 0) delivered += await multicast(firebaseApp, "patient", byLang[lang], messages[lang]);
    }
    const devices = byLang.en.length + byLang.bn.length;
    console.log(`[push:patient] ${messages.en.data?.type ?? "push"} to ${userIds.length} user(s): ${delivered}/${devices} delivered to FCM.`);
    return { devices, delivered };
  } catch (err) {
    console.error(`[push:patient] localized send failed:`, err);
    return { devices: 0, delivered: 0 };
  }
}

function isUnregistered(code: string | undefined): boolean {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument";
}
