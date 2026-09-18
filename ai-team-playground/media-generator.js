const $=id=>document.getElementById(id);

const panel=$('mediaGeneratorPanel');
const closeBtn=$('mediaGeneratorClose');
const imageTab=$('mediaImageTab');
const videoTab=$('mediaVideoTab');
const imageBtn=$('imageGenBtn');
const videoBtn=$('videoGenBtn');
const promptEl=$('mediaPrompt');
const videoOptions=$('mediaVideoOptions');
const aspectEl=$('mediaAspect');
const durationEl=$('mediaDuration');
const resolutionEl=$('mediaResolution');
const apiKeyEl=$('mediaApiKey');
const generateBtn=$('mediaGenerateBtn');
const progressEl=$('mediaProgress');
const outputEl=$('mediaOutput');
const downloadEl=$('mediaDownload');

let mode='image';
let currentObjectUrl='';

function sessionKey(){
  return sessionStorage.getItem('relay_gemini_key')||'';
}
function rememberKey(){
  const key=apiKeyEl.value.trim();
  if(key)sessionStorage.setItem('relay_gemini_key',key);
  else sessionStorage.removeItem('relay_gemini_key');
}
function openPanel(nextMode='image',prompt=''){
  setMode(nextMode);
  if(prompt)promptEl.value=prompt;
  const key=sessionKey();
  if(key&&!apiKeyEl.value)apiKeyEl.value=key;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
  setTimeout(()=>promptEl.focus(),80);
}
function closePanel(){
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
}
function setMode(next){
  mode=next==='video'?'video':'image';
  imageTab.classList.toggle('active',mode==='image');
  videoTab.classList.toggle('active',mode==='video');
  videoOptions.hidden=mode!=='video';
  generateBtn.textContent=mode==='video'?'GENERATE VIDEO':'GENERATE IMAGE';
  $('mediaGeneratorTitle').textContent=mode==='video'?'Generate video with Relay':'Generate image with Relay';
  setStatus('Ready');
}
function setStatus(text){progressEl.textContent=text}
function clearOutput(){
  outputEl.innerHTML='';
  downloadEl.hidden=true;
  downloadEl.removeAttribute('href');
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=''}
}
async function postMedia(payload,expectBlob=false){
  const apiKey=apiKeyEl.value.trim()||sessionKey();
  const response=await fetch('/api/media',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...payload,apiKey})
  });
  if(expectBlob){
    if(!response.ok){
      let message='Media download failed';
      try{message=(await response.json())?.error||message}catch{}
      throw new Error(message);
    }
    return response.blob();
  }
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(json?.error||`Media request failed (${response.status})`);
  return json;
}
function humanError(error){
  const message=error instanceof Error?error.message:String(error);
  if(/API key required/i.test(message)){
    return 'Gemini API key required. Paste one below, then Generate again.';
  }
  return message;
}
async function generateImage(){
  setStatus('Nano Banana 2 is creating the image…');
  const json=await postMedia({action:'image',prompt:promptEl.value.trim()});
  const src=`data:${json.mimeType||'image/png'};base64,${json.data}`;
  const img=document.createElement('img');
  img.src=src;
  img.alt='Generated image';
  img.className='generatedImage';
  outputEl.replaceChildren(img);
  downloadEl.href=src;
  downloadEl.download='relay-generated.png';
  downloadEl.textContent='Save image';
  downloadEl.hidden=false;
  setStatus('Image ready');
}
async function generateVideo(){
  setStatus('Starting Veo 3.1 generation…');
  const start=await postMedia({
    action:'video-start',
    prompt:promptEl.value.trim(),
    aspectRatio:aspectEl.value,
    durationSeconds:durationEl.value,
    resolution:resolutionEl.value
  });
  const operation=start.operation;
  if(!operation)throw new Error('Veo did not return a job id.');

  let done=null;
  for(let attempt=1;attempt<=60;attempt++){
    setStatus(`Veo is generating… check ${attempt}`);
    await new Promise(r=>setTimeout(r,10000));
    const status=await postMedia({action:'video-status',operation});
    if(status.done){done=status;break}
  }
  if(!done?.uri)throw new Error('Video generation is still taking too long. Try again shortly.');

  setStatus('Downloading generated video…');
  const blob=await postMedia({action:'video-download',uri:done.uri},true);
  currentObjectUrl=URL.createObjectURL(blob);
  const video=document.createElement('video');
  video.src=currentObjectUrl;
  video.controls=true;
  video.playsInline=true;
  video.className='generatedVideo';
  outputEl.replaceChildren(video);
  downloadEl.href=currentObjectUrl;
  downloadEl.download='relay-generated.mp4';
  downloadEl.textContent='Save video';
  downloadEl.hidden=false;
  setStatus('Video ready');
}
async function generateFromPrompt(type,prompt){
  openPanel(type,prompt);
  setStatus(type==='video'?'Preparing Veo 3.1…':'Preparing image generation…');
  await new Promise(r=>setTimeout(r,80));
  return generate();
}
async function generate(){
  const prompt=promptEl.value.trim();
  if(!prompt){setStatus('Describe what you want to create');promptEl.focus();return false}
  clearOutput();
  rememberKey();
  generateBtn.disabled=true;
  try{
    if(mode==='video')await generateVideo();
    else await generateImage();
    return true;
  }catch(error){
    setStatus(humanError(error));
    return false;
  }finally{
    generateBtn.disabled=false;
  }
}

imageBtn?.addEventListener('click',()=>openPanel('image'));
videoBtn?.addEventListener('click',()=>openPanel('video'));
imageTab?.addEventListener('click',()=>setMode('image'));
videoTab?.addEventListener('click',()=>setMode('video'));
closeBtn?.addEventListener('click',closePanel);
panel?.addEventListener('click',e=>{if(e.target===panel)closePanel()});
generateBtn?.addEventListener('click',generate);
apiKeyEl?.addEventListener('change',rememberKey);

window.RelayMediaGenerator={
  open:openPanel,
  openFromPrompt(type,prompt){openPanel(type,prompt)},
  generateFromPrompt
};
