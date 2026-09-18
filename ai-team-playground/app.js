const POS={
  you:[8,78],planner:[8,57],router:[9,36],
  qwen:[20,18],openai:[32,10],gemini:[45,16],claude:[58,9],
  deepseek:[70,16],grok:[82,12],mistral:[92,30],kimi:[32,4],perplexity:[68,4],
  reviewer:[92,72]
};
const INFO={
  you:['YOU','Command center'],planner:['PLANNER','Understands intent'],router:['ROUTER','Selects specialist'],
  qwen:['QWEN','Code + reasoning'],openai:['OPENAI','General + coding'],gemini:['GEMINI','Research + design'],
  claude:['CLAUDE','Review + reasoning'],deepseek:['DEEPSEEK','Reasoning + code'],grok:['GROK','Critic'],
  mistral:['MISTRAL','Fast generalist'],kimi:['KIMI','Long context'],perplexity:['PERPLEXITY','Research'],
  reviewer:['REVIEWER','Independent validation']
};
const FAMILY=['qwen','openai','gemini','claude','deepseek','grok','mistral','kimi','perplexity'];
const VISUAL_ROUTES={
  coding:['openai','qwen','claude'],
  research:['gemini','perplexity','claude'],
  automation:['openai','deepseek','qwen'],
  design:['gemini','claude','openai'],
  reasoning:['deepseek','claude','openai'],
  general:['openai','claude','gemini']
};
const $=id=>document.getElementById(id);
const edges=$('edges'),nodes=$('nodes'),q=$('q'),go=$('go'),mic=$('mic');
const answer=$('answer'),workspace=$('workspace'),listenText=$('listenText');
const followQ=$('followQ'),followGo=$('followGo'),followMic=$('followMic'),thread=$('thread'),canvas=$('canvas'),burstLayer=$('burstLayer');

let busy=false, answered=false, listening=false, active=new Set(), selected=new Set(), activeEdges=new Set();
let lastWorker='openai', recognition=null, currentQuestion='', conversation=[], chatStarted=false, pendingMessage=null, voiceTarget=q;
let lastSuccessfulModel='', lastSuccessfulTaskType='';

