import { selectModelRoute } from "./router.mjs";

const CLASSIFICATION_RULES = [
  {
    type: "automation",
    patterns: [
      /\bworkflow\b/i,
      /\bautomate\b/i,
      /\bautomation\b/i,
      /\bschedule(?:d|s|ing)?\b/i,
      /\bevery\s+(?:morning|day|week|month)\b/i,
      /\bgithub actions?\b/i,
      /\bmonitor(?:ing)?\b/i,
      /\balert(?:s|ing)?\b/i,
    ],
  },
  {
    type: "coding",
    patterns: [
      /\bcode\b/i,
      /\bbug\b/i,
      /\bfix\b/i,
      /\bdebug\b/i,
      /\brefactor\b/i,
      /\bpython\b/i,
      /\bjavascript\b/i,
      /\btypescript\b/i,
      /\babap\b/i,
      /\bcds\b/i,
      /\bapi\b/i,
    ],
  },
  {
    type: "research",
    patterns: [
      /\bresearch\b/i,
      /\bfind\b/i,
      /\bdiscover\b/i,
      /\bcompare\b/i,
      /\banaly[sz]e\b/i,
      /\brepositor(?:y|ies)\b/i,
      /\bgithub repo(?:sitory|s)?\b/i,
      /\bsource(?:s)?\b/i,
    ],
  },
  {
    type: "design",
    patterns: [
      /\bdesign\b/i,
      /\blayout\b/i,
      /\bui\b/i,
      /\bux\b/i,
      /\bwebsite\b/i,
      /\bvisual\b/i,
      /\bstyle\b/i,
    ],
  },
];

export function classifyTask(taskText) {
  const text = typeof taskText === "string" ? taskText.trim() : "";

  if (!text) {
    return "general";
  }

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.type;
    }
  }

  return "general";
}

export function normalizeTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Task input must be a JSON object");
  }

  const task = typeof input.task === "string" ? input.task.trim() : "";
  const requestedType = typeof input.type === "string" ? input.type.trim().toLowerCase() : "";

  if (!task) {
    throw new TypeError("Task input requires a non-empty task string");
  }

  return {
    task,
    type: requestedType || classifyTask(task),
  };
}

export function executeTask(input) {
  const task = normalizeTask(input);
  const route = selectModelRoute(task.type);

  return {
    status: "success",
    task: task.task,
    type: task.type,
    route,
    result: "AI Team task received successfully",
  };
}
