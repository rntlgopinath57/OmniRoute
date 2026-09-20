export const PUBLIC_FREE_MODEL = "freellmapi:kilo/stepfun/step-3.7-flash:free";

const SENSITIVE = /\b(?:api[ -]?key|secret|token|password|credential|sessionid|cookie|private\s+(?:repo|repository|code|data)|phone(?:\s+number)?|home\s+address|medical\s+(?:note|record|history)|firestore|admin\s+(?:login|password)|bharosa|safeqr|child\s+profile|parent\s+(?:details|phone|address)|whatsapp|telegram\s+chat\s+id|aadhaar|aadhar|pan\s+(?:card|number)|credit\s+card|bank\s+account)\b/i;
const HIGH_RISK_OR_FRESH = /\b(?:latest|today|current|source|cite|news|breaking|verify|fact[- ]?check|security|privacy|medical|health|legal|tax|investment|stock|market|price)\b/i;
const COMPLEX = /\b(?:analy[sz]e|analysis|compare|comparison|architecture|debug|refactor|audit|threat\s+model|root\s+cause|multi[- ]?step|comprehensive|deep\s+(?:research|analysis)|trade[- ]?off|reason(?:ing)?|design|implement|deploy|workflow|automation)\b/i;
const PERSONAL_PATTERN = /\b(?:my|our)\s+(?:account|email|phone|address|repo|repository|project|code|data|family|mother|father|child|password|token|key)\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const LONG_NUMBER = /\b\d{10,16}\b/;

function joinedHistory(history = []) {
  return history
    .slice(-4)
    .map((item) => typeof item?.content === "string" ? item.content : "")
    .join(" ");
}

export function assessRoutingLane({ question = "", contextualQuestion = "", taskType = "general", history = [] } = {}) {
  const current = String(contextualQuestion || question || "");
  const historyText = joinedHistory(history);
  const combined = `${historyText} ${current}`.trim();

  if (
    SENSITIVE.test(combined)
    || PERSONAL_PATTERN.test(combined)
    || EMAIL.test(combined)
    || LONG_NUMBER.test(combined)
  ) {
    return {
      lane: "trusted",
      publicFreeAllowed: false,
      reason: "sensitive_or_personal_context",
    };
  }

  if (HIGH_RISK_OR_FRESH.test(current)) {
    return {
      lane: "trusted",
      publicFreeAllowed: false,
      reason: "high_risk_or_fresh_information",
    };
  }

  const normalizedTask = String(taskType || "general").toLowerCase();
  const complex =
    normalizedTask !== "general"
    || current.length > 320
    || COMPLEX.test(current);

  if (complex) {
    return {
      lane: "trusted",
      publicFreeAllowed: true,
      reason: "complexity_requires_trusted_primary",
    };
  }

  return {
    lane: "public_free",
    publicFreeAllowed: true,
    reason: "simple_public_low_risk",
  };
}
