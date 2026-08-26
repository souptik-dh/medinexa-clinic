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
    type: "get_sales_report",
    patterns: [
      /\b(?:show|get|see|view|generate|pull)\b.*\b(?:sales|revenue|payment|collection|earning)s?\b/i,
      /\b(?:sales|revenue|payment|collection|earning)s?\b.*\b(?:report|summary|breakdown|detail)s?\b/i,
      /\bhow (?:much )?(?:did (?:we|the clinic))\b.*\b(?:earn|collect|make|get)\b/i,
      /\b(?:today|this week|this month|this quarter|this year|last month|last quarter|last year)(?:'s)?\s+(?:sales|revenue|payment|collection|earning)s?\b/i,
      /\b(?:daily|monthly|quarterly|yearly)\s+(?:sales|revenue|report|collection)s?\b/i,
      /\bshow\s+(?:me\s+)?(?:the\s+)?(?:revenue|sales|payments?)\s+(?:by|for|from|between|of)\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|last quarter|this year|last year|daily|monthly|quarterly|yearly|weekly)\b/i },
      { name: "dateRange", pattern: /\bbetween\s+(\d{4}-\d{2}-\d{2})\s+and\s+(\d{4}-\d{2}-\d{2})\b/i },
    ],
  },
  {
    type: "get_patient_report",
    patterns: [
      /\b(?:show|get|see|view|generate)\b.*\bpatient\s+(?:report|statistics|growth|summary|analytics|breakdown|count|number)s?\b/i,
      /\b(?:patient|patients)\s+(?:report|statistics|growth|summary|analytics|breakdown)s?\b/i,
      /\bhow (?:many|much)\s+(?:new\s+)?patients?\b/i,
      /\b(?:new|returning|active|inactive|total)\s+patients?\b.*\b(?:this|last|today|month|quarter|year|week)\b/i,
      /\bpatient\s+(?:growth|trend|comparison)\b/i,
      /\b(?:show|get)\b.*\bnew\s+patients?\b.*\b(?:today|this month|this quarter|this year|this week)\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|last quarter|this year|last year|daily|monthly|quarterly|yearly|weekly)\b/i },
    ],
  },
  {
    type: "get_booking_report",
    patterns: [
      /\b(?:show|get|see|view|generate)\b.*\b(?:booking|appointment)s?\s+(?:report|statistics|summary|analytics|breakdown|trend|growth|rate)s?\b/i,
      /\b(?:booking|appointment)s?\s+(?:report|statistics|summary|analytics|breakdown|trend|growth|rate)s?\b/i,
      /\bhow (?:many|much)\s+(?:bookings?|appointments?)\b/i,
      /\b(?:booking|appointment)\s+(?:completion|cancellation|confirmation|no-show)\s+rate\b/i,
      /\b(?:show|get)\b.*\b(?:booking|appointment)\s+(?:trend|growth|comparison|by)\b/i,
      /\b(?:today|this week|this month|this quarter|this year)(?:'s)?\s+(?:bookings?|appointments?)\b/i,
      /\b(?:confirmed|pending|completed|cancelled|no-show|upcoming)\s+(?:bookings?|appointments?)\s+(?:report|count|number|statistics)s?\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|last quarter|this year|last year|daily|monthly|quarterly|yearly|weekly)\b/i },
      { name: "doctorId", pattern: /\b(?:for|by|doctor)\s+(?:dr\.?\s*)?([a-f0-9]{24})\b/i },
    ],
  },
  {
    type: "get_lab_test_report",
    patterns: [
      /\b(?:show|get|see|view|generate)\b.*\blab\s+test\s+(?:report|statistics|revenue|sales|summary|analytics|breakdown|growth)s?\b/i,
      /\blab\s+test\s+(?:report|statistics|revenue|sales|summary|analytics|breakdown|growth)s?\b/i,
      /\bhow (?:many|much)\s+lab\s+tests?\b/i,
      /\blab\s+(?:test|testing)\s+(?:revenue|sales|income|earnings?)\b/i,
      /\b(?:show|get)\b.*\blab\s+(?:test|testing)\s+(?:trend|growth|by|popular|most booked)\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|last quarter|this year|last year|daily|monthly|quarterly|yearly|weekly)\b/i },
    ],
  },
  {
    type: "get_business_summary",
    patterns: [
      /\b(?:show|get|give|generate)\b.*\b(?:business|clinic|daily|monthly|weekly|quarterly|yearly)\s+summary\b/i,
      /\bwhat happened\s+(?:today|this week|this month)\b/i,
      /\bwhat(?:'s| is)\s+(?:pending|needs?|urgent|important|attention)\b/i,
      /\b(?:show|get)\b.*\b(?:important|key|pending|attention)\s+(?:alerts?|items?|tasks?)\b/i,
      /\b(?:show|get)\b.*\b(?:clinic|branch|doctor|performance)\s+(?:summary|report|insights?|overview)\b/i,
      /\bgive me (?:a |the )?(?:today|daily|monthly|weekly|quarterly|yearly) (?:summary|overview|report)\b/i,
      /\b(?:what|how)(?:'s| is| are)\b.*\b(?:business|clinic|practice)\s+(?:doing|performing|looking)\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|this year|daily|monthly|weekly|quarterly|yearly)\b/i },
    ],
  },
  {
    type: "get_analytics",
    patterns: [
      /\b(?:show|get|see|view|generate)\b.*\b(?:analytics|analysis|compare|comparison|trend|insights?|growth)\b/i,
      /\bcompare\b.*\b(?:this|last)\s+(?:month|quarter|year|week)\b/i,
      /\b(?:this|last)\s+(?:month|quarter|year)\s+(?:vs|versus|compared to|against)\s+(?:this|last)\s+(?:month|quarter|year)\b/i,
      /\b(?:revenue|patient|booking|appointment|lab test)\s+(?:growth|trend|comparison|decline|increase)\b/i,
      /\b(?:best|top|worst|highest|lowest|most|least)\s+(?:performing|popular|booked|productive)\b.*\b(?:branch|doctor|clinic|service|month|period)\b/i,
      /\b(?:show|identify|find)\b.*\b(?:unusual|declining|increasing|growing|dropping)\b.*\b(?:changes?|trends?|patterns?)\b/i,
    ],
    entities: [
      { name: "period", pattern: /\b(today|this week|this month|last month|this quarter|last quarter|this year|last year|daily|monthly|quarterly|yearly|weekly)\b/i },
      { name: "analyticsType", pattern: /\b(revenue|patient|booking|appointment|lab test|performance)\s+(?:comparison|growth|trend|analysis)\b/i },
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
    type: "mark_all_notifications_read",
    patterns: [
      /\b(?:mark|mark all)\b.*\bnotifications?\b.*\b(?:all|read|done|viewed|cleared)\b/i,
      /\b(?:clear|dismiss|read)\s+all\s+notifications?\b/i,
      /\b(?:mark|set)\b.*\ball\b.*\bnotifications?\b.*\bread\b/i,
    ],
  },
  {
    type: "complete_lab_appointment",
    patterns: [
      /\b(?:complete|finish|mark as done)\b.*\blab test\b/i,
      /\blab test\b.*\b(?:complete|finished|done)\b/i,
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
