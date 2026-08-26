import type { Intent, IntentType } from "./types";

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  entities?: { name: string; pattern: RegExp }[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: "search_appointments",
    patterns: [
      /\b(?:show|list|get|find|search|see|view|fetch|what(?:'s| are| is))\b.*\b(?:appointment|booking|consultation|schedule)s?\b/i,
      /\b(?:today(?:'s)?|upcoming|pending|confirmed|completed|cancelled)\b.*\bappointment/i,
      /\bappointment(?:s)?.*\b(?:today|tomorrow|this week|this month)\b/i,
      /\bhow many\b.*\bappointment/i,
    ],
    entities: [
      { name: "status", pattern: /(?:status[:=]?\s*)(pending|confirmed|paid|completed|cancelled|no_show)/i },
      { name: "date", pattern: /(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday|this week|this month)/i },
    ],
  },
  {
    type: "search_patients",
    patterns: [
      /\b(?:show|list|get|find|search|see|view|fetch)\b.*\bpatient(?:s)?\b/i,
      /\bpatient(?:s)?.*\b(?:list|directory|record)s?\b/i,
      /\bwho (?:is|are)\b.*\bpatient/i,
    ],
    entities: [
      { name: "query", pattern: /(?:patient|patients)\s+(?:named?|called?|with name)\s+(.+)/i },
    ],
  },
  {
    type: "search_doctors",
    patterns: [
      /\b(?:show|list|get|find|search|see|view|fetch)\b.*\bdoctor(?:s)?\b/i,
      /\bdoctor(?:s)?.*\b(?:list|directory|available|schedule)s?\b/i,
      /\bwho (?:is|are)\b.*\bdoctor/i,
      /\bphysician/i,
    ],
    entities: [
      { name: "query", pattern: /(?:doctor|doctors)\s+(?:named?|called?|with name)\s+(.+)/i },
    ],
  },
  {
    type: "search_clinics",
    patterns: [
      /\b(?:show|list|get|find|search|see|view)\b.*\bclinic(?:s)?\b/i,
      /\bclinic(?:s)?.*\b(?:list|directory|details)\b/i,
    ],
  },
  {
    type: "search_branches",
    patterns: [
      /\b(?:show|list|get|find|search|see|view)\b.*\bbranch(?:es)?\b/i,
      /\bbranch(?:es)?.*\b(?:list|locations?|outlets?)\b/i,
    ],
  },
  {
    type: "search_lab_tests",
    patterns: [
      /\b(?:show|list|get|find|search|see|view)\b.*\b(?:lab test|lab tests|laboratory test|test)s?\b/i,
      /\b(?:lab|laboratory)\b.*\b(?:test|tests|appointment|appointments)\b/i,
    ],
  },
  {
    type: "get_appointment_details",
    patterns: [
      /\b(?:appointment|booking)\b.*\bdetail/i,
      /\btell me about\b.*\b(?:appointment|booking)/i,
      /\bappointment\b.*\bid\b/i,
    ],
  },
  {
    type: "get_patient_details",
    patterns: [
      /\bpatient\b.*\bdetail/i,
      /\btell me about\b.*\bpatient/i,
    ],
  },
  {
    type: "get_doctor_details",
    patterns: [
      /\bdoctor\b.*\bdetail/i,
      /\btell me about\b.*\bdoctor/i,
    ],
  },
  {
    type: "get_notifications",
    patterns: [
      /\b(?:show|list|get|see|view|check|any)\b.*\bnotification(?:s)?\b/i,
      /\bnotification(?:s)?.*\b(?:unread|new|latest)\b/i,
      /\bdo i have\b.*\bnotification/i,
    ],
  },
  {
    type: "get_subscription",
    patterns: [
      /\b(?:show|get|check|see|view|what(?:'s| is| are))\b.*\bsubscription/i,
      /\bsubscription\b.*\b(?:status|detail|plan|billing)\b/i,
      /\bbilling\b.*\b(?:status|detail|plan)\b/i,
    ],
  },
  {
    type: "get_prescriptions",
    patterns: [
      /\b(?:show|list|get|see|view)\b.*\bprescription(?:s)?\b/i,
      /\bprescription(?:s)?.*\b(?:list|detail|upload|scan)\b/i,
    ],
  },
  {
    type: "get_lab_test_appointments",
    patterns: [
      /\b(?:show|list|get|see|view)\b.*\blab test appointment/i,
      /\blab test.*\bappointment(?:s)?.*\b(?:list|pending|approved)\b/i,
    ],
  },
  {
    type: "get_dashboard_stats",
    patterns: [
      /\b(?:show|get|see|view|what(?:'s| is| are))\b.*\b(?:dashboard|statistic|overview|summary)\b/i,
      /\bhow(?:'s| is| are)\b.*\b(?:business|clinic|practice)\b/i,
      /\b(?:revenue|earnings?|income)\b.*\b(?:today|this week|this month|total)\b/i,
    ],
  },
  {
    type: "get_reviews",
    patterns: [
      /\b(?:show|list|get|see|view)\b.*\breview(?:s)?\b/i,
      /\breview(?:s)?.*\b(?:rating|feedback|patient)\b/i,
    ],
  },
  {
    type: "get_staff_list",
    patterns: [
      /\b(?:show|list|get|see|view)\b.*\bstaff\b/i,
      /\bstaff\b.*\b(?:member|list|directory|team)\b/i,
    ],
  },
  {
    type: "get_branch_schedule",
    patterns: [
      /\b(?:show|get|see|view|check)\b.*\b(?:branch|schedule|operating|hours|timing)s?\b/i,
      /\bwhen (?:is|are)\b.*\b(?:branch|clinic)\b.*\b(?:open|closed)\b/i,
    ],
  },
  {
    type: "get_ledger",
    patterns: [
      /\b(?:show|get|see|view|check)\b.*\bledger\b/i,
      /\bledger\b.*\b(?:entry|entries|payment|record)s?\b/i,
      /\bpayment\b.*\b(?:history|record|ledger)\b/i,
    ],
  },
  {
    type: "get_audit_logs",
    patterns: [
      /\b(?:show|get|see|view|check)\b.*\baudit\b/i,
      /\baudit\b.*\b(?:log|logs|trail|entry|entries)\b/i,
    ],
  },
  {
    type: "get_platform_stats",
    patterns: [
      /\b(?:show|get|see|view)\b.*\bplatform\b.*\b(?:statistic|overview|summary)\b/i,
      /\bplatform\b.*\b(?:stats|dashboard|overview)\b/i,
    ],
  },
  {
    type: "confirm_appointment",
    patterns: [
      /\b(?:confirm|approve|accept)\b.*\bappointment\b/i,
      /\bappointment\b.*\b(?:confirm|approve|accept)\b/i,
    ],
  },
  {
    type: "complete_appointment",
    patterns: [
      /\b(?:complete|finish|mark as done)\b.*\bappointment\b/i,
      /\bappointment\b.*\b(?:complete|finished|done)\b/i,
    ],
  },
  {
    type: "cancel_appointment",
    patterns: [
      /\b(?:cancel|cancellation)\b.*\bappointment\b/i,
      /\bappointment\b.*\bcancel/i,
    ],
  },
  {
    type: "approve_lab_appointment",
    patterns: [
      /\b(?:approve|accept)\b.*\blab test\b/i,
      /\blab test\b.*\b(?:approve|accept)\b/i,
    ],
  },
  {
    type: "reject_lab_appointment",
    patterns: [
      /\b(?:reject|decline|deny)\b.*\blab test\b/i,
      /\blab test\b.*\b(?:reject|decline|deny)\b/i,
    ],
  },
  {
    type: "mark_notification_read",
    patterns: [
      /\b(?:mark|mark as)\b.*\bnotification\b.*\b(?:read|done|viewed)\b/i,
      /\bdismiss\b.*\bnotification/i,
    ],
  },
  {
    type: "navigate",
    patterns: [
      /\b(?:go to|open|navigate to|take me to|show me the)\b.*\b(?:page|section|panel)\b/i,
      /\b(?:go|navigate)\b.*\b(?:dashboard|appointments?|patients?|doctors?|branches?|clinics?|settings?|staff|billing|notifications?|prescriptions?|reports?|lab)\b/i,
    ],
    entities: [
      { name: "destination", pattern: /\b(?:go to|open|navigate to|take me to|show me)\s+(?:the\s+)?(.+)/i },
    ],
  },
  {
    type: "help",
    patterns: [
      /\b(?:help|what can you do|how do (?:I|you)|capabilities|features|commands)\b/i,
      /\bwhat (?:can|do)\b.*\b(?:you|i)\b.*\bdo\b/i,
      /\bhello\b/i,
    ],
  },
  {
    type: "greeting",
    patterns: [
      /\b(?:hi|hey|hello|good morning|good afternoon|good evening|howdy|sup|yo)\b/i,
    ],
  },
  {
    type: "unknown",
    patterns: [/.+/],
  },
];

function extractEntities(
  query: string,
  pattern: IntentPattern
): Record<string, string> {
  const entities: Record<string, string> = {};
  if (!pattern.entities) return entities;

  for (const entity of pattern.entities) {
    const match = query.match(entity.pattern);
    if (match) {
      entities[entity.name] = match[1]?.trim() ?? match[0]?.trim() ?? "";
    }
  }
  return entities;
}

export function recognizeIntent(query: string): Intent {
  const trimmed = query.trim();
  if (!trimmed) {
    return { type: "unknown", confidence: 0, entities: {}, originalQuery: query };
  }

  for (const intentPattern of INTENT_PATTERNS) {
    for (const pattern of intentPattern.patterns) {
      if (pattern.test(trimmed)) {
        return {
          type: intentPattern.type,
          confidence: 0.85,
          entities: extractEntities(trimmed, intentPattern),
          originalQuery: query,
        };
      }
    }
  }

  return { type: "unknown", confidence: 0.2, entities: {}, originalQuery: query };
}
