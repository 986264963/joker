// 页面下拉模型与面板绑定（仅3个新模型）
const modelSel = document.getElementById('modelSel');
const panels = {
  "FLUX.1-dev": document.getElementById("panelFluxTxt"),
  "FLUX.1-Kontext-dev": document.getElementById("panelFluxImg2Img"),
  "Wan2.1-I2V-A14B": document.getElementById("panelWanI2V")
};

// 切换面板初始化
function switchPanel(){
  Object.values(panels).forEach(p=>p.style.display="none");
  const selected = modelSel.value;
  if(panels[selected]) panels[selected].style.display = "block";
}
modelSel.addEventListener("change", switchPanel);
switchPanel();

// API密钥本地存储
const apiKeyEl = document.getElementById("apiKey");
const rememberKey = document.getElementById("rememberKey");
const btnClearKey = document.getElementById("btnClearKey");
const statusBadge = document.getElementById("statusBadge");
const outputDiv = document.getElementById("output");

if(localStorage.getItem("apiKey")) apiKeyEl.value = localStorage.getItem("apiKey");
rememberKey.onchange = () => {
  rememberKey.checked ? localStorage.setItem("apiKey", apiKeyEl.value) : localStorage.removeItem("apiKey");
};
btnClearKey.onclick = () => {
  apiKeyEl.value = "";
  localStorage.removeItem("apiKey");
};
apiKeyEl.oninput = () => {
  if(rememberKey.checked) localStorage.setItem("apiKey", apiKeyEl.value);
};

// 分辨率下拉选项
const resOptions = [
  {w:896,h:1152,name:"896×1152 竖版人像"},
  {w:1152,h:896,name:"1152×896 横版"},
  {w:1024,h:1024,name:"1024×1024 正方形"}
];
const fluxTxtResSel = document.getElementById("fluxTxtRes");
const fluxImg2ImgResSel = document.getElementById("fluxImg2ImgRes");
const wanResSel = document.getElementById("wanResSel");
resOptions.forEach(opt=>{
  fluxTxtResSel.append(new Option(opt.name, JSON.stringify({w:opt.w,h:opt.h})));
  fluxImg2ImgResSel.append(new Option(opt.name, JSON.stringify({w:opt.w,h:opt.h})));
  wanResSel.append(new Option(opt.name, JSON.stringify({w:opt.w,h:opt.h})));
});
wanResSel.onchange = function(){
  const val = JSON.parse(this.value);
  document.getElementById("wanW").value = val.w;
  document.getElementById("wanH").value = val.h;
};

// 清空输出按钮
document.getElementById("btnClearOutput").onclick = () => outputDiv.innerHTML = "";

// 文件转base64工具
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })
}

// 鉴权头自动补Bearer
function getAuthHeader(rawKey){
  return rawKey.startsWith("Bearer ") ? rawKey : "Bearer " + rawKey;
}

