const base = process.argv[2];
if (!base) throw new Error("missing base URL");
const body = {
  model: "relay",
  messages: [{ role: "user", content: "Call the probe tool once." }],
  tools: [{ type: "function", function: { name: "nandi_preflight_probe", description: "POC provider tool-call probe", parameters: { type: "object", properties: {}, additionalProperties: false } } }],
  tool_choice: "required"
};
const r = await fetch(base + "/api/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const text = await r.text();
if (!r.ok) throw new Error("provider preflight HTTP " + r.status + ": " + text.slice(0, 300));
const x = JSON.parse(text);
const calls = x?.choices?.[0]?.message?.tool_calls || [];
if (!calls.length || calls[0]?.function?.name !== "nandi_preflight_probe") throw new Error("provider preflight missing required tool_call");
console.log("HERMES_PROVIDER_PREFLIGHT: PASS");
