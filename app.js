// Moark Web (Cloudflare Pages/Workers)
// 仅保留3个最优模型，删除旧模型、文生视频
const BASE_V1 = "https://ai.gitee.com/v1";
const $ = (id) => document.getElementById(id);

const Z_RESOLUTIONS = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

const WAN_RES_PRESETS = {
  "480p 横屏 / 832x480": [832, 480],
  "480p 竖屏 / 480x832": [480, 832],
  "720p 竖屏 / 720x1280": [720, 1280],
};

function nowTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function setStatus(text, kind="info") {
  const badge = $("statusBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.style.borderColor = kind === "ok" ? "rgba(37,194,160,.7)" : kind === "err" ? "rgba(255,84,112,.75)" : "rgba(255,255,255,.10)";
  badge.style.background = kind === "ok" ? "rgba(37,194,160,.10)" : kind === "err" ? "rgba(255,84,112,.10)" : "rgba(255,255,255,.06)";
}

function waitingStatusText(label, tick, elapsedMs, extra="") {
  const sec = Math.floor(elapsedMs / 1000);
  const extraText = extra ? ` • ${extra}` : "";
  return `${label} 轮询中... 已等待 ${sec}s • 第 ${tick} 次检查${extraText}`;
}

function getApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) throw new Error("请输入 API Key");
  return key;
}

function rememberKeyMaybe() {
  const key = $("apiKey").value.trim();
  if ($("rememberKey").checked && key) localStorage.setItem("moark_api_key", key);
}

function loadRememberedKey() {
  const key = localStorage.getItem("moark_api_key") || "";
  if (key) {
    $("apiKey").value = key;
    $("rememberKey").checked = true;
  }
}

function clearRememberedKey() {
  localStorage.removeItem("moark_api_key");
  $("apiKey").value = "";
  $("rememberKey").checked = false;
}

// 切换面板：3个面板对应3个模型
function showPanel(model) {
  $("panelFluxTxt").style.display = model === "black-forest-labs/FLUX.1-dev" ? "block" : "none";
  $("panelFluxImg2Img").style.display = model === "black-forest-labs/FLUX.1-Kontext-dev" ? "block" : "none";
  $("panelWanI2V").style.display = model === "alibaba-research/Wan2.1-I2V-A14B" ? "block" : "none";
}

function addOutputItem({title, kind="info", meta="", element=null, rawJson=null, download=null, openUrl=null}) {
  const out = $("output");
  const box = document.createElement("div");
  box.className = "item";
  const h = document.createElement("h3");
  h.textContent = title;
  box.appendChild(h);
  if (meta) { const m = document.createElement("div"); m.className = "meta"; m.textContent = meta; box.appendChild(m); }
  if (element) box.appendChild(element);
  if (rawJson) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(rawJson, null, 2);
    box.appendChild(pre);
    const btns = document.createElement("div"); btns.className = "row";
    const b = document.createElement("button"); b.className = "btn"; b.textContent = "下载JSON";
    b.onclick = () => downloadBlob(new Blob([pre.textContent], {type:"application/json"}), `${title}_${nowTs()}.json`);
    btns.appendChild(b); box.appendChild(btns);
  }
  if (download) {
    const btn = document.createElement("a"); btn.className = "btn"; btn.textContent = "下载";
    btn.href = download.href; btn.download = download.filename; btn.target = "_blank";
    const row = document.createElement("div"); row.className = "row"; row.appendChild(btn);
    if (openUrl) {
      const b2 = document.createElement("a"); b2.className = "btn"; b2.textContent = "打开链接";
      b2.href = openUrl; b2.target = "_blank"; row.appendChild(b2);
    }
    box.appendChild(row);
  } else if (openUrl) {
    const row = document.createElement("div"); row.className = "row";
    const b2 = document.createElement("a"); b2.className = "btn"; b2.textContent = "打开链接";
    b2.href = openUrl; b2.target = "_blank"; row.appendChild(b2); box.appendChild(row);
  }
  out.prepend(box);
  return box;
}

function clearOutput() { $("output").innerHTML = ""; }

async function apiFetch(path, {method="GET", headers={}, body=null}={}) {
  const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, {method, headers, body});
  return res;
}

async function dlFetch(url) {
  const res = await fetch(`/dl?url=${encodeURIComponent(url)}`);
  return res;
}

async function readJsonSafely(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return {_text:text}; }
}

function clampInt(v, lo, hi, defv) {
  const n = Number.parseInt(String(v),10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi)) : defv;
}
function clampFloat(v, lo, hi, defv) {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi)) : defv;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

async function fetchAsBlob(url) {
  const r = await dlFetch(url);
  if (!r.ok) throw new Error("资源下载失败");
  const blob = await r.blob();
  return {blob, objUrl:URL.createObjectURL(blob)};
}