// 1. FLUX.1‑dev 文生图
document.getElementById("btnFluxTxt").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey) return alert("请填写API Key");
  const prompt = document.getElementById("fluxTxtPrompt").value.trim();
  const negPrompt = document.getElementById("fluxNeg").value.trim();
  const n = Number(document.getElementById("fluxTxtN").value);
  const res = JSON.parse(document.getElementById("fluxTxtRes").value);

  statusBadge.textContent = "任务提交中...";
  outputDiv.innerHTML += `<div>【FLUX.1-dev 文生图】提交任务</div>`;

  const payload = {
    model:"FLUX.1-dev",
    prompt:prompt,
    negative_prompt:negPrompt,
    width:res.w,
    height:res.h,
    n:n
  };
  try{
    const resp = await fetch("/api/images/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    });
    const json = await resp.json();
    statusBadge.textContent = "准备就绪";

    if(json.data) {
      json.data.forEach(item=>{
        let src = null;
        if(item.url) src = item.url;
        else if(item.b64_json) src = "data:image/png;base64," + item.b64_json;

        if(src){
          outputDiv.innerHTML += `<div><img style="max-width:100%;" src="${src}" /></div>`;
        }else{
          outputDiv.innerHTML += `<pre>${JSON.stringify(item,null,2)}</pre>`;
        }
      })
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`;
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`;
  }
}

// 2. FLUX.1-Kontext-dev 图生图
document.getElementById("btnFluxImg2Img").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey) return alert("请填写API Key");
  const file = document.getElementById("fluxImg2ImgFile").files[0];
  if(!file) return alert("请上传参考图片");
  const base64Img = await fileToBase64(file);
  const prompt = document.getElementById("fluxImg2ImgPrompt").value.trim();
  const negPrompt = document.getElementById("fluxImg2ImgNeg").value.trim();
  const denoise = Number(document.getElementById("fluxImg2ImgDenoise").value);
  const n = Number(document.getElementById("fluxImg2ImgN").value);
  const res = JSON.parse(document.getElementById("fluxImg2ImgRes").value);

  statusBadge.textContent = "图生图任务提交中...";
  outputDiv.innerHTML += `<div>【FLUX.1-Kontext-dev 图生图】提交任务</div>`;

  const payload = {
    model:"FLUX.1-Kontext-dev",
    prompt:prompt,
    negative_prompt:negPrompt,
    image: base64Img,
    denoising_strength: denoise,
    width:res.w,
    height:res.h,
    n:n
  };
  try{
    const resp = await fetch("/api/images/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    });
    const json = await resp.json();
    statusBadge.textContent = "准备就绪";

    if(json.data) {
      json.data.forEach(item=>{
        let src = null;
        if(item.url) src = item.url;
        else if(item.b64_json) src = "data:image/png;base64," + item.b64_json;

        if(src){
          outputDiv.innerHTML += `<div><img style="max-width:100%;" src="${src}" /></div>`;
        }else{
          outputDiv.innerHTML += `<pre>${JSON.stringify(item,null,2)}</pre>`;
        }
      })
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`;
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`;
  }
}

// 3. Wan2.1-I2V-A14B 图生视频
document.getElementById("btnWanRun").onclick = async function(){
  const apiKey = apiKeyEl.value.trim();
  if(!apiKey) return alert("请填写API Key");
  const file = document.getElementById("wanImg").files[0];
  if(!file) return alert("请上传参考图片");
  const base64Img = await fileToBase64(file);
  const prompt = document.getElementById("wanPrompt").value.trim();
  const negPrompt = document.getElementById("wanNeg").value.trim();
  const w = Number(document.getElementById("wanW").value);
  const h = Number(document.getElementById("wanH").value);
  const steps = Number(document.getElementById("wanSteps").value);
  const fps = Number(document.getElementById("wanFps").value);
  const frames = Number(document.getElementById("wanFrames").value);
  let seedVal = Number(document.getElementById("wanSeed").value);
  seedVal = seedVal === -1 ? Math.floor(Math.random()*2147483647) : seedVal;

  statusBadge.textContent = "视频任务提交中...";
  outputDiv.innerHTML += `<div>【Wan2.1-I2V-A14B 图生视频】提交任务</div>`;

  const payload = {
    model:"Wan2.1-I2V-A14B",
    image: base64Img,
    prompt: prompt,
    negative_prompt: negPrompt,
    width:w,
    height:h,
    num_inference_steps:steps,
    fps:fps,
    num_frames:frames,
    seed: seedVal
  };
  try{
    const resp = await fetch("/api/videos/generations",{
      method:"POST",
      headers:{
        "Authorization": getAuthHeader(apiKey),
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    });
    const json = await resp.json();
    statusBadge.textContent = "准备就绪";

    if(json.data?.length>0){
      const item = json.data[0];
      let videoSrc = null;
      if(item.url) videoSrc = item.url;
      else if(item.b64_video) videoSrc = "data:video/mp4;base64," + item.b64_video;

      if(videoSrc){
        outputDiv.innerHTML += `<div><video controls style="max-width:100%;"><source src="${videoSrc}"></video></div>`;
      }else{
        outputDiv.innerHTML += `<pre>${JSON.stringify(item,null,2)}</pre>`;
      }
    }else{
      outputDiv.innerHTML += `<pre>${JSON.stringify(json,null,2)}</pre>`;
    }
  }catch(err){
    statusBadge.textContent = "请求异常";
    outputDiv.innerHTML += `<pre>错误：${err.message}</pre>`;
  }
}
