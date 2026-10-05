const RAW_DIAGRAM_PATTERN =
  /(?:^|\n)\s*(?:flowchart|graph)\s+(?:TD|LR|TB|RL)\b|\b[A-Za-z0-9_]+--?>[A-Za-z0-9_]+|\b[A-Za-z0-9_]+\s*\[["'][^\n]+|[│▼▲├└┬┴┼─]{2,}|[-=]{2,}>/i;

function normalizeInlineNumbering(text) {
  return String(text || "")
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n")
    .replace(/[ \t]*(?:→|⇒|➜|->|=>)[ \t]*(?=\n|$)/g, "")
    .trim();
}

export function containsRawFlowchartSyntax(answer) {
  return RAW_DIAGRAM_PATTERN.test(String(answer || ""));
}

export function normalizeFlowchartAnswer(answer) {
  return normalizeInlineNumbering(answer);
}

export function extractFlowchartStages(answer) {
  const text = normalizeInlineNumbering(answer);
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+([^\n]+)/g)];
  return matches
    .map((match) => ({
      index: Number(match[1]),
      label: String(match[2] || "")
        .replace(/[ \t]*(?:→|⇒|➜|->|=>)[ \t]*$/g, "")
        .trim(),
    }))
    .filter((stage) => stage.label.length > 0);
}

export function flowchartLooksStructured(answer) {
  const text = normalizeInlineNumbering(answer);
  if (!text || containsRawFlowchartSyntax(text)) return false;

  const stages = extractFlowchartStages(text);
  if (stages.length < 3) return false;

  const labels = stages.map((stage) => stage.label);
  if (labels.some((label) => label.length > 180)) return false;

  return true;
}
