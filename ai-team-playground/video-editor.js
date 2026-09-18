const $=id=>document.getElementById(id);

let ffmpeg=null;
let loaded=false;
let selectedFile=null;
let outputUrl='';

const panel=$('videoEditorPanel');
const openBtn=$('videoEditBtn');
const closeBtn=$('videoEditorClose');
const fileInput=$('videoFileInput');
const fileName=$('videoFileName');
const startInput=$('videoStart');
const durationInput=$('videoDuration');
const aspectInput=$('videoAspect');
const muteInput=$('videoMute');
const processBtn=$('videoProcessBtn');
const progressText=$('videoProgress');
const download=$('videoDownload');
const preview=$('videoPreview');

function openPanel(){
  panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
}
function closePanel(){
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
}
function setProgress(text){
  progressText.textContent=text;
}
function resetOutput(){
  if(outputUrl)URL.revokeObjectURL(outputUrl);
  outputUrl='';
  download.hidden=true;
  preview.hidden=true;
  preview.removeAttribute('src');
}
async function ensureFFmpeg(){
  if(loaded)return ffmpeg;
  setProgress('Loading video engine…');
  processBtn.disabled=true;
  const [{FFmpeg},{fetchFile,toBlobURL}]=await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js'),
    import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js')
  ]);
  const instance=new FFmpeg();
  const wrapper='https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm';
  const core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
  instance.on('progress',({progress})=>{
    if(Number.isFinite(progress)){
      setProgress(`Processing… ${Math.max(0,Math.min(100,Math.round(progress*100)))}%`);
    }
  });
  await instance.load({
    classWorkerURL:await toBlobURL(`${wrapper}/worker.js`,'text/javascript'),
    coreURL:await toBlobURL(`${core}/ffmpeg-core.js`,'text/javascript'),
    wasmURL:await toBlobURL(`${core}/ffmpeg-core.wasm`,'application/wasm')
  });
  instance._relayFetchFile=fetchFile;
  ffmpeg=instance;
  loaded=true;
  processBtn.disabled=false;
  setProgress('Engine ready');
  return ffmpeg;
}
function aspectFilter(aspect){
  if(aspect==='9:16')return 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960';
  if(aspect==='16:9')return 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540';
  if(aspect==='1:1')return 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720';
  return '';
}
async function processVideo(){
  if(!selectedFile){
    setProgress('Choose a video first');
    fileInput.click();
    return;
  }
  resetOutput();
  processBtn.disabled=true;
  try{
    const engine=await ensureFFmpeg();
    processBtn.disabled=true;
    const ext=(selectedFile.name.split('.').pop()||'mp4').replace(/[^a-z0-9]/gi,'').toLowerCase()||'mp4';
    const inputName=`relay-input.${ext}`;
    const outputName='relay-edited.mp4';
    setProgress('Preparing video…');
    await engine.writeFile(inputName,await engine._relayFetchFile(selectedFile));

    const args=[];
    const start=Math.max(0,Number(startInput.value)||0);
    const duration=Math.max(0,Number(durationInput.value)||0);
    if(start>0)args.push('-ss',String(start));
    args.push('-i',inputName);
    if(duration>0)args.push('-t',String(duration));

    const filter=aspectFilter(aspectInput.value);
    if(filter)args.push('-vf',filter);

    args.push('-c:v','libx264','-preset','ultrafast','-crf','24');
    if(muteInput.checked){
      args.push('-an');
    }else{
      args.push('-c:a','aac','-b:a','128k');
    }
    args.push('-movflags','+faststart','-y',outputName);

    setProgress('Processing…');
    await engine.exec(args);
    const data=await engine.readFile(outputName);
    const blob=new Blob([data.buffer],{type:'video/mp4'});
    outputUrl=URL.createObjectURL(blob);

    preview.src=outputUrl;
    preview.hidden=false;
    download.href=outputUrl;
    download.download='relay-edited.mp4';
    download.hidden=false;
    setProgress('Done — preview or save the edited video');
    try{await engine.deleteFile(inputName)}catch{}
    try{await engine.deleteFile(outputName)}catch{}
  }catch(error){
    console.error(error);
    setProgress('Video processing failed in this browser');
  }finally{
    processBtn.disabled=false;
  }
}

openBtn?.addEventListener('click',openPanel);
closeBtn?.addEventListener('click',closePanel);
panel?.addEventListener('click',e=>{if(e.target===panel)closePanel()});
fileInput?.addEventListener('change',()=>{
  selectedFile=fileInput.files?.[0]||null;
  resetOutput();
  if(selectedFile){
    fileName.textContent=`${selectedFile.name} · ${(selectedFile.size/1024/1024).toFixed(1)} MB`;
    setProgress('Ready to edit');
  }
});
processBtn?.addEventListener('click',processVideo);

window.RelayVideoEditor={
  openFromPrompt(){
    openPanel();
    if(!selectedFile)setTimeout(()=>fileInput?.click(),120);
  },
  open:openPanel
};
