const POS={
  you:[50,91],planner:[50,76],router:[50,61],
  qwen:[10,38],openai:[23,24],gemini:[38,38],claude:[50,14],
  deepseek:[62,38],grok:[77,24],mistral:[90,38],kimi:[31,8],perplexity:[69,8],
  reviewer:[50,47]
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
const edges=$('edges'),nodes=$('nodes'),stars=$('stars'),q=$('q'),go=$('go'),mic=$('mic');
const answer=$('answer'),workspace=$('workspace'),listenText=$('listenText');

let busy=false, answered=false, listening=false, active=new Set(), selected=new Set(), activeEdges=new Set();
let lastWorker='openai', recognition=null;

function classify(t){
  const s=t.toLowerCase();
  if(/\b(code|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(s))return'coding';
  if(/\b(research|find|discover|compare|analyse|analyze|latest|source|news|security|privacy|market|repo|github)\b/.test(s))return'research';
  if(/\b(workflow|automate|automation|schedule|monitor|alert|pipeline|action)\b/.test(s))return'automation';
  if(/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(s))return'design';
  if(/\b(reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(s))return'reasoning';
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
    const A=POS[a],B=POS[b],p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M ${A[0]} ${A[1]} C ${A[0]} ${(A[1]+B[1])/2}, ${B[0]} ${(A[1]+B[1])/2}, ${B[0]} ${B[1]}`);
    p.setAttribute('class','edge'); p.dataset.e=`${a}:${b}`; edges.appendChild(p);
  }
  for(const [id,p] of Object.entries(POS)){
    const n=document.createElement('div'); n.id=`n-${id}`; n.className=`node ${id==='you'?'you ':''}`;
    n.style.left=`${p[0]}%`; n.style.top=`${p[1]}%`;
    n.innerHTML=`<div class="halo"></div><div class="orbit"></div><div class="core"><span>${id==='you'?'◉':id==='reviewer'?'✓':'✦'}</span></div><strong>${INFO[id][0]}</strong><small>${INFO[id][1]}</small>`;
    nodes.appendChild(n);
  }
  render();
}
function setStage(name){
  const order=['understand','route','solve','verify'];
  const idx=order.indexOf(name);
  document.querySelectorAll('.stage').forEach((el,i)=>{
    el.classList.toggle('active',i===idx);
    el.classList.toggle('done',i<idx || (answered && i<=idx));
  });
}
function setState(text,kind=''){
  document.querySelector('.state').className=`state ${kind}`.trim();
  $('stateText').textContent=text;
}
function render(){
  document.querySelectorAll('.edge').forEach(e=>e.classList.toggle('on',activeEdges.has(e.dataset.e)));
  for(const id of Object.keys(POS)){
    const n=$(`n-${id}`);
    if(!n)continue;
    n.classList.toggle('active',active.has(id));
    n.classList.toggle('answered',answered&&id==='you');
    n.classList.toggle('listening',listening&&id==='you');
    if(FAMILY.includes(id))n.classList.toggle('dim',selected.size>0&&!selected.has(id));
  }
  go.disabled=busy||!q.value.trim();
  mic.classList.toggle('listening',listening);
}
function star(a,b){
  const A=POS[a],B=POS[b],d=document.createElement('div'); d.className='star';
  d.style.setProperty('--x1',`${A[0]}%`); d.style.setProperty('--y1',`${A[1]}%`);
  d.style.setProperty('--x2',`${B[0]}%`); d.style.setProperty('--y2',`${B[1]}%`);
  d.innerHTML='<span></span>'; stars.appendChild(d); setTimeout(()=>d.remove(),900);
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function travel(a,b,ms=300){
  active=new Set([b]); activeEdges=new Set([`${a}:${b}`]); star(a,b); render(); await wait(ms);
}
function openAnswer(ok=true){
  answer.classList.add('open'); workspace.classList.add('open');
  $('tick').textContent=ok?'✓':'!';
  $('tick').classList.toggle('bad',!ok);
}
function resetForRun(question){
  busy=true; answered=false; selected=new Set(VISUAL_ROUTES[classify(question)]);
  active=new Set(['you']); activeEdges.clear(); answer.classList.remove('open'); workspace.classList.remove('open');
  setStage('understand'); setState('THINKING','busy'); listenText.textContent='AI Team is working'; render();
}
function finishError(message){
  answered=false; busy=false; active=new Set(['you']); activeEdges.clear(); setState('ATTENTION','error'); render();
  $('badge').textContent='CHECK';
  $('meta').textContent='AI NETWORK';
  $('body').textContent=message;
  $('agents').textContent='No login is required by this interface. If this is a static preview, use the deployed OmniRoute endpoint.';
  openAnswer(false);
  listenText.textContent='Type or speak';
}
async function handleEvent(evt){
  if(!evt||!evt.type)return;
  if(evt.type==='planner'){
    setStage('understand'); setState('UNDERSTANDING','busy'); await travel('you','planner',260); return;
  }
  if(evt.type==='worker'){
    setStage('solve'); setState('SOLVING','busy');
    active=new Set(['router']); activeEdges=new Set(['planner:router']); star('planner','router'); render(); await wait(220);
    lastWorker=nodeForModel(evt.model);
    selected.add(lastWorker);
    active=new Set([lastWorker]); activeEdges=new Set([`router:${lastWorker}`]); star('router',lastWorker); render(); return;
  }
  if(evt.type==='reviewer'){
    setStage('verify'); setState('VERIFYING','busy');
    active=new Set(['reviewer']); activeEdges=new Set([`${lastWorker}:reviewer`]); star(lastWorker,'reviewer'); render(); return;
  }
  if(evt.type==='retry'){
    setState('REFINING','busy'); $('badge').textContent='REFINING'; return;
  }
  if(evt.type==='done'){
    answered=true; busy=false; setStage('verify'); star('reviewer','you'); active=new Set(['you']); activeEdges=new Set(['reviewer:you']); render();
    setState('ANSWERED','done');
    $('badge').textContent='VALIDATED';
    $('meta').textContent=`${String(evt.taskType||'general').toUpperCase()} · ${friendlyModel(evt.model||'')}`;
    $('body').textContent=evt.answer||'No answer returned.';
    $('agents').textContent=`Specialist: ${friendlyModel(evt.model||'AI model')} · Independent review passed · OmniRoute server-side gateway`;
    openAnswer(true); listenText.textContent='Ready for your next prompt';
    document.title='✓ OmniRoute answered'; setTimeout(()=>document.title='OmniRoute AI Team',2400); return;
  }
  if(evt.type==='error') throw new Error(evt.message||'AI Team failed');
}
async function ask(){
  const question=q.value.trim();
  if(!question||busy)return;
  if(listening&&recognition){try{recognition.stop()}catch{}}
  resetForRun(question);
  try{
    if(/raw\.githack\.com|raw\.githubusercontent\.com/.test(location.hostname)){
      throw new Error('This is a static code preview, so it cannot execute the secure AI backend. Puter has been removed; use the deployed OmniRoute URL for live answers.');
    }
    const response=await fetch('/api/ask',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question})
    });
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
    finishError(e?.message||String(e));
  }finally{
    if(busy){busy=false;render()}
  }
}
function resizeInput(){
  q.style.height='auto';
  q.style.height=Math.min(q.scrollHeight,120)+'px';
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
    if(text.trim()){q.value=text.trim();resizeInput();render()}
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
mic.addEventListener('click',()=>{
  if(!recognition)return;
  if(listening){try{recognition.stop()}catch{};return}
  try{recognition.start()}catch{}
});
q.addEventListener('input',()=>{resizeInput();render()});
q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}});
go.addEventListener('click',ask);

draw(); initVoice(); setStage('understand'); setState('READY'); resizeInput();
