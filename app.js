const modelSel = document.getElementById('modelSel');
const panels = {
  "black-forest-labs/FLUX.1-dev": document.getElementById("panelFluxTxt"),
  "black-forest-labs/FLUX.1-Kontext-dev": document.getElementById("panelFluxImg2Img"),
  "alibaba-research/Wan2.1-I2V-A14B": document.getElementById("panelWanI2V")
};

function switchPanel(){
  const val = modelSel.value;
  Object.values(panels).forEach(p=>p.style.display="none");
  if(panels[val]) panels[val].style.display="block";
}
modelSel.addEventListener("change",switchPanel);
switchPanel();

// ========= API Key localStorage =========
const apiKeyEl = document.getElementById("apiKey");
const rememberKey = document.getElementById("rememberKey");
const btnClearKey = document.getElementById("btnClearKey");
const statusBadge = document.getElementById("statusBadge");
const outputDiv = document.getElementById("output");

if(localStorage.getItem("apiKey")){
  apiKeyEl.value = localStorage.getItem("apiKey");
  rememberKey.checked=true;
}
rememberKey.onchange=()=>{
  if(rememberKey.checked) localStorage.setItem("apiKey",apiKeyEl.value);
  else localStorage.removeItem("apiKey");
}
btnClearKey.onclick=()=>{
  apiKeyEl.value="";
  localStorage.removeItem("apiKey");
}
apiKeyEl.oninput=()=>{
  if(rememberKey.checked) localStorage.setItem("apiKey",apiKeyEl.value);
}

// ========= 分辨率下拉 =========
const fluxTxtResSel = document.getElementById("fluxTxtRes");
const fluxImg2ImgResSel = document.getElementById("fluxImg2ImgRes");
const wanResSel = document.getElementById("wanResSel");
const resOptions = [
  {w:896,h:1152,name:"896×1152 竖版人像"},
  {w:1152,h:896,name:"1152×896 横版"},
  {w:1024,h:1024,name:"1024×1024 正方形"}
];
resOptions.forEach(opt=>{
  const o1 = new Option(opt.name, JSON.stringify({w:opt.w,h:opt.h}));
  const o2 = new Option(opt.name, JSON.stringify({w:opt.w,h:opt.h}));
  fluxTxtResSel.appendChild(o1);
  fluxImg2ImgResSel.appendChild(o2);
})
resOptions.forEach(opt=>{
  const o = new Option(opt.name,JSON.stringify({w:opt.w,h:opt.h}));
  wanResSel.appendChild(o);
})
wanResSel.onchange = function(){
  const val = JSON.parse(this.value);
  document.getElementById("wanW").value = val.w;
  document.getElementById("wanH").value = val.h;
}

// 清空输出
document.getElementById("btnClearOutput").onclick = ()=>{
  outputDiv.innerHTML = "";
}

// 文件转base64
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })
}

// 统一处理Authorization头，自动补Bearer
function getAuthHeader(rawKey){
  return rawKey.startsWith("Bearer ") ? rawKey : "Bearer " + rawKey;
}

//=====1.FLUX.1‑dev 文生图=====
document.getElementById("btnFluxTxt").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey){ alert("请填写Bearer Token"); return; }
  const prompt = document.getElementById("fluxTxtPrompt").value.trim();
  const negPrompt = document.getElementById("fluxNeg").value.trim();
  const n = Number(document.getElementById("fluxTxtN").value);
  const res = JSON.parse(document.getElementById("fluxTxtRes").value);

  statusBadge.textContent = "任务提交中...";
  outputDiv.innerHTML += `<div>【FLUX.1‑dev 文生图】提交任务</div>`;

  const payload = {
    model:"black-forest-labs/FLUX.1-dev",
    prompt:prompt,
    negative_prompt:negPrompt,
    width:res.w,
    height:res.h,
    n:n
  }
  try{
    const resp = await fetch("/api/v1/images/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    })
    const json = await resp.json();
    statusBadge.textContent = "准备就绪 / Ready";
    if(json.data){
      json.data.forEach(item=>{
        outputDiv.innerHTML += `<div><img style="max-width:100%;" src="${item.url}" /></div>`
      })
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`
  }
}

//=====2.FLUX.1‑Kontext‑dev 图生图=====
document.getElementById("btnFluxImg2Img").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey){ alert("请填写Bearer Token"); return; }
  const fileEl = document.getElementById("fluxImg2ImgFile");
  if(!fileEl.files[0]){ alert("请上传参考原图"); return; }

  const base64Img = await fileToBase64(fileEl.files[0]);
  const prompt = document.getElementById("fluxImg2ImgPrompt").value.trim();
  const negPrompt = document.getElementById("fluxImg2ImgNeg").value.trim();
  const denoise = Number(document.getElementById("fluxImg2ImgDenoise").value);
  const n = Number(document.getElementById("fluxImg2ImgN").value);
  const res = JSON.parse(document.getElementById("fluxImg2ImgRes").value);

  statusBadge.textContent = "图生图任务提交中...";
  outputDiv.innerHTML += `<div>【FLUX.1‑Kontext‑dev 图生图】提交任务</div>`;

  const payload = {
    model:"black-forest-labs/FLUX.1-Kontext-dev",
    prompt:prompt,
    negative_prompt:negPrompt,
    image: base64Img,
    denoising_strength: denoise,
    width:res.w,
    height:res.h,
    n:n
  }
  try{
    const resp = await fetch("/api/v1/images/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    })
    const json = await resp.json();
    statusBadge.textContent = "准备就绪 / Ready";
    if(json.data){
      json.data.forEach(item=>{
        outputDiv.innerHTML += `<div><img style="max-width:100%;" src="${item.url}" /></div>`
      })
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`
  }
}

//=====3.Wan2.1‑I2V‑A14B 图生视频=====
document.getElementById("btnWanRun").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey){ alert("请填写Bearer Token"); return; }
  const fileEl = document.getElementById("wanImg");
  if(!fileEl.files[0]){ alert("请上传输入图片"); return; }

  const base64Img = await fileToBase64(fileEl.files[0]);
  const prompt = document.getElementById("wanPrompt").value.trim();
  const negPrompt = document.getElementById("wanNeg").value.trim();
  const w = Number(document.getElementById("wanW").value);
  const h = Number(document.getElementById("wanH").value);
  const steps = Number(document.getElementById("wanSteps").value);
  const fps = Number(document.getElementById("wanFps").value);
  const frames = Number(document.getElementById("wanFrames").value);
  const seed = Number(document.getElementById("wanSeed").value);

  statusBadge.textContent = "视频任务提交中...";
  outputDiv.innerHTML += `<div>【Wan2.1‑I2V‑A14B 图生视频】提交异步任务</div>`;

  const payload = {
    model:"alibaba-research/Wan2.1-I2V-A14B",
    image: base64Img,
    prompt: prompt,
    negative_prompt: negPrompt,
    width:w,
    height:h,
    num_inference_steps:steps,
    fps:fps,
    num_frames:frames,
    seed: seed === -1 ? Math.floor(Math.random()*2147483647) : seed
  }
  try{
    const resp = await fetch("/api/v1/videos/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    })
    const json = await resp.json();
    statusBadge.textContent = "准备就绪 / Ready";
    if(json.data && json.data[0]?.url){
      outputDiv.innerHTML += `<div><video controls style="max-width:100%;"><source src="${json.data[0].url}"></video></div>`
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`
  }
}
