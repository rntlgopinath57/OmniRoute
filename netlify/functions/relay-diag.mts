const now = () => Date.now();

async function testOpenAI() {
  const base = Netlify.env.get("OPENAI_BASE_URL");
  const key = Netlify.env.get("OPENAI_API_KEY");
  if (!base || !key) return { ok:false, provider:"openai", error:"missing gateway env" };
  const t=now();
  try{
    const r=await fetch(`${base.replace(/\/$/,"")}/v1/chat/completions`,{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
      body:JSON.stringify({model:"gpt-5.6-luna",messages:[{role:"user",content:"Reply only OK"}],max_completion_tokens:12}),
      signal:AbortSignal.timeout(8000),
    });
    const text=await r.text();
    return {ok:r.ok,provider:"openai",status:r.status,ms:now()-t,detail:r.ok?"ok":text.slice(0,180)};
  }catch(e){return {ok:false,provider:"openai",ms:now()-t,error:e instanceof Error?e.message:String(e)}}
}

async function testAnthropic() {
  const base = Netlify.env.get("ANTHROPIC_BASE_URL");
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!base || !key) return { ok:false, provider:"anthropic", error:"missing gateway env" };
  const t=now();
  try{
    const r=await fetch(`${base.replace(/\/$/,"")}/v1/messages`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5",max_tokens:12,messages:[{role:"user",content:"Reply only OK"}]}),
      signal:AbortSignal.timeout(8000),
    });
    const text=await r.text();
    return {ok:r.ok,provider:"anthropic",status:r.status,ms:now()-t,detail:r.ok?"ok":text.slice(0,180)};
  }catch(e){return {ok:false,provider:"anthropic",ms:now()-t,error:e instanceof Error?e.message:String(e)}}
}

async function testGemini() {
  const base = Netlify.env.get("GOOGLE_GEMINI_BASE_URL");
  const key = Netlify.env.get("GEMINI_API_KEY");
  if (!base || !key) return { ok:false, provider:"gemini", error:"missing gateway env" };
  const t=now();
  try{
    const r=await fetch(`${base.replace(/\/$/,"")}/v1beta/models/gemini-3.5-flash:generateContent`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({contents:[{parts:[{text:"Reply only OK"}]}],generationConfig:{maxOutputTokens:12}}),
      signal:AbortSignal.timeout(8000),
    });
    const text=await r.text();
    return {ok:r.ok,provider:"gemini",status:r.status,ms:now()-t,detail:r.ok?"ok":text.slice(0,180)};
  }catch(e){return {ok:false,provider:"gemini",ms:now()-t,error:e instanceof Error?e.message:String(e)}}
}

async function testOpenRouter() {
  const base = Netlify.env.get("OPENROUTER_BASE_URL");
  const key = Netlify.env.get("OPENROUTER_API_KEY");
  if (!base || !key) return { ok:false, provider:"openrouter", error:"missing gateway env" };
  const t=now();
  try{
    const r=await fetch(`${base.replace(/\/$/,"")}/chat/completions`,{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
      body:JSON.stringify({model:"deepseek/deepseek-v4-flash-0731",messages:[{role:"user",content:"Reply only OK"}],max_tokens:12}),
      signal:AbortSignal.timeout(8000),
    });
    const text=await r.text();
    return {ok:r.ok,provider:"openrouter",status:r.status,ms:now()-t,detail:r.ok?"ok":text.slice(0,180)};
  }catch(e){return {ok:false,provider:"openrouter",ms:now()-t,error:e instanceof Error?e.message:String(e)}}
}

export default async () => {
  const results=await Promise.all([testOpenAI(),testAnthropic(),testGemini(),testOpenRouter()]);
  return Response.json({
    ok:results.some((r:any)=>r.ok),
    at:new Date().toISOString(),
    results,
  },{headers:{"Cache-Control":"no-store"}});
};

export const config={path:"/api/relay-diag"};
