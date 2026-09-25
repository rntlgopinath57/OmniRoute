import askHandler from "./ask.mts";

type ChatMessage = { role?: string; content?: unknown };

function textContent(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part: any) => part?.type === "text" && typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\n");
}

function completionPayload(answer: string, model: string, done: any) {
  return {
    id: "chatcmpl-relay-" + crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    relay: { review: done.review || "", reviewer: done.reviewer || "", taskType: done.taskType || "" },
  };
}

export default async function openAICompatHandler(request: Request) {
  if (request.method !== "POST") return Response.json({ error: { message: "Method not allowed", type: "invalid_request_error" } }, { status: 405 });

  let body: any;
  try { body = await request.json(); }
  catch { return Response.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, { status: 400 }); }

  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find(m => m?.role === "user");
  const question = textContent(lastUser?.content).trim();
  if (!question) return Response.json({ error: { message: "A user message is required", type: "invalid_request_error" } }, { status: 400 });

  const history = messages
    .slice(0, Math.max(0, messages.lastIndexOf(lastUser)))
    .filter(m => (m?.role === "user" || m?.role === "assistant") && textContent(m.content))
    .slice(-6)
    .map(m => ({ role: m.role, content: textContent(m.content).slice(0, 6000) }));

  const relayRequest = new Request(new URL("/api/ask", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, history, preferredModel: typeof body?.model === "string" && body.model !== "relay" ? body.model : "" }),
  });
  const relayResponse = await askHandler(relayRequest);
  if (!relayResponse.ok) return relayResponse;

  const raw = await relayResponse.text();
  const events = raw.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const error = events.find((e: any) => e.type === "error");
  if (error) return Response.json({ error: { message: error.message || "Relay failed", type: "relay_error" } }, { status: 502 });

  const done = [...events].reverse().find((e: any) => e.type === "done");
  if (!done?.answer) return Response.json({ error: { message: "Relay returned no final answer", type: "relay_error" } }, { status: 502 });

  const model = done.model || body?.model || "relay";
  const payload = completionPayload(done.answer, model, done);

  // Hermes custom chat_completions uses streaming. Preserve the non-stream JSON
  // response for ordinary OpenAI-compatible clients, but emit standards-shaped
  // SSE chunks when stream=true.
  if (body?.stream === true) {
    const id = payload.id;
    const created = payload.created;
    const chunk = (delta: any, finish_reason: string | null = null) =>
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    const sse =
      chunk({ role: "assistant" }) +
      chunk({ content: done.answer }) +
      chunk({}, "stop") +
      "data: [DONE]\n\n";
    return new Response(sse, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-OmniRoute-Compat": "relay-poc" } });
  }

  return Response.json(payload, { headers: { "Cache-Control": "no-store", "X-OmniRoute-Compat": "relay-poc" } });
}