// 任务轮询通用
async function pollTask(taskId, apiKey, intervalMs=6000) {
  const start = Date.now();
  while (Date.now() - start < 1800000) {
    const res = await apiFetch(`task/${encodeURIComponent(taskId)}`, {
      headers: {Authorization:`Bearer ${apiKey}`}
    });
    const j = await readJsonSafely(res);
    const st = j.status;
    if (["success","failed","cancelled"].includes(st)) return {status:st, raw:j};
    await new Promise(r=>setTimeout(r,intervalMs));
  }
  return {status:"timeout", raw:{message:"任务超时"}};
}

// ===================== 1、FLUX 文生图（纯文字写真） =====================
async function runFluxTxt() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  const prompt = $("fluxTxtPrompt").value.trim();
  if (!prompt) throw new Error("请输入正向提示词");
  const neg = $("fluxTxtNeg").value.trim();
  const n = clampInt($("fluxTxtN").value,1,4,1);
  const [w,h] = Z_RESOLUTIONS[$("fluxTxtRes").value];
  const size = `${w}x${h}`;

  setStatus("FLUX 写真人像生成中");
  const payload = {
    model:"black-forest-labs/FLUX.1-dev",
    prompt,
    negative_prompt:neg,
    n,
    size
  };
  const res = await apiFetch("images/generations", {
    method:"POST",
    headers:{
      Authorization:`Bearer ${apiKey}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });
  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("生成失败","err");
    addOutputItem({title:"FLUX文生图请求错误",rawJson:j});
    throw new Error("接口异常");
  }
  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) { addOutputItem({title:"无图片返回",rawJson:j}); return; }
  for (let i=0;i<data.length;i++) {
    const item = data[i];
    let blobInfo;
    if (item.url) blobInfo = await fetchAsBlob(item.url);
    else if (item.b64_json) {
      const buf = atob(item.b64_json);
      const arr = new Uint8Array([...buf].map(c=>c.charCodeAt(0)));
      blobInfo = {blob:new Blob([arr],{type:"image/png"}), objUrl:URL.createObjectURL(new Blob([arr]))};
    } else continue;
    const img = document.createElement("img");
    img.src = blobInfo.objUrl;
    addOutputItem({
      title:`FLUX文生图 #${i+1}`,
      meta:`size ${size}`,
      element:img,
      download:{href:blobInfo.objUrl, filename:`flux_txt_${nowTs()}.png`}
    });
  }
  setStatus("生成完成","ok");
}

// ===================== 2、FLUX Kontext 图生图（身材透视服装） =====================
let fluxImg2ImgBase64 = null;
document.getElementById("fluxImg2ImgFile")?.addEventListener("change",async e=>{
  const f = e.target.files[0];
  if (!f) { fluxImg2ImgBase64=null; return; }
  const r = new FileReader();
  r.readAsDataURL(f);
  r.onload = ev=> fluxImg2ImgBase64 = ev.target.result;
});

async function runFluxImg2Img() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  if (!fluxImg2ImgBase64) throw new Error("上传参考图片");
  const prompt = $("fluxImg2ImgPrompt").value.trim();
  if (!prompt) throw new Error("填写人像提示词");
  const neg = $("fluxImg2ImgNeg").value.trim();
  const denoise = clampFloat($("fluxImg2ImgDenoise").value,0.1,1,0.72);
  const n = clampInt($("fluxImg2ImgN").value,1,4,1);
  const [w,h] = Z_RESOLUTIONS[$("fluxImg2ImgRes").value];
  const size = `${w}x${h}`;

  setStatus("FLUX图生图重绘人像");
  const payload = {
    model:"black-forest-labs/FLUX.1-Kontext-dev",
    prompt,
    negative_prompt:neg,
    image:fluxImg2ImgBase64,
    denoising_strength:denoise,
    n,
    size
  };
  const res = await apiFetch("images/generations", {
    method:"POST",
    headers:{
      Authorization:`Bearer ${apiKey}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });
  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("图生图失败","err");
    addOutputItem({title:"Kontext请求报错",rawJson:j});
    throw new Error("接口异常");
  }
  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) return;
  for (let i=0;i<data.length;i++) {
    const item = data[i];
    let blobInfo;
    if (item.url) blobInfo = await fetchAsBlob(item.url);
    else if (item.b64_json) {
      const buf = atob(item.b64_json);
      const arr = new Uint8Array([...buf].map(c=>c.charCodeAt(0)));
      blobInfo = {blob:new Blob([arr],{type:"image/png"}), objUrl:URL.createObjectURL(new Blob([arr]))};
    } else continue;
    const img = document.createElement("img");
    img.src = blobInfo.objUrl;
    addOutputItem({
      title:`人像重绘 #${i+1}`,
      meta:`重绘强度${denoise} size${size}`,
      element:img,
      download:{href:blobInfo.objUrl, filename:`flux_img2img_${nowTs()}.png`}
    });
  }
  setStatus("重绘完成","ok");
}

