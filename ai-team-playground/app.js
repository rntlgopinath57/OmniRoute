const POS={
  // Full execution graph used only by View run.
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
const followQ=$('followQ'),followGo=$('followGo'),followMic=$('followMic'),thread=$('thread'),canvas=$('canvas'),burstLayer=$('burstLayer'),followup=document.querySelector('.followup'),toolDockEl=$('toolDock');
const runStrip=$('runStrip'),runStripText=$('runStripText'),runToggle=$('runToggle'),activityLane=$('activityLane'),handoffFx=$('handoffFx'),mobileRunLane=$('mobileRunLane');

let busy=false, answered=false, listening=false, active=new Set(), selected=new Set(), completed=new Set(), activeEdges=new Set(), completedEdges=new Set();
let lastWorker='analyst', lastTool='', recognition=null, currentQuestion='', conversation=[], chatStarted=false, pendingMessage=null, voiceTarget=q;
let lastSuccessfulModel='', lastSuccessfulTaskType='', lastPresentation='default';
let ambientLastNode='you';
let activeProviderNode='';
let completedProviders=new Set();
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
function providerNodeForModel(model=''){
  const m=String(model||'').toLowerCase();
  if(m.startsWith('groq:'))return'groq';
  if(m.startsWith('@cf/'))return'cloudflare';
  if(m.includes('gemini')||m.includes('google'))return'gemini';
  if(m.includes('claude')||m.includes('anthropic'))return'claude';
  if(m.includes('deepseek'))return'deepseek';
  if(m.includes('qwen')||m.includes('alibaba'))return'qwen';
  if(m.includes('grok')||m.includes('xai'))return'grok';
  if(m.includes('gpt')||m.includes('openai'))return'openai';
  return'';
}
function setActiveProvider(model=''){
  const next=providerNodeForModel(model);
  if(activeProviderNode&&activeProviderNode!==next)completedProviders.add(activeProviderNode);
  activeProviderNode=next;
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

  const ambient=document.querySelector(`[data-ambient-node="${role}"] small`);
  if(ambient&&model)ambient.textContent=friendlyModel(model);

  const provider=providerNodeForModel(model);
  const providerSmall=provider?document.querySelector(`[data-provider-node="${provider}"] small`):null;
  if(providerSmall&&model)providerSmall.textContent=friendlyModel(model);
}
function setStage(name){
  canvas.dataset.stage=name;
  const order=['understand','route','tool','solve','render','verify','done'];
  const current=order.indexOf(name);
  document.querySelectorAll('#executionTrace [data-stage]').forEach(el=>{
    const i=order.indexOf(el.dataset.stage);
    el.classList.toggle('current',i===current);
    el.classList.toggle('complete',current>=0&&i<current);
  });

  if(activityLane){
    const laneOrder=['start','understand','route','tool','solve','verify','done'];
    const laneStage=name==='render'?'solve':name;
    const laneIndex=laneOrder.indexOf(laneStage);
    activityLane.dataset.stage=laneStage||'ready';
    activityLane.style.setProperty('--lane-progress',laneIndex<0?'0':String((laneIndex/(laneOrder.length-1))*100));
    activityLane.querySelectorAll('.activityNode').forEach(node=>{
      const i=laneOrder.indexOf(node.dataset.laneStage);
      node.classList.toggle('active',i===laneIndex);
      node.classList.toggle('completed',i>=0&&laneIndex>=0&&i<laneIndex);
    });
    const specialist=activityLane.querySelector('[data-lane-stage="solve"] small');
    if(specialist)specialist.textContent=name==='render'?'DESIGNER':'SPECIALIST';
    if(name==='done'){
      const finalNode=activityLane.querySelector('[data-lane-stage="done"]');
      finalNode?.classList.add('arrival');
      setTimeout(()=>finalNode?.classList.remove('arrival'),1500);
    }
  }
}
function setState(text,kind=''){
  document.querySelector('.state').className=`state ${kind}`.trim();
  $('stateText').textContent=text;
  const processText=$('processText');
  const processRail=$('processRail');
  if(processText)processText.textContent=text;
  if(processRail)processRail.dataset.mode=kind||'ready';
  if(runStripText)runStripText.textContent=text;
  if(runStrip)runStrip.dataset.mode=kind||'ready';
  if(activityLane)activityLane.dataset.mode=kind||'ready';
  canvas.dataset.mode=kind||'ready';
  workspace.classList.toggle('working',kind==='busy'||kind==='listening');
}
function setMobileRunStage(stage,label=''){
  if(!mobileRunLane)return;
  mobileRunLane.querySelectorAll('[data-mobile-stage]').forEach(el=>{
    el.classList.toggle('active',el.dataset.mobileStage===stage);
    if(stage==='model'&&el.dataset.mobileStage==='model'&&label)el.textContent=label.toUpperCase().slice(0,10);
  });
}
function setFlowEdge(edge){
  for(const existing of activeEdges) completedEdges.add(existing);
  activeEdges=new Set(edge?[edge]:[]);
}
function render(){
  document.querySelectorAll('.edge').forEach(e=>{
    e.classList.toggle('on',activeEdges.has(e.dataset.e));
    e.classList.toggle('complete',completedEdges.has(e.dataset.e));
  });
  document.querySelectorAll('.edgeFlow').forEach(e=>e.classList.toggle('on',activeEdges.has(e.dataset.e)));
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

  document.querySelectorAll('[data-ambient-node]').forEach(node=>{
    const id=node.dataset.ambientNode;
    const isActive=active.has(id);
    const isComplete=completed.has(id)||(answered&&id==='you');
    const isEnergized=busy&&selected.has(id);
    node.classList.toggle('active',isActive);
    node.classList.toggle('completed',isComplete);
    node.classList.toggle('energized',isEnergized);
    node.classList.toggle('listening',listening&&id==='you');
  });

  document.querySelectorAll('[data-provider-node]').forEach(node=>{
    const id=node.dataset.providerNode;
    node.classList.toggle('active',busy&&id===activeProviderNode);
    node.classList.toggle('completed',completedProviders.has(id));
    node.classList.toggle('energized',busy&&id===activeProviderNode);
  });

  const logicalAmbient=[...active].find(id=>document.querySelector(`[data-ambient-node="${id}"]`));
  const ambientActive=(busy&&activeProviderNode)||logicalAmbient;
  if(ambientActive && ambientActive!==ambientLastNode && (busy||answered)){
    animateAmbientFlight(ambientLastNode,ambientActive);
    ambientLastNode=ambientActive;
  }
}
function animateAmbientFlight(fromId,toId){
  if(!handoffFx||!workspace||!fromId||!toId||fromId===toId)return;

  const sourceNode=document.querySelector(`[data-ambient-node="${fromId}"],[data-provider-node="${fromId}"]`);
  const destinationNode=document.querySelector(`[data-ambient-node="${toId}"],[data-provider-node="${toId}"]`);
  const from=sourceNode?.querySelector('.railCore');
  const to=destinationNode?.querySelector('.railCore');
  if(!from||!to)return;

  // Only real handoffs animate: source = sending, destination = receiving.
  document.querySelectorAll('.railNode.sending,.railNode.receiving').forEach(node=>{
    node.classList.remove('sending','receiving');
  });
  sourceNode.classList.add('sending');
  destinationNode.classList.add('receiving');

  const wr=workspace.getBoundingClientRect();
  const a=from.getBoundingClientRect();
  const b=to.getBoundingClientRect();
  const x1=a.left+a.width/2-wr.left;
  const y1=a.top+a.height/2-wr.top;
  const x2=b.left+b.width/2-wr.left;
  const y2=b.top+b.height/2-wr.top;
  const dx=x2-x1,dy=y2-y1;
  const distance=Math.hypot(dx,dy);
  const angle=Math.atan2(dy,dx)*180/Math.PI;

  const flight=document.createElement('div');
  flight.className='ambientFlight';
  flight.dataset.from=fromId;
  flight.dataset.to=toId;
  flight.style.left=x1+'px';
  flight.style.top=y1+'px';
  flight.style.width=Math.max(24,distance)+'px';
  flight.style.transform=`rotate(${angle}deg)`;
  flight.innerHTML='<span class="flightLine"></span><i class="flightPacket"></i><b class="flightTail"></b>';
  handoffFx.appendChild(flight);

  setTimeout(()=>{
    sourceNode.classList.remove('sending');
    destinationNode.classList.remove('receiving');
  },780);
  setTimeout(()=>flight.remove(),900);
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
  active=new Set([b]); setFlowEdge(`${a}:${b}`); render(); kickNode(b); await wait(ms);
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
  const isTableRow=line=>/^\s*\|.*\|\s*$/.test(line);
  const isDivider=line=>/^\s*\|?\s*:?-{3,}/.test(String(line||'').replace(/^\s*\|/,''));
  const cells=line=>String(line).trim().replace(/^\||\|$/g,'').split('|').map(x=>cleanPresentationLine(x));
  for(let i=0;i<lines.length;){
    const line=String(lines[i]||'');
    if(isTableRow(line)&&i+1<lines.length&&isDivider(lines[i+1])){
      closeList();
      const tableWrap=document.createElement('div');tableWrap.className='artifactTableWrap';
      const table=document.createElement('table');
      const thead=document.createElement('thead');const hr=document.createElement('tr');
      cells(line).forEach(value=>{const th=document.createElement('th');th.textContent=value;hr.appendChild(th)});
      thead.appendChild(hr);table.appendChild(thead);
      const tbody=document.createElement('tbody');i+=2;
      while(i<lines.length&&isTableRow(lines[i])){
        const tr=document.createElement('tr');
        cells(lines[i]).forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.appendChild(td)});
        tbody.appendChild(tr);i++;
      }
      table.appendChild(tbody);tableWrap.appendChild(table);container.appendChild(tableWrap);
      continue;
    }
    if(!line.trim()){closeList();i++;continue}
    const heading=line.match(/^\s*(#{1,4})\s+(.+)$/);
    if(heading){
      closeList();
      const h=document.createElement(heading[1].length<=1?'h2':'h3');
      h.textContent=cleanPresentationLine(heading[2]);
      container.appendChild(h);i++;continue;
    }
    const bullet=line.match(/^\s*[-*•]\s+(.+)$/);
    if(bullet){
      if(!list||list.tagName!=='UL'){list=document.createElement('ul');container.appendChild(list)}
      const li=document.createElement('li');li.textContent=cleanPresentationLine(bullet[1]);list.appendChild(li);i++;continue;
    }
    const numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(numbered){
      if(!list||list.tagName!=='OL'){list=document.createElement('ol');container.appendChild(list)}
      const li=document.createElement('li');li.textContent=cleanPresentationLine(numbered[1]);list.appendChild(li);i++;continue;
    }
    closeList();
    const p=document.createElement('p');p.textContent=cleanPresentationLine(line);container.appendChild(p);i++;
  }
}
function renderHandwrittenPages(body,text=''){
  const rawText=String(text).trim();
  let parts=rawText.split(/(?=^(?:#{1,6}\s*)?(?:\*\*)?\s*WEEK\s+\d+\b)/gmi).map(x=>x.trim()).filter(Boolean);
  let intro='';
  if(parts.length>1 && !/^(?:#{1,6}\s*)?(?:\*\*)?\s*WEEK\s+\d+\b/i.test(parts[0])){
    intro=parts.shift()||'';
  }
  if(!parts.length)parts=[intro||rawText];

  const deck=document.createElement('div');deck.className='handwrittenDeck';

  if(intro){
    const introEl=document.createElement('div');
    introEl.className='handwrittenIntro';
    appendStructuredText(introEl,intro);
    deck.appendChild(introEl);
  }

  const nav=document.createElement('div');nav.className='noteDeckNav';
  const prev=document.createElement('button');prev.type='button';prev.className='noteNavBtn';prev.textContent='‹';
  const counter=document.createElement('div');counter.className='noteDeckCounter';
  const next=document.createElement('button');next.type='button';next.className='noteNavBtn';next.textContent='›';
  nav.append(prev,counter,next);

  const tabs=document.createElement('div');tabs.className='noteWeekTabs';
  const viewport=document.createElement('div');viewport.className='noteDeckViewport';
  const wrap=document.createElement('div');wrap.className='handwrittenPages';
  viewport.appendChild(wrap);

  const pages=[];
  parts.forEach((part,index)=>{
    const page=document.createElement('section');page.className='notePage';page.dataset.page=String(index);
    const clip=document.createElement('div');clip.className='paperClip';
    const num=document.createElement('div');num.className='notePageNo';num.textContent=String(index+1).padStart(2,'0');
    const ink=document.createElement('div');ink.className='noteInk';
    appendStructuredText(ink,part);
    page.append(clip,num,ink);wrap.appendChild(page);pages.push(page);

    const tab=document.createElement('button');
    tab.type='button';tab.className='noteWeekTab';tab.textContent=parts.length>1?'W'+(index+1):'NOTE';
    tab.dataset.page=String(index);tabs.appendChild(tab);
  });

  let current=0;
  const show=index=>{
    current=Math.max(0,Math.min(index,pages.length-1));
    pages.forEach((page,i)=>page.classList.toggle('active',i===current));
    [...tabs.children].forEach((tab,i)=>tab.classList.toggle('active',i===current));
    counter.textContent=parts.length>1?'Week '+(current+1)+' of '+pages.length:'Note';
    prev.disabled=current===0;next.disabled=current===pages.length-1;
    const ink=pages[current]?.querySelector('.noteInk');
    if(ink)ink.scrollTop=0;
  };
  prev.addEventListener('click',()=>show(current-1));
  next.addEventListener('click',()=>show(current+1));
  tabs.addEventListener('click',event=>{
    const target=event.target.closest('.noteWeekTab');
    if(target)show(Number(target.dataset.page||0));
  });
  deck.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();show(current-1)}
    if(event.key==='ArrowRight'){event.preventDefault();show(current+1)}
  });
  deck.tabIndex=0;
  deck.append(nav,tabs,viewport);
  body.appendChild(deck);
  show(0);
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
  bubble.querySelectorAll('.presentationTag,.presentationViewActions').forEach(el=>el.remove());

  const header=document.createElement('div');header.className='presentationHeader';
  const tag=document.createElement('div');tag.className='presentationTag';tag.textContent='FORMAT · '+String(p.label||p.format).toUpperCase();
  const actions=document.createElement('div');actions.className='presentationViewActions';
  const expand=document.createElement('button');expand.type='button';expand.className='presentationExpand';expand.textContent='EXPAND';
  expand.addEventListener('click',()=>{
    const expanded=bubble.classList.toggle('presentationExpanded');
    expand.textContent=expanded?'COMPACT':'EXPAND';
    if(expanded)body.scrollTop=0;
  });
  actions.appendChild(expand);header.append(tag,actions);
  bubble.insertBefore(header,body);

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
  if(el)el.textContent=text;
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
  const dots=pendingMessage.querySelector('.thinkingDots');
  if(dots)dots.remove();
  applyPresentation(pendingMessage,text,presentation);
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
  setMobileRunStage('you');
  workspace.classList.remove('show-run');
  if(runToggle){
    runToggle.setAttribute('aria-expanded','false');
    runToggle.textContent='View run';
  }
  activeProviderNode='';
  completedProviders=new Set();
  ambientLastNode='you';
  currentQuestion=question;
  currentPresentation={format:'default',visual:false,explicit:false,label:'STANDARD'};
  busy=true; answered=false; selected=new Set(VISUAL_ROUTES[classify(question)]);
  completed=new Set(); completedEdges=new Set(); lastTool=''; active=new Set(['you']); activeEdges.clear();
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
  answered=false; busy=false; for(const edge of activeEdges)completedEdges.add(edge); active=new Set(['you']); activeEdges.clear(); setState('ATTENTION','error'); render();
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
    setMobileRunStage('planner');
    completed.add('you'); setStage('understand'); setState('PLANNER · UNDERSTANDING','busy'); updatePending('Planner is understanding your request…'); await travel('you','planner',420); return;
  }

  if(evt.type==='presentation'){
    currentPresentation=evt.presentation||currentPresentation;
    const label=String(currentPresentation.label||currentPresentation.format||'STANDARD').toUpperCase();
    setState('FORMAT · '+label,'busy');
    $('badge').textContent='FORMAT · '+label;
    updatePending('Presentation format locked: '+label.toLowerCase()+'…');
    return;
  }
  if(evt.type==='worker'){
    setMobileRunStage('router');
    completed.add('planner');
    setStage('route'); setState('ROUTER · SELECTING','busy');
    active=new Set(['router']); setFlowEdge('planner:router'); render(); kickNode('router'); await wait(280);
    completed.add('router');

    currentPresentation=evt.presentation||currentPresentation;
    lastWorker=roleForTask(evt.taskType);
    selected=new Set([lastWorker]);
    updateRoleModel(lastWorker,evt.model);

    // Preserve the real visual handoff: router -> specialist -> provider.
    activeProviderNode='';
    setStage('solve');
    setState(`${INFO[lastWorker]?.[0]||'SPECIALIST'} · ACTIVATED`,'busy');
    updatePending(`${INFO[lastWorker]?.[0]||'Specialist'} selected for this task…`);
    active=new Set([lastWorker]);
    setFlowEdge(`router:${lastWorker}`);
    render(); kickNode(lastWorker);
    await wait(220);

    setActiveProvider(evt.model);
    setMobileRunStage('model',friendlyModel(evt.model));
    setState(`ACTIVE · ${friendlyModel(evt.model).toUpperCase()}`,'busy');
    updatePending(`${friendlyModel(evt.model)} is working on the answer…`);
    render();
    return;
  }
  if(evt.type==='tool'&&evt.tool==='github'){
    if(evt.status==='complete'){
      const repos=Array.isArray(evt.repos)?evt.repos:[];
      lastTool='github'; completed.add('router'); setStage('tool');
      active=new Set(['github']); setFlowEdge('router:github'); render(); kickNode('github');
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
  if(evt.type==='progress'){
    const seconds=Math.max(1,Math.round(Number(evt.elapsedMs||0)/1000));
    const role=INFO[lastWorker]?.[0]||'SPECIALIST';
    setState(role+' · WORKING '+seconds+'s','busy');
    updatePending(role.charAt(0)+role.slice(1).toLowerCase()+' is drafting the response… '+seconds+'s');
    return;
  }
  if(evt.type==='worker_selected'){
    if(lastTool)completed.add(lastTool);
    updateRoleModel(lastWorker,evt.model);
    active=new Set([lastWorker]);
    setFlowEdge(`${lastTool||'router'}:${lastWorker}`);
    setStage('solve');
    setState(`ACTIVE · ${friendlyModel(evt.model).toUpperCase()}`,'busy');
    updatePending(`${friendlyModel(evt.model)} responded — preparing the answer…`);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='fallback'){
    setState('SWITCHING','busy');
    updatePending(`Switching to ${friendlyModel(evt.model)} on another provider pool…`);
    updateRoleModel(lastWorker,evt.model);
    setActiveProvider(evt.model);
    active=new Set([lastWorker]);
    setFlowEdge(`${lastTool||'router'}:${lastWorker}`);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='emergency_fallback'){
    setState('EMERGENCY SWITCH','busy');
    updatePending(`Primary pools are limited — using ${friendlyModel(evt.model)} as the emergency lane…`);
    updateRoleModel(lastWorker,evt.model);
    setActiveProvider(evt.model);
    active=new Set([lastWorker]);
    setFlowEdge(`${lastTool||'router'}:${lastWorker}`);
    render(); kickNode(lastWorker); return;
  }
  if(evt.type==='quota'){
    const provider=String(evt.provider||'provider');
    const node=document.querySelector(`[data-provider-node="${provider}"]`);
    node?.classList.add('limited');
    const small=node?.querySelector('small');
    if(small)small.textContent=evt.status==='rate_limited'?'LIMITED · RATE LIMIT':'LIMITED · QUOTA';
    setState(`${provider.toUpperCase()} · LIMITED`,'busy');
    updatePending('Provider limit reached — Relay stopped repeated attempts to protect the remaining quota.');
    return;
  }
  if(evt.type==='render'){
    const source=lastWorker;
    completed.add(source);
    lastWorker='designer';
    selected=new Set(['designer']);
    updateRoleModel('designer','Local renderer');
    setStage('render');
    setState('DESIGNER · RENDERING','busy');
    updatePending('Designer is rendering the '+String(currentPresentation?.label||'visual').toLowerCase()+' output…');
    active=new Set(['designer']);
    setFlowEdge(source+':designer');
    render(); kickNode('designer');
    await wait(260);
    return;
  }
  if(evt.type==='reviewer'){
    setMobileRunStage('reviewer');
    if(activeProviderNode)completedProviders.add(activeProviderNode);
    activeProviderNode='';
    completed.add(lastWorker);
    setStage('verify');
    setState('REVIEWER · VERIFYING','busy');
    updatePending('Independent reviewer is checking the answer…');
    active=new Set(['reviewer']);
    setFlowEdge(`${lastWorker}:reviewer`);
    updateRoleModel('reviewer',evt.model);
    render(); kickNode('reviewer');
    await wait(220);

    // Then show the independent review provider as a second real handoff.
    setActiveProvider(evt.model);
    setState(`REVIEW · ${friendlyModel(evt.model).toUpperCase()}`,'busy');
    render();
    return;
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
    if(activeProviderNode)completedProviders.add(activeProviderNode);
    activeProviderNode='';
    clearFailedAttempt(currentQuestion);
    lastSuccessfulModel=String(evt.model||'');
    lastSuccessfulTaskType=String(evt.taskType||'');
    currentPresentation=evt.presentation||currentPresentation;
    lastPresentation=String((currentPresentation&&currentPresentation.format)||'default');
    answered=true; busy=false; completed.add(lastWorker); if(evt.review==='PASS')completed.add('reviewer'); setStage('done'); active=new Set(['you']); setFlowEdge(evt.review==='PASS'?'reviewer:you':''); render(); kickNode('you'); validatedBurst();
    setState(`DONE · ${completed.size} STEPS`,'done');
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
  return /\b(video|vedio|vidio|vdeo|clip|footage)\b/.test(s) && /\b(edit|trim|cut|crop|resize|reframe|mute|remove audio|aspect|convert)\b/.test(s);
}
function mediaIntentType(text=''){
  const s=text.toLowerCase();
  const create=/\b(generate|create|make|render|produce|build|show me|give me)\b/.test(s);
  const video=/\b(video|vedio|vidio|vdeo|clip|animation|reel|movie)\b/.test(s);
  const image=/\b(image|img|picture|pic|photo|poster|art|logo|illustration)\b/.test(s);
  if(create&&video)return 'video';
  if(create&&image)return 'image';
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
  if(mediaType&&window.RelayMediaGenerator?.generateFromPrompt){
    if(!chatStarted){chatStarted=true;openAnswer(true)}
    appendMessage('user',question);
    const mediaRow=appendMessage('assistant',mediaType==='video'
      ? 'Generating your video with Veo 3.1 now…'
      : 'Generating your image now…');
    $('badge').textContent='MEDIA TOOL';
    $('meta').textContent=mediaType==='video'?'VEO 3.1':'NANO BANANA 2';
    busy=true;
    selected=new Set(['designer']);
    active=new Set(['designer']);
    completed.add('planner'); completed.add('router');
    setFlowEdge('router:designer');
    setStage('render');
    setState(mediaType==='video'?'DESIGNER · GENERATING VIDEO':'DESIGNER · GENERATING IMAGE','busy');
    q.value=''; resizeInput();
    followQ.value=''; resizeFollow();
    render();
    try{
      const mediaOk=await window.RelayMediaGenerator.generateFromPrompt(mediaType,question);
      if(!mediaOk)throw new Error('Media generation needs attention. Check the media panel for the exact provider or API-key message.');
      completed.add('designer');
      active=new Set(['you']);
      setFlowEdge('designer:reviewer');
      completed.add('reviewer');
      setFlowEdge('reviewer:you');
      mediaRow.querySelector('.messageText').textContent=mediaType==='video'
        ? 'Video generation completed. The result is ready in the media panel.'
        : 'Image generation completed. The result is ready in the media panel.';
      $('badge').textContent='READY';
      setStage('done');
      setState('ANSWERED','done');
    }catch(error){
      mediaRow.classList.add('failed');
      mediaRow.querySelector('.messageText').textContent=error?.message||'Media generation failed.';
      setState('MEDIA · ATTENTION','error');
    }finally{
      busy=false;render();
    }
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
    const requestTimeout=setTimeout(()=>requestController.abort(),55000);
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
      ? 'Relay could not complete this request within 55 seconds. Please retry once; the next healthy provider will be used.'
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
async function initProviderRoster(){
  try{
    const response=await fetch('/api/health',{headers:{Accept:'application/json'}});
    if(!response.ok)return;
    const health=await response.json();
    const providers=health?.providers||{};
    const models=health?.models||{};
    const limits=health?.limits||{};
    const openrouterLimit=limits?.openrouter||{};
    const state={
      gemini:Boolean(models.gemini ?? providers.gemini),
      openai:Boolean(models.openai ?? providers.openai),
      claude:Boolean(models.claude ?? providers.anthropic),
      deepseek:Boolean(models.deepseek ?? providers.openrouter),
      qwen:Boolean(models.qwen ?? providers.openrouter),
      groq:Boolean(models.groq ?? providers.groq),
      cloudflare:Boolean(models.cloudflare ?? providers.cloudflare),
      grok:Boolean(models.grok ?? false)
    };
    document.querySelectorAll('[data-provider-node]').forEach(node=>{
      const id=node.dataset.providerNode;
      const enabled=Boolean(state[id]);
      node.classList.toggle('available',enabled);
      node.classList.toggle('offline',!enabled);
      const small=node.querySelector('small');
      if(!small)return;
      if(enabled){
        if(id==='gemini')small.textContent='READY · Gemini pool';
        else if(id==='openai')small.textContent='READY · OpenAI';
        else if(id==='claude')small.textContent='READY · Anthropic';
        else if(id==='groq')small.textContent='READY · 1K REQUESTS/DAY';
        else if(id==='cloudflare')small.textContent='READY · 10K NEURONS/DAY';
        else if(openrouterLimit?.freeTier)small.textContent='READY · FREE · 50/DAY SHARED';
        else small.textContent='READY · OpenRouter';
      }else{
        if(id==='groq')small.textContent='STANDBY · ADD GROQ KEY';
        else small.textContent=(id==='deepseek'||id==='qwen'||id==='grok')?'STANDBY · OpenRouter':'STANDBY';
      }
    });
  }catch{}
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
if(runToggle){
  runToggle.addEventListener('click',()=>{
    const open=workspace.classList.toggle('show-run');
    runToggle.setAttribute('aria-expanded',String(open));
    runToggle.textContent=open?'Hide run':'View run';
  });
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

function mountViewportComposer(){
  if(toolDockEl && toolDockEl.parentElement!==workspace){
    workspace.appendChild(toolDockEl);
    toolDockEl.classList.add('viewportToolDock');
  }
  if(followup && followup.parentElement!==workspace){
    workspace.appendChild(followup);
    followup.classList.add('viewportComposer');
  }
}
function verifyComposerInViewport(){
  if(!followup)return;
  const rect=followup.getBoundingClientRect();
  const ok=rect.width>160 && rect.height>40 && rect.top>=0 && rect.bottom<=window.innerHeight;
  if(!ok){
    followup.style.setProperty('position','fixed','important');
    followup.style.setProperty('left','50vw','important');
    followup.style.setProperty('right','auto','important');
    followup.style.setProperty('bottom',window.innerWidth>=1200?'14px':'10px','important');
    followup.style.setProperty('transform','translateX(-50%)','important');
    followup.style.setProperty('width',window.innerWidth>=1200?'min(900px, calc(100vw - 420px))':'calc(100vw - 24px)','important');
    followup.style.setProperty('display','flex','important');
    followup.style.setProperty('visibility','visible','important');
    followup.style.setProperty('opacity','1','important');
    followup.style.setProperty('z-index','120','important');
  }
}
workspace.classList.remove('show-run','working');
if(runToggle){
  runToggle.setAttribute('aria-expanded','false');
  runToggle.textContent='View run';
}
mountViewportComposer();
draw(); initVoice(); initProviderRoster(); setStage('understand'); setState('READY'); resizeInput(); resizeFollow();
requestAnimationFrame(verifyComposerInViewport);
window.addEventListener('resize',verifyComposerInViewport);
