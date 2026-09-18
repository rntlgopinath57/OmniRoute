const POS={
  you:[23,86],planner:[28,16],router:[58,28],github:[20,43],
  researcher:[50,45],analyst:[79,43],coder:[28,64],builder:[57,64],designer:[82,63],
  reviewer:[70,82]
};
const INFO={
  you:['YOU','Command center'],
  planner:['PLANNER','Understands intent'],
  router:['ROUTER','Selects route'],
  github:['GITHUB','Repository tool'],
  researcher:['RESEARCHER','Research specialist'],
  analyst:['ANALYST','Reasoning specialist'],
  coder:['CODER','Code specialist'],
  builder:['AUTOMATOR','Workflow specialist'],
  designer:['DESIGNER','Visual specialist'],
  reviewer:['REVIEWER','Independent validation']
};
const SPECIALISTS=['researcher','analyst','coder','builder','designer'];
const VISUAL_ROUTES={
  coding:['coder'],research:['researcher'],automation:['builder'],
  design:['designer'],reasoning:['analyst'],general:['analyst']
};
function roleForTask(type='general'){
  return ({coding:'coder',research:'researcher',automation:'builder',design:'designer',reasoning:'analyst',general:'analyst'})[type]||'analyst';
}
const $=id=>document.getElementById(id);
const edges=$('edges'),nodes=$('nodes'),q=$('q'),go=$('go'),mic=$('mic');
const answer=$('answer'),workspace=$('workspace'),listenText=$('listenText');
const followQ=$('followQ'),followGo=$('followGo'),followMic=$('followMic'),thread=$('thread'),canvas=$('canvas'),burstLayer=$('burstLayer');

let busy=false, answered=false, listening=false, active=new Set(), selected=new Set(), completed=new Set(), activeEdges=new Set();
let lastWorker='analyst', lastTool='', recognition=null, currentQuestion='', conversation=[], chatStarted=false, pendingMessage=null, voiceTarget=q;
let lastSuccessfulModel='', lastSuccessfulTaskType='', lastPresentation='default';
let currentPresentation={format:'default',visual:false,explicit:false,label:'STANDARD'};