// ===================== 3、Wan2.1 图生视频（仅图片转动态） =====================
function applyWanRes() {
  const sel = $("wanResSel").value;
  const [w,h] = WAN_RES_PRESETS[sel];
  $("wanW").value = w; $("wanH").value = h;
}

async function runWanI2V() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  const imgFile = $("wanImg").files[0];
  if (!imgFile) throw new Error("上传图片");
  const prompt = $("wanPrompt").value.trim();
  if (!prompt) throw new Error("视频动作提示词");
  const neg = $("wanNeg").value.trim();
  const w = clampInt($("wanW").value,64,1280,720);
  const h = clampInt($("wanH").value,64,1280,1280);
  const steps = clampInt($("wanSteps").value,1,60,30);
  const fps = clampInt($("wanFps").value,1,30,24);
  const frames = clampInt($("wanFrames").value,16,240,120);
  const seed = clampInt($("wanSeed").value,-1,999999,-1);

  const fd = new FormData();
  fd.append("model","alibaba-research/Wan2.1-I2V-A14B");
  fd.append("prompt",prompt);
  fd.append("negative_prompt",neg);
  fd.append("width",String(w));
  fd.append("height",String(h));
  fd.append("num_inference_steps",String(steps));
  fd.append("fps",String(fps));
  fd.append("num_frames",String(frames));
  if (seed > -1) fd.append("seed",String(seed));
  fd.append("image",imgFile,imgFile.name);

  setStatus("图生视频任务创建");
  const res = await apiFetch("async/videos/image-to-video", {
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`},
    body:fd
  });
  const j = await readJsonSafely(res);
  if (!res.ok || !j.task_id) {
    setStatus("视频任务创建失败","err");
    addOutputItem({title:"Wan2.1错误",rawJson:j});
    throw new Error("提交失败");
  }
  const tid = j.task_id;
  addOutputItem({title:"视频任务已创建", meta:`task_id:${tid}`, rawJson:j});
  setStatus("视频生成轮询中");
  const resTask = await pollTask(tid, apiKey, 8000);
  if (resTask.status !== "success") {
    setStatus("视频生成失败","err");
    addOutputItem({title:"视频任务结束", rawJson:resTask.raw});
    return;
  }
  const fileUrl = resTask.raw?.output?.file_url;
  if (!fileUrl) throw new Error("无视频文件");
  const blobInfo = await fetchAsBlob(fileUrl);
  const vid = document.createElement("video");
  vid.src = blobInfo.objUrl;
  vid.controls = true;
  addOutputItem({
    title:"生成视频",
    meta:`${w}×${h} ${frames}帧`,
    element:vid,
    download:{href:blobInfo.objUrl, filename:`video_${nowTs()}.mp4`},
    openUrl:fileUrl
  });
  setStatus("视频生成完成","ok");
}

// 页面初始化
function initUi() {
  // 分辨率下拉填充 FLUX文生图
  const fluxTxtRes = $("fluxTxtRes");
  Object.keys(Z_RESOLUTIONS).forEach(k=>{
    const opt = document.createElement("option");
    opt.textContent = k; opt.value = k;
    fluxTxt.appendChild(opt);
  });
  fluxTxtRes.value = Object.keys(Z_RESOLUTIONS)[1];

  // FLUX图生图分辨率
  const fluxImg2ImgRes = $("fluxImg2ImgRes");
  Object.keys(Z_RESOLUTIONS).forEach(k=>{
    const opt = document.createElement("option");
    opt.textContent = k; opt.value = k;
    fluxImg2Img.appendChild(opt);
  });
  fluxImg2ImgRes.value = Object.keys(Z_RESOLUTIONS)[1];

  // Wan视频分辨率
  const wanResSel = $("wanResSel");
  Object.keys(WAN_RES_PRESETS).forEach(k=>{
    const opt = document.createElement("option");
    opt.textContent = k; opt.value = k;
    wanResSel.appendChild(opt);
  });
  wanResSel.value = Object.keys(WAN_RES_PRESETS)[1];
  applyWanRes();

  // 模型切换监听
  $("modelSel").addEventListener("change", e=>showPanel(e.target.value));
  showPanel($("modelSel").value);

  // 按钮绑定
  $("btnFluxTxt").onclick = async ()=>{try{await runFluxTxt()}catch(e){addOutputItem({title:"FLUX文生图报错", meta:String(e)})}};
  $("btnFluxImg2Img").onclick = async ()=>{try{await runFluxImg2Img()}catch(e){addOutputItem({title:"图生图报错", meta:String(e)})}};
  $("btnWanRun").onclick = async ()=>{try{await runWanI2V()}catch(e){addOutputItem({title:"视频报错", meta:String(e)})}};

  $("wanResSel").addEventListener("change", applyWanRes);
  $("btnClearOutput").onclick = clearOutput;
  $("btnClearKey").onclick = clearRememberKey;
  loadRememberKey();
}

window.addEventListener("DOMContentLoaded", initUi);
