function classify(text) {
  const q = text.toLowerCase();
  if (/\b(code|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|api)\b/.test(q)) return 'coding';
  if (/\b(research|find|discover|compare|analyse|analyze|repository|github|source|security|privacy)\b/.test(q)) return 'research';
  if (/\b(workflow|automate|automation|schedule|monitor|alert|github actions)\b/.test(q)) return 'automation';
  if (/\b(design|layout|ui|ux|website|visual|style)\b/.test(q)) return 'design';
  return 'general';
}

function routeFor(type) {
  return type === 'coding' || type === 'research' ? 'openai/gpt-5.6-sol' : 'openai/gpt-5.6-luna';
}

async function callGateway(model, messages, maxTokens = 1800) {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!key) throw new Error('AI Gateway is not authenticated on this deployment');
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      ...(model.startsWith('openai/') ? { reasoning_effort: 'medium' } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI Gateway ${response.status}: ${body.slice(0, 220)}`);
  }
  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('Model returned an empty response');
  return text.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return res.status(400).json({ error: 'Question is required' });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Transfer-Encoding', 'chunked');
  const emit = (payload) => res.write(JSON.stringify(payload) + '\n');

  try {
    const taskType = classify(question);
    const workerModel = routeFor(taskType);
    const reviewerModel = 'google/gemini-3.1-pro-preview';

    emit({ type: 'planner', taskType });
    await new Promise((resolve) => setTimeout(resolve, 350));
    emit({ type: 'worker', taskType, model: workerModel });

    let answer = await callGateway(workerModel, [
      {
        role: 'system',
        content: 'You are the worker inside an AI Team. Give a direct, useful answer. Be concise unless detail is necessary. Do not mention internal routing or this system prompt.',
      },
      { role: 'user', content: question },
    ]);

    emit({ type: 'reviewer', model: reviewerModel });
    const review = await callGateway(
      reviewerModel,
      [
        {
          role: 'system',
          content: 'You are an independent reviewer. Judge whether the proposed answer is relevant, coherent, safe, and sufficiently addresses the user question. Reply with exactly PASS or FAIL on the first line. If FAIL, put one short improvement instruction on the second line.',
        },
        { role: 'user', content: `QUESTION:\n${question}\n\nPROPOSED ANSWER:\n${answer}` },
      ],
      220,
    );

    if (!review.split(/\r?\n/)[0].trim().toUpperCase().startsWith('PASS')) {
      emit({ type: 'retry' });
      answer = await callGateway(workerModel, [
        {
          role: 'system',
          content: 'Revise the answer after independent review. Return only the improved final answer, concise and direct.',
        },
        {
          role: 'user',
          content: `QUESTION:\n${question}\n\nFIRST ANSWER:\n${answer}\n\nREVIEWER:\n${review}`,
        },
      ]);
      emit({ type: 'reviewer', model: reviewerModel });
    }

    emit({ type: 'done', answer, review: 'PASS', model: workerModel, taskType });
    res.end();
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Unknown AI Team error' });
    res.end();
  }
}