function classify(t){
  const s=t.toLowerCase();
  if(/\b(code|bug|fix|debug|refactor|python|javascript|typescript|abap|cds|sql|api|program|function)\b/.test(s))return'coding';
  if(/\b(workflow|workflows|automate|automation|schedule|monitor|alert|pipeline|github actions|actions)\b/.test(s))return'automation';
  if(/\b(research|find|discover|latest|source|cite|news|security|privacy|market)\b/.test(s))return'research';
  if(/\b(design|layout|ui|ux|website|visual|style|interface|screen)\b/.test(s))return'design';
  if(/\b(compare|comparison|versus|vs\.?|analyse|analyze|reason|logic|solve|why|trade.?off|decision|calculate|math)\b/.test(s))return'reasoning';
  return'general';
}
function friendlyModel(model=''){
  return model.replace(/^.*\//,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function draw(){
  edges.innerHTML=''; nodes.innerHTML='';
  const links=[['you','planner'],['planner','router'],['router','github'],...SPECIALISTS.map(x=>['router',x]),...SPECIALISTS.map(x=>['github',x]),...SPECIALISTS.map(x=>[x,'reviewer']),['reviewer','you']];
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
        : id==='github'
          ? '<span class="toolMark">⌘</span>'
          : '<span class="agentMark">✦</span>';
    n.innerHTML=`<div class="halo"></div><div class="orbit"></div><div class="energy"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="core">${mark}</div><strong>${INFO[id][0]}</strong><small>${INFO[id][1]}</small>`;
    nodes.appendChild(n);
  });
  render();
}
function updateRoleModel(role,model=''){
  const n=$(`n-${role}`);
  const small=n?.querySelector('small');
  if(small&&model)small.textContent=friendlyModel(model);
}
function setStage(name){
  canvas.dataset.stage=name;
  const order=['understand','route','tool','solve','verify','done'];
  const current=order.indexOf(name);
  document.querySelectorAll('#executionTrace [data-stage]').forEach(el=>{
    const i=order.indexOf(el.dataset.stage);
    el.classList.toggle('current',i===current);
    el.classList.toggle('complete',current>=0&&i<current);
  });
}
function setState(text,kind=''){
  document.querySelector('.state').className=`state ${kind}`.trim();
  $('stateText').textContent=text;
  const processText=$('processText');
  const processRail=$('processRail');
  if(processText)processText.textContent=text;
  if(processRail)processRail.dataset.mode=kind||'ready';
  canvas.dataset.mode=kind||'ready';
  workspace.classList.toggle('working',kind==='busy'||kind==='listening');
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
    n.classList.toggle('completed',completed.has(id));
    if(SPECIALISTS.includes(id))n.classList.toggle('dim',selected.size>0&&!selected.has(id));
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

function cleanPresentationLine(value=''){
  return String(value)
    .replace(/^\s*#{1,6}\s*/,'')
    .replace(/^\s*[-*•]\s+/,'')
    .replace(/^\s*\d+[.)]\s+/,'')
    .replace(/\*\*/g,'')
    .replace(/\`/g,'')
    .trim();
}
function appendStructuredText(container,text=''){
  const lines=String(text).replace(/^\s*\`\`\`[a-z0-9_-]*\s*$/gmi,'').replace(/^\s*\`\`\`\s*$/gmi,'').split(/\r?\n/);
  let list=null;
  const closeList=()=>{list=null;};
  for(const rawLine of lines){
    const line=String(rawLine||'');
    if(!line.trim()){closeList();continue}
    const heading=line.match(/^\s*(#{1,4})\s+(.+)$/);
    if(heading){
      closeList();
      const h=document.createElement(heading[1].length<=1?'h2':'h3');
      h.textContent=cleanPresentationLine(heading[2]);
      container.appendChild(h);
      continue;
    }
    const bullet=line.match(/^\s*[-*•]\s+(.+)$/);
    if(bullet){
      if(!list||list.tagName!=='UL'){list=document.createElement('ul');container.appendChild(list)}
      const li=document.createElement('li');li.textContent=cleanPresentationLine(bullet[1]);list.appendChild(li);continue;
    }
    const numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(numbered){
      if(!list||list.tagName!=='OL'){list=document.createElement('ol');container.appendChild(list)}
      const li=document.createElement('li');li.textContent=cleanPresentationLine(numbered[1]);list.appendChild(li);continue;
    }
    closeList();
    const p=document.createElement('p');p.textContent=cleanPresentationLine(line);container.appendChild(p);
  }
}
function renderHandwrittenPages(body,text=''){
  const rawText=String(text).trim();
  let parts=rawText.split(/(?=^(?:#{1,6}\s*)?(?:\*\*)?\s*WEEK\s+\d+\b)/gmi).map(x=>x.trim()).filter(Boolean);
  if(parts.length<2)parts=[rawText];
  const wrap=document.createElement('div');wrap.className='handwrittenPages';
  parts.forEach((part,index)=>{
    const page=document.createElement('section');page.className='notePage';
    const clip=document.createElement('div');clip.className='paperClip';
    const num=document.createElement('div');num.className='notePageNo';num.textContent=String(index+1).padStart(2,'0');
    const ink=document.createElement('div');ink.className='noteInk';
    appendStructuredText(ink,part);
    page.append(clip,num,ink);wrap.appendChild(page);
  });
  body.appendChild(wrap);
}
function applyPresentation(row,text,presentation){
  if(!row)return;
  const p=presentation&&presentation.format?presentation:{format:'default',label:'STANDARD',visual:false};
  const body=row.querySelector('.messageText');
  const bubble=row.querySelector('.messageBubble');
  if(!body||!bubble)return;
  if(p.format==='default'){body.textContent=text;return}
  row.classList.add('presentationResult');
  bubble.classList.add('presentationBubble','fmt-'+p.format);
  body.classList.add('presentationBody');
  body.textContent='';
  const oldTag=bubble.querySelector('.presentationTag');if(oldTag)oldTag.remove();
  const tag=document.createElement('div');tag.className='presentationTag';tag.textContent='FORMAT · '+String(p.label||p.format).toUpperCase();
  bubble.insertBefore(tag,body);
  if(p.format==='handwritten')renderHandwrittenPages(body,text);
  else appendStructuredText(body,text);
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
  if(el&&(!presentation||presentation.format==='default'))el.textContent=text;
  applyPresentation(pendingMessage,text,presentation);
  scrollThread();
}
function resolvePending(text,meta,presentation=currentPresentation){
  if(!pendingMessage){
    pendingMessage=appendMessage('assistant',text,meta);
    applyPresentation(pendingMessage,text,presentation);
    pendingMessage=null;
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
  currentPresentation={format:'default',visual:false,explicit:false,label:'STANDARD'};
  busy=true; answered=false; selected=new Set(VISUAL_ROUTES[classify(question)]);
  completed=new Set(); lastTool=''; active=new Set(['you']); activeEdges.clear();
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
    completed.add('you'); setStage('understand'); setState('PLANNER · UNDERSTANDING','busy'); updatePending('Planner is understanding your request…'); await travel('you','planner',260); return;
  }

  if(evt.type==='presentation'){
    currentPresentation=evt.presentation||currentPresentation;
    const label=String(currentPresentation.label||currentPresentation.format||'STANDARD').toUpperCase();
    setState('FORMAT · '+label,'busy');
    $('badge').textContent='FORMAT · '+label;
    updatePending('Preparing '+label.toLowerCase()+' presentation…');
    if(currentPresentation.visual){
      lastWorker='designer';
      selected=new Set(['designer']);
      active=new Set(['designer']);
      activeEdges=new Set(['router:designer']);
      render(); kickNode('designer');
    }
    return;
  }
  if(evt.type==='worker'){
    completed.add('planner');
    setStage('route'); setState('ROUTER · SELECTING','busy');
    active=new Set(['router']); activeEdges=new Set(['planner:router']); render(); kickNode('router'); await wait(280);
    completed.add('router');
    setStage('solve'); setState(`ACTIVE · ${friendlyModel(evt.model).toUpperCase()}`,'busy');
    updatePending(`${friendlyModel(evt.model)} is working on the answer…`);
    currentPresentation=evt.presentation||currentPresentation;
    lastWorker=currentPresentation&&currentPresentation.visual?'designer':roleForTask(evt.taskType);
    selected=new Set([lastWorker]);
    updateRoleModel(lastWorker,evt.model);
    active=new Set([lastWorker]); activeEdges=new Set([`router:${lastWorker}`]); render(); kickNode(lastWorker); return;
  }
  if(evt.type==='tool'&&evt.tool==='github'){
    if(evt.status==='complete'){
      const repos=Array.isArray(evt.repos)?evt.repos:[];
      lastTool='github'; completed.add('router'); setStage('tool');
      active=new Set(['github']); activeEdges=new Set(['router:github']); render(); kickNode('github');
      setState('GITHUB · READING REPOS','busy');
      updatePending(`Reading GitHub repository evidence${repos.length?': '+repos.join(', '):'…'}`);
    }else{
      setState('GITHUB · ACCESS NEEDED','busy');
      updatePending('Relay can read public repositories, but this repository needs private read access.');
    }
    return;
  }
  if(evt.type==='hedge'){
    setState('ACCELERATING','busy');
    updatePending(`Relay opened another provider path with ${friendlyModel(evt.model)}…`);
    return;
  }
  if(evt.type==='worker_selected'){
    if(lastTool)completed.add(lastTool);
    updateRoleModel(lastWorker,evt.model);
    active=new Set([lastWorker]);
    activeEdges=new Set([`${lastTool||'router'}:${lastWorker}`]);
    setStage('solve');
    setState(`ACTIVE · ${friendlyModel(evt.model).toUpperCase()}`,'busy');
    updatePending(`${friendlyModel(evt.model)} responded — preparing the answer…`);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='fallback'){
    setState('SWITCHING','busy');
    updatePending(`Switching to ${friendlyModel(evt.model)} for a faster response…`);
    updateRoleModel(lastWorker,evt.model);
    active=new Set([lastWorker]);
    activeEdges=new Set([`${lastTool||'router'}:${lastWorker}`]);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='reviewer'){
    completed.add(lastWorker); setStage('verify'); setState('REVIEWER · VERIFYING','busy');
    updatePending('Independent reviewer is checking the answer…');
    active=new Set(['reviewer']); activeEdges=new Set([`${lastWorker}:reviewer`]); render(); kickNode('reviewer'); return;
  }
  if(evt.type==='fast_path'){
    completed.add(lastWorker); setState('FINALIZING','busy');
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
    currentPresentation=evt.presentation||currentPresentation;
    lastPresentation=String((currentPresentation&&currentPresentation.format)||'default');
    answered=true; busy=false; completed.add(lastWorker); if(evt.review==='PASS')completed.add('reviewer'); setStage('done'); active=new Set(['you']); activeEdges=new Set(evt.review==='PASS'?['reviewer:you']:[]); render(); kickNode('you'); validatedBurst();
    setState('ANSWERED','done');
    const presentationLabel=currentPresentation&&currentPresentation.format&&currentPresentation.format!=='default' ? String(currentPresentation.label||currentPresentation.format).toUpperCase() : '';
    $('badge').textContent=presentationLabel||'VALIDATED';
    $('meta').textContent=String(evt.taskType||'general').toUpperCase()+' · '+friendlyModel(evt.model||'')+(presentationLabel?' · '+presentationLabel:'');
    resolvePending(
      evt.answer||'No answer returned.',
      friendlyModel(evt.model||'AI model')+' · '+(evt.review==='PASS'?'independent review passed':evt.review==='FAST_PATH'?'fast path · reviewer skipped':'review timeout · answer returned'),
      currentPresentation
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
          previousTaskType:lastSuccessfulTaskType,
          previousPresentation:lastPresentation
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