function classify(t){
  const s=t.toLowerCase();
  if(/\b(code|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(s))return'coding';
  if(/\b(workflow|workflows|automate|automation|schedule|monitor|alert|pipeline|github actions|actions)\b/.test(s))return'automation';
  if(/\b(research|find|discover|latest|source|cite|news|security|privacy|market)\b/.test(s))return'research';
  if(/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(s))return'design';
  if(/\b(compare|comparison|versus|vs\.?|analyse|analyze|reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(s))return'reasoning';
  return'general';
}
function nodeForModel(model=''){
  const m=model.toLowerCase();
  if(m.includes('gemini')||m.includes('google'))return'gemini';
  if(m.includes('claude')||m.includes('anthropic'))return'claude';
  if(m.includes('deepseek'))return'deepseek';
  if(m.includes('qwen')||m.includes('alibaba'))return'qwen';
  if(m.includes('grok')||m.includes('xai'))return'grok';
  if(m.includes('mistral'))return'mistral';
  if(m.includes('kimi')||m.includes('moonshot'))return'kimi';
  if(m.includes('perplexity')||m.includes('sonar'))return'perplexity';
  return'openai';
}
function friendlyModel(model=''){
  return model.replace(/^.*\//,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function draw(){
  edges.innerHTML=''; nodes.innerHTML='';
  const links=[['you','planner'],['planner','router'],...FAMILY.map(x=>['router',x]),...FAMILY.map(x=>[x,'reviewer']),['reviewer','you']];
  for(const [a,b] of links){
    const A=POS[a],B=POS[b],d=`M ${A[0]} ${A[1]} C ${A[0]} ${(A[1]+B[1])/2}, ${B[0]} ${(A[1]+B[1])/2}, ${B[0]} ${B[1]}`;
    const base=document.createElementNS('http://www.w3.org/2000/svg','path');
    base.setAttribute('d',d); base.setAttribute('class','edge'); base.dataset.e=`${a}:${b}`; edges.appendChild(base);
    const flow=document.createElementNS('http://www.w3.org/2000/svg','path');
    flow.setAttribute('d',d); flow.setAttribute('class','edgeFlow'); flow.dataset.e=`${a}:${b}`; edges.appendChild(flow);
  }
  Object.entries(POS).forEach(([id,p],idx)=>{
    const n=document.createElement('div'); n.id=`n-${id}`; n.className=`node ${id==='you'?'you ':''}`;
    n.style.left=`${p[0]}%`; n.style.top=`${p[1]}%`;
    n.style.setProperty('--phase',`${-(idx%7)*.41}s`);
    n.style.setProperty('--tilt',`${(idx%2?1:-1)*(1+(idx%3))}deg`);
    const mark=id==='you'
      ? '<span class="youMark">◉</span>'
      : id==='reviewer'
        ? '<span class="reviewMark">✓</span>'
        : '<svg class="seismo" viewBox="0 0 42 20" aria-hidden="true"><polyline points="0,10 5,10 8,6 11,14 14,9 17,10 20,3 23,17 26,8 29,11 32,6 35,13 38,10 42,10"></polyline></svg>';
    n.innerHTML=`<div class="halo"></div><div class="orbit"></div><div class="energy"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="core">${mark}</div><strong>${INFO[id][0]}</strong><small>${INFO[id][1]}</small>`;
    nodes.appendChild(n);
  });
  render();
}
function setStage(name){
  canvas.dataset.stage=name;
}
function setState(text,kind=''){
  document.querySelector('.state').className=`state ${kind}`.trim();
  $('stateText').textContent=text;
  const processText=$('processText');
  const processRail=$('processRail');
  if(processText)processText.textContent=text;
  if(processRail)processRail.dataset.mode=kind||'ready';
  canvas.dataset.mode=kind||'ready';
}
function render(){
  document.querySelectorAll('.edge,.edgeFlow').forEach(e=>e.classList.toggle('on',activeEdges.has(e.dataset.e)));
  for(const id of Object.keys(POS)){
    const n=$(`n-${id}`);
    if(!n)continue;
    n.classList.toggle('active',active.has(id));
    n.classList.toggle('answered',answered&&id==='you');
    n.classList.toggle('listening',listening&&id==='you');
    n.classList.toggle('energized',busy&&selected.has(id));
    if(FAMILY.includes(id))n.classList.toggle('dim',selected.size>0&&!selected.has(id));
  }
  go.disabled=busy||!q.value.trim();
  followGo.disabled=busy||!followQ.value.trim();
  mic.classList.toggle('listening',listening);
  followMic.classList.toggle('listening',listening&&voiceTarget===followQ);
}
function burstAt(id,kind='route'){
  const p=POS[id];
  if(!p||!burstLayer)return;
  const b=document.createElement('div');
  b.className=`nodeBurst ${kind}`;
  b.style.left=`${p[0]}%`; b.style.top=`${p[1]}%`;
  b.innerHTML='<i></i><i></i><i></i>';
  burstLayer.appendChild(b);
  setTimeout(()=>b.remove(),1150);
}
function kickNode(id){
  const n=$(`n-${id}`);
  if(!n)return;
  n.classList.remove('kick');
  void n.offsetWidth;
  n.classList.add('kick');
  burstAt(id,'route');
  setTimeout(()=>n.classList.remove('kick'),650);
}
function validatedBurst(){
  canvas.classList.remove('validatedBurst');
  void canvas.offsetWidth;
  canvas.classList.add('validatedBurst');
  burstAt('you','done');
  setTimeout(()=>canvas.classList.remove('validatedBurst'),1500);
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function travel(a,b,ms=300){
  active=new Set([b]); activeEdges=new Set([`${a}:${b}`]); render(); kickNode(b); await wait(ms);
}
function scrollThread(){
  requestAnimationFrame(()=>{ thread.scrollTop=thread.scrollHeight; });
}
function clearWelcome(){
  const welcome=thread.querySelector('.threadWelcome');
  if(welcome)welcome.remove();
}
function appendMessage(role,text,meta=''){
  clearWelcome();
  const row=document.createElement('div');
  row.className=`messageRow ${role}`;
  const bubble=document.createElement('article');
  bubble.className='messageBubble';
  const label=document.createElement('div');
  label.className='messageLabel';
  label.textContent=role==='user'?'YOU':'AI TEAM';
  const body=document.createElement('div');
  body.className='messageText';
  body.textContent=text;
  bubble.append(label,body);
  if(meta){
    const m=document.createElement('div');
    m.className='messageMeta';
    m.textContent=meta;
    bubble.appendChild(m);
  }
  row.appendChild(bubble);
  thread.appendChild(row);
  scrollThread();
  return row;
}
function clearFailedAttempt(question=''){
  const rows=[...thread.querySelectorAll('.messageRow.failed')];
  for(const row of rows){
    if(!question || row.dataset.question===question)row.remove();
  }
}
function startPending(text='Understanding your request…'){
  pendingMessage=appendMessage('assistant',text);
  pendingMessage.classList.add('pending');
  pendingMessage.dataset.question=currentQuestion;
  const dots=document.createElement('span');
  dots.className='thinkingDots';
  dots.innerHTML='<i></i><i></i><i></i>';
  pendingMessage.querySelector('.messageBubble').appendChild(dots);
}
function updatePending(text){
  if(!pendingMessage)return;
  const el=pendingMessage.querySelector('.messageText');
  if(el)el.textContent=text;
  scrollThread();
}
function resolvePending(text,meta){
  if(!pendingMessage){
    pendingMessage=appendMessage('assistant',text,meta);
    return;
  }
  pendingMessage.classList.remove('pending','failed');
  const el=pendingMessage.querySelector('.messageText');
  if(el)el.textContent=text;
  const dots=pendingMessage.querySelector('.thinkingDots');
  if(dots)dots.remove();
  let m=pendingMessage.querySelector('.messageMeta');
  if(!m){
    m=document.createElement('div');
    m.className='messageMeta';
    pendingMessage.querySelector('.messageBubble').appendChild(m);
  }
  m.textContent=meta||'Validated';
  pendingMessage=null;
  scrollThread();
}
function failPending(message){
  if(!pendingMessage)pendingMessage=appendMessage('assistant',message);
  pendingMessage.classList.remove('pending');
  pendingMessage.classList.add('failed');
  const text=pendingMessage.querySelector('.messageText');
  if(text)text.textContent=message;
  const dots=pendingMessage.querySelector('.thinkingDots');
  if(dots)dots.remove();
  const bubble=pendingMessage.querySelector('.messageBubble');
  const retry=document.createElement('button');
  retry.className='messageRetry';
  retry.type='button';
  retry.textContent='Retry this prompt';
  retry.addEventListener('click',()=>{ if(!busy)ask(currentQuestion,true); });
  bubble.appendChild(retry);
  pendingMessage=null;
  scrollThread();
}
function openAnswer(ok=true){
  answer.classList.add('open');
  workspace.classList.add('open','chatting');
  $('tick').textContent=ok?'✓':'!';
  $('tick').classList.toggle('bad',!ok);
}
function resetForRun(question,isRetry=false){
  currentQuestion=question;
  busy=true; answered=false; selected=new Set(VISUAL_ROUTES[classify(question)]);
  active=new Set(['you']); activeEdges.clear();
  if(!chatStarted){
    chatStarted=true;
    openAnswer(true);
  }else{
    answer.classList.add('open');
    workspace.classList.add('open','chatting');
  }
  if(isRetry)clearFailedAttempt(question);
  else appendMessage('user',question);
  startPending(isRetry?'Retrying your request…':'Understanding your request…');
  $('tick').textContent='◉'; $('tick').classList.remove('bad');
  $('badge').textContent='PROCESSING';
  $('meta').textContent='WORKING';
  q.value=''; resizeInput();
  setStage('understand'); setState('THINKING','busy'); listenText.textContent='AI Team is working'; render();
}
function finishError(message){
  answered=false; busy=false; active=new Set(['you']); activeEdges.clear(); setState('ATTENTION','error'); render();
  $('badge').textContent='INTERRUPTED';
  $('meta').textContent='REQUEST STOPPED';
  failPending(message);
  $('tick').textContent='!'; $('tick').classList.add('bad');
  answer.classList.add('open'); workspace.classList.add('open','chatting');
  listenText.textContent='Type or speak';
}
async function handleEvent(evt){
  if(!evt||!evt.type)return;
  if(evt.type==='planner'){
    setStage('understand'); setState('UNDERSTANDING','busy'); updatePending('Planner is understanding your request…'); await travel('you','planner',260); return;
  }
  if(evt.type==='worker'){
    setStage('route'); setState('ROUTING','busy');
    active=new Set(['router']); activeEdges=new Set(['planner:router']); render(); kickNode('router'); await wait(280);
    setStage('solve'); setState('SOLVING','busy');
    updatePending(`${friendlyModel(evt.model)} is working on the answer…`);
    lastWorker=nodeForModel(evt.model);
    selected.add(lastWorker);
    active=new Set([lastWorker]); activeEdges=new Set([`router:${lastWorker}`]); render(); kickNode(lastWorker); return;
  }
  if(evt.type==='hedge'){
    setState('ACCELERATING','busy');
    updatePending(`Relay opened another provider path with ${friendlyModel(evt.model)}…`);
    return;
  }
  if(evt.type==='worker_selected'){
    lastWorker=nodeForModel(evt.model);
    selected.add(lastWorker);
    active=new Set([lastWorker]);
    activeEdges=new Set([`router:${lastWorker}`]);
    setState('SOLVING','busy');
    updatePending(`${friendlyModel(evt.model)} responded first — preparing the answer…`);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='fallback'){
    setState('SWITCHING','busy');
    updatePending(`Switching to ${friendlyModel(evt.model)} for a faster response…`);
    lastWorker=nodeForModel(evt.model);
    selected.add(lastWorker);
    active=new Set([lastWorker]);
    activeEdges=new Set([`router:${lastWorker}`]);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='reviewer'){
    setStage('verify'); setState('VERIFYING','busy');
    updatePending('Independent reviewer is checking the answer…');
    active=new Set(['reviewer']); activeEdges=new Set([`${lastWorker}:reviewer`]); render(); kickNode('reviewer'); return;
  }
  if(evt.type==='fast_path'){
    setState('FINALIZING','busy');
    $('badge').textContent='FAST PATH';
    updatePending('Answer ready — no extra review needed for this request…');
    return;
  }
  if(evt.type==='review_skipped'){
    setState('FINALIZING','busy');
    $('badge').textContent='REVIEW BYPASSED';
    updatePending('Reviewer was unavailable, so Relay is returning the specialist answer without blocking you…');
    return;
  }
  if(evt.type==='retry'){
    setState('REFINING','busy'); $('badge').textContent='REFINING'; updatePending('Reviewer requested a refinement…'); return;
  }
  if(evt.type==='done'){
    clearFailedAttempt(currentQuestion);
    lastSuccessfulModel=String(evt.model||'');
    lastSuccessfulTaskType=String(evt.taskType||'');
    answered=true; busy=false; setStage('verify'); active=new Set(['you']); activeEdges=new Set(['reviewer:you']); render(); kickNode('you'); validatedBurst();
    setState('ANSWERED','done');
    $('badge').textContent='VALIDATED';
    $('meta').textContent=`${String(evt.taskType||'general').toUpperCase()} · ${friendlyModel(evt.model||'')}`;
    resolvePending(
      evt.answer||'No answer returned.',
      `${friendlyModel(evt.model||'AI model')} · ${evt.review==='PASS'?'independent review passed':evt.review==='FAST_PATH'?'fast path · reviewer skipped':'review timeout · answer returned'}`
    );
    if(currentQuestion && evt.answer){
      conversation.push({role:'user',content:currentQuestion},{role:'assistant',content:evt.answer});
      conversation=conversation.slice(-8);
    }
    followQ.value='';
    resizeFollow();
    openAnswer(true); listenText.textContent='Ready for your next prompt';
    document.title='✓ Relay answered'; setTimeout(()=>document.title='Relay AI Team',2400); return;
  }
  if(evt.type==='error') throw new Error(evt.message||'AI Team failed');
}
function isVideoEditIntent(text=''){
  const s=text.toLowerCase();
  return /\b(video|clip|footage)\b/.test(s) && /\b(edit|trim|cut|crop|resize|reframe|mute|remove audio|aspect|convert)\b/.test(s);
}
function mediaIntentType(text=''){
  const s=text.toLowerCase();
  if(/\b(generate|create|make|render)\b/.test(s) && /\b(video|clip|animation|reel)\b/.test(s))return 'video';
  if(/\b(generate|create|make|draw|render)\b/.test(s) && /\b(image|picture|photo|poster|art|logo)\b/.test(s))return 'image';
  return '';
}
function openVideoEditorForPrompt(question){
  if(!window.RelayVideoEditor?.openFromPrompt)return false;
  if(!chatStarted){chatStarted=true;openAnswer(true)}
  appendMessage('user',question);
  appendMessage('assistant','Video editor ready. Choose a video, set trim, aspect ratio or mute options, then process it locally in your browser. Your source video stays on your device.');
  $('badge').textContent='LOCAL TOOL';
  $('meta').textContent='VIDEO EDITOR';
  setState('VIDEO EDITOR','done');
  q.value=''; resizeInput();
  followQ.value=''; resizeFollow();
  window.RelayVideoEditor.openFromPrompt(question);
  render();
  return true;
}

async function ask(questionOverride='',isRetry=false){
  const question=(questionOverride||q.value).trim();
  if(!question||busy)return;
  if(!isRetry&&isVideoEditIntent(question)&&openVideoEditorForPrompt(question))return;
  const mediaType=!isRetry?mediaIntentType(question):'';
  if(mediaType&&window.RelayMediaGenerator?.openFromPrompt){
    if(!chatStarted){chatStarted=true;openAnswer(true)}
    appendMessage('user',question);
    appendMessage('assistant',`${mediaType==='video'?'Video':'Image'} generator ready. Review the prompt, then press Generate.`);
    $('badge').textContent='MEDIA TOOL';
    $('meta').textContent=mediaType==='video'?'VEO 3.1':'NANO BANANA 2';
    setState(mediaType==='video'?'VIDEO GENERATOR':'IMAGE GENERATOR','done');
    q.value=''; resizeInput();
    followQ.value=''; resizeFollow();
    window.RelayMediaGenerator.openFromPrompt(mediaType,question);
    render();
    return;
  }
  q.value=question;
  resizeInput();
  if(listening&&recognition){try{recognition.stop()}catch{}}
  resetForRun(question,isRetry);
  try{
    if(/raw\.githack\.com|raw\.githubusercontent\.com/.test(location.hostname)){
      throw new Error('This static preview cannot execute the secure AI backend. Open the deployed Relay URL for live answers.');
    }
    const requestController=new AbortController();
    const requestTimeout=setTimeout(()=>requestController.abort(),28000);
    let response;
    try{
      response=await fetch('/api/ask',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          question,
          history:conversation.slice(-6),
          preferredModel:lastSuccessfulModel,
          previousTaskType:lastSuccessfulTaskType
        }),
        signal:requestController.signal
      });
    }finally{
      clearTimeout(requestTimeout);
    }
    if(!response.ok)throw new Error(`AI endpoint returned ${response.status}`);
    if(!response.body)throw new Error('Streaming response is unavailable in this browser');
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer='';
    while(true){
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      const lines=buffer.split('\n'); buffer=lines.pop()||'';
      for(const line of lines){
        if(!line.trim())continue;
        await handleEvent(JSON.parse(line));
      }
      if(done)break;
    }
    if(buffer.trim())await handleEvent(JSON.parse(buffer));
  }catch(e){
    const message=e?.name==='AbortError'
      ? 'Relay could not get a provider response within 28 seconds. Please retry in a moment.'
      : (e?.message||String(e));
    finishError(message);
  }finally{
    if(busy){busy=false;render()}
  }
}
function resizeInput(){
  q.style.height='auto';
  q.style.height=Math.min(q.scrollHeight,120)+'px';
}
function resizeFollow(){
  followQ.style.height='auto';
  followQ.style.height=Math.min(followQ.scrollHeight,96)+'px';
}
function submitFollow(){
  const text=followQ.value.trim();
  if(!text||busy)return;
  followQ.value='';
  resizeFollow();
  ask(text,false);
}
function initVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){mic.disabled=true;mic.title='Voice input is not supported in this browser';return}
  recognition=new SR(); recognition.lang='en-IN'; recognition.interimResults=true; recognition.continuous=false;
  recognition.onstart=()=>{
    listening=true; active=new Set(['you']); setState('LISTENING','listening'); listenText.textContent='Listening… speak naturally'; render();
  };
  recognition.onresult=e=>{
    let text='';
    for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;
    if(text.trim()){
      voiceTarget.value=text.trim();
      if(voiceTarget===followQ)resizeFollow(); else resizeInput();
      render();
    }
  };
  recognition.onerror=e=>{
    listening=false; setState('READY'); listenText.textContent=e.error==='not-allowed'?'Microphone permission was not granted':'Voice input stopped'; render();
  };
  recognition.onend=()=>{
    listening=false;
    if(!busy)setState('READY');
    listenText.textContent=q.value.trim()?'Voice captured — press send':'Type or speak';
    render();
  };
}
function toggleVoice(target){
  if(!recognition)return;
  voiceTarget=target;
  if(listening){try{recognition.stop()}catch{};return}
  try{recognition.start()}catch{}
}
mic.addEventListener('click',()=>toggleVoice(q));
followMic.addEventListener('click',()=>toggleVoice(followQ));
q.addEventListener('input',()=>{resizeInput();render()});
q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}});
followQ.addEventListener('input',()=>{resizeFollow();render()});
followQ.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitFollow()}});
go.addEventListener('click',()=>ask());
followGo.addEventListener('click',submitFollow);

let parallaxFrame=0;
function setParallax(x,y){
  cancelAnimationFrame(parallaxFrame);
  parallaxFrame=requestAnimationFrame(()=>{
    canvas.style.setProperty('--mx',String(x));
    canvas.style.setProperty('--my',String(y));
  });
}
canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();
  const x=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2));
  const y=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2));
  setParallax(x.toFixed(3),y.toFixed(3));
});
canvas.addEventListener('pointerleave',()=>setParallax(0,0));

draw(); initVoice(); setStage('understand'); setState('READY'); resizeInput(); resizeFollow();
