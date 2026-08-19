const $ = (id) => document.getElementById(id);

const Z_RESOLUTIONS = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 768],
  "16:9 (1024x576)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

const WAN_RES_PRESETS = {
  "480p 横屏 / 832x480 (推荐)": [832, 480],
  "480p 竖屏 / 480x832": [480, 832],
  "720p 横屏 / 1280x720": [1280, 720],
  "720p 竖屏 / 720x1280": [720, 1280],
  "1024 方图 / 1024x1024": [1024, 1024],
  "2048 方图 / 2048x2048": [2048, 2048],
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
  badge.style.borderColor =
    kind === "ok" ? "rgba(37,194,160,.7)" :
    kind === "err" ? "rgba(255,84,112,.75)" :
    "rgba(255,255,255,.10)";

  badge.style.background =
    kind === "ok" ? "rgba(37,194,160,.10)" :
    kind === "err" ? "rgba(255,84,112,.10)" :
    "rgba(255,255,255,.06)";
}

function waitingStatusText(label, tick, elapsedMs, extra="") {
  const sec = Math.floor(elapsedMs / 1000);
  const extraText = extra ? ` • ${extra}` : "";
  return `${label} 轮询中... 已等待 ${sec}s • 第 ${tick} 次检查${extraText}`;
}

function getApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) throw new Error("请输入 API Key / Please enter API Key");
  return key;
}

function rememberKeyMaybe() {
  const key = $("apiKey").value.trim();
  if ($("rememberKey").checked && key) {
    localStorage.setItem("moark_api_key", key);
  }
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

// 严格按照用户指定的白名单模型
const T2I_MODELS = ["Qwen-Image-2512", "z-image-turbo"];
const EDIT_MODELS = ["Qwen-Image-Edit-2511", "GLM-Image-Edit", "Z-Image-Edit"];
const VIDEO_MODELS = ["Wan2.2-T2V-A14B", "Wan2.7-Video", "Wan2.2-I2V-A14B"];

function showPanel(model) {
  const isT2I = T2I_MODELS.includes(model);
  const isEdit = EDIT_MODELS.includes(model);
  const isVideo = VIDEO_MODELS.includes(model);

  $("panelZ").style.display = isT2I ? "block" : "none";
  $("panelEdit").style.display = isEdit ? "block" : "none";
  $("panelWan").style.display = isVideo ? "block" : "none";

  if (isT2I) {
    $("t2iTitle").textContent = `${model}（文生图 / Text-to-Image）`;
  }
  if (isEdit) {
    $("editTitle").textContent = `${model}（图生图 / Image-to-Image）`;
  }
  if (isVideo) {
    const isI2V = model === "Wan2.2-I2V-A14B";
    $("wanImgLabel").textContent = isI2V ? "输入图片（图生视频必填）/ Input Image" : "输入图片（可选）/ Input Image";
  }
}

function addOutputItem({title, meta="", element=null, rawJson=null, download=null, openUrl=null}) {
  const out = $("output");
  const box = document.createElement("div");
  box.className = "item";

  const h = document.createElement("h3");
  h.textContent = title;
  box.appendChild(h);

  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = meta;
    box.appendChild(m);
  }

  if (element) box.appendChild(element);

  if (rawJson) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(rawJson, null, 2);
    box.appendChild(pre);

    const btns = document.createElement("div");
    btns.className = "row";
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = "下载 JSON / Download JSON";
    b.onclick = () => downloadBlob(new Blob([pre.textContent], {type:"application/json"}), `${title}_${nowTs()}.json`);
    btns.appendChild(b);
    box.appendChild(btns);
  }

  if (download || openUrl) {
    const row = document.createElement("div");
    row.className = "row";
    if (download) {
      const btn = document.createElement("a");
      btn.className = "btn";
      btn.textContent = "下载 / Download";
      btn.href = download.href;
      btn.download = download.filename || "";
      btn.target = "_blank";
      btn.rel = "noopener";
      row.appendChild(btn);
    }
    if (openUrl) {
      const b2 = document.createElement("a");
      b2.className = "btn";
      b2.textContent = "打开 file_url";
      b2.href = openUrl;
      b2.target = "_blank";
      b2.rel = "noopener";
      row.appendChild(b2);
    }
    box.appendChild(row);
  }

  out.prepend(box);
  return box;
}

function clearOutput() {
  $("output").innerHTML = "";
}

async function apiFetch(path, {method="GET", headers={}, body=null, signal=null}={}) {
  const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, { method, headers, body, signal });
  return res;
}

async function dlFetch(url) {
  const u = `/dl?url=${encodeURIComponent(url)}`;
  const res = await fetch(u, { method: "GET" });
  return res;
}

async function readJsonSafely(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _text: text }; }
}

function clampInt(v, lo, hi, defv) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : defv;
}

function clampFloat(v, lo, hi, defv) {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : defv;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchAsBlob(url) {
  const r = await dlFetch(url);
  if (!r.ok) {
    const j = await readJsonSafely(r);
    throw new Error(`下载失败 (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  return { blob, objUrl };
}

async function pollTask(taskId, apiKey, {timeoutMs=30*60*1000, intervalMs=6000, onTick=null}={}) {
  const start = Date.now();
  let tick = 0;

  while (Date.now() - start < timeoutMs) {
    tick++;
    const elapsedMs = Date.now() - start;
    if (onTick) onTick({ tick, elapsedMs });

    const res = await apiFetch(`task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const j = await readJsonSafely(res);
    const st = j.status || "unknown";
    if (st === "success" || st === "failed" || st === "cancelled") {
      return { status: st, raw: j };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { status: "timeout", raw: { status:"timeout", message:"maximum wait time exceeded" } };
}

// -------- 文生图 --------
async function runTextToImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const model = $("modelSel").value;
  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词");

  const negPrompt = $("zNegPrompt").value.trim();
  const n = clampInt($("zN").value, 1, 4, 1);
  const [w, h] = Z_RESOLUTIONS[$("zRes").value];
  const size = `${w}x${h}`;

  
setStatus(`${model} 生成中...`);
const payload = { prompt, model, n, size, seed: -1 };
if (negPrompt) {
  payload.negative_prompt = negPrompt;
}

  
  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus(`${model} 失败`, "err");
    addOutputItem({ title: `${model} 生成失败`, rawJson: j });
    throw new Error(`API 错误 (${res.status})`);
  }

  const data = Array.isArray(j.data) ? j.data : [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i] || {};
    let blobInfo = null;

    if (item.url) {
      blobInfo = await fetchAsBlob(item.url);
    } else if (item.b64_json) {
      const byteChars = atob(item.b64_json);
      const bytes = new Uint8Array(byteChars.length);
      for (let k = 0; k < byteChars.length; k++) bytes[k] = byteChars.charCodeAt(k);
      const blob = new Blob([bytes], { type: "image/png" });
      blobInfo = { blob, objUrl: URL.createObjectURL(blob) };
    } else {
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;
    addOutputItem({
      title: `${model} 输出 #${i+1}`,
      element: img,
      download: { href: blobInfo.objUrl, filename: `${model}-${nowTs()}-${i+1}.png` },
    });
  }
  setStatus(`${model} 成功`, "ok");
}

// -------- 图生图 / 图像编辑 --------
async function runEdit() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const model = $("modelSel").value;
  const f1 = $("editImg1").files?.[0];
  const f2 = $("editImg2").files?.[0];
  const prompt = $("editPrompt").value.trim();

  if (!f1) throw new Error("请至少上传主图片 (Image 1)");

  const fd = new FormData();
  fd.append("model", model);
  if (prompt) fd.append("prompt", prompt);
  fd.append("image", f1, f1.name);
  if (f2) fd.append("image", f2, f2.name);

  const taskTypes = Array.from(document.querySelectorAll("input[name='editTaskType']:checked")).map(x => x.value);
  for (const t of taskTypes) fd.append("task_types", t);
  fd.append("num_inference_steps", String(clampInt($("editSteps").value, 1, 50, 4)));
  fd.append("guidance_scale", String(clampFloat($("editGuidance").value, 0, 10, 1.0)));

  setStatus(`${model} 处理中...`);
  
  const res = await apiFetch("async/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: fd,
  });
  const j = await readJsonSafely(res);
  if (!res.ok || !j.task_id) {
    setStatus(`${model} 失败`, "err");
    addOutputItem({ title: `${model} 任务创建失败`, rawJson: j });
    throw new Error("任务创建失败");
  }

  const taskId = j.task_id;
  const result = await pollTask(taskId, apiKey, {
    intervalMs: 6000,
    onTick: (info) => setStatus(waitingStatusText(model, info.tick, info.elapsedMs)),
  });

  if (result.status !== "success") throw new Error(`任务失败: ${result.status}`);

  const fileUrl = result.raw?.output?.file_url;
  const { objUrl } = await fetchAsBlob(fileUrl);
  const img = document.createElement("img");
  img.src = objUrl;

  addOutputItem({
    title: `${model} 处理结果`,
    element: img,
    download: { href: objUrl, filename: `${model}-${nowTs()}.png` },
    openUrl: $("editOpenUrl").checked ? fileUrl : null,
  });
  setStatus(`${model} 成功`, "ok");
}

// -------- 视频生成 (Wan 系列) --------
function applyWanResolution() {
  const key = $("wanResPreset").value;
  const [w, h] = WAN_RES_PRESETS[key];
  $("wanW").value = String(w);
  $("wanH").value = String(h);
}

function applyWanPreset() {
  const p = $("wanPreset").value;
  let steps = 30, guidance = 5.0, fps = 24;
  if (p.includes("更清晰")) { steps = 60; guidance = 6.0; }
  else if (p.includes("更动感")) { steps = 40; guidance = 5.0; fps = 30; }
  else if (p.includes("更快")) { steps = 20; guidance = 4.0; }

  $("wanSteps").value = String(steps);
  $("wanGuidance").value = String(guidance);
  $("wanFps").value = String(fps);
  if ($("wanAutoFrames").checked) {
    $("wanFrames").value = String(Math.max(1, Math.min(300, fps * 5)));
  }
}

async function ensureJsZip() {
  if (window.JSZip) return window.JSZip;
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error("加载 JSZip 失败"));
  });
  return window.JSZip;
}

async function zipAndDownloadMp4s(files, zipName) {
  const JSZip = await ensureJsZip();
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

async function runWan() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const model = $("modelSel").value;
  const img = $("wanImg").files?.[0];
  const prompt = $("wanPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词");

  if (model === "Wan2.2-I2V-A14B" && !img) {
    throw new Error("Wan2.2-I2V-A14B 是图生视频模型，必须上传输入图片");
  }

  const neg = $("wanNeg").value.trim();
  const width = clampInt($("wanW").value, 64, 2048, 832);
  const height = clampInt($("wanH").value, 64, 2048, 480);
  const steps = clampInt($("wanSteps").value, 1, 100, 30);
  const guidance = clampFloat($("wanGuidance").value, 0, 20, 5.0);
  const fps = clampInt($("wanFps").value, 1, 60, 24);
  const duration = clampFloat($("wanDuration").value, 0.5, 60, 5.0);

  let numFrames = $("wanAutoFrames").checked ? Math.max(1, Math.min(300, fps * 5)) : clampInt($("wanFrames").value, 1, 300, 30);
  const seedVal = clampInt($("wanSeed").value, -1, 2147483647, -1);
  const seed = seedVal < 0 ? null : seedVal;

  const segmentLen = 5.0;
  const segCount = Math.max(1, Math.ceil(duration / segmentLen));
  const segments = [];

  for (let i = 0; i < segCount; i++) {
    setStatus(`${model} 分段 ${i+1}/${segCount} 创建中...`);
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("model", model);
    fd.append("num_frames", String(numFrames));
    fd.append("guidance_scale", String(guidance));
    fd.append("height", String(height));
    fd.append("width", String(width));
    if (neg) fd.append("negative_prompt", neg);
    if (seed !== null) fd.append("seed", String(seed));
    fd.append("num_inference_steps", String(steps));
    if (img) fd.append("image", img, img.name);

    const endpoint = (model === "Wan2.2-I2V-A14B" || img) ? "async/videos/image-to-video" : "async/videos/generations";
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: fd,
    });
    const j = await readJsonSafely(res);
    if (!res.ok || !j.task_id) throw new Error("创建视频任务失败");

    const taskId = j.task_id;
    const result = await pollTask(taskId, apiKey, {
      timeoutMs: 60*60*1000,
      intervalMs: 8000,
      onTick: (info) => setStatus(waitingStatusText(`${model} 分段 ${i+1}`, info.tick, info.elapsedMs)),
    });

    if (result.status !== "success") throw new Error(`视频任务失败: ${result.status}`);

    const fileUrl = result.raw?.output?.file_url;
    const dl = await fetchAsBlob(fileUrl);
    const name = `video_seg${i+1}_${nowTs()}.mp4`;
    segments.push({ name, blob: dl.blob, objUrl: dl.objUrl });

    const video = document.createElement("video");
    video.controls = true;
    video.src = dl.objUrl;

    addOutputItem({
      title: `${model} 输出视频（分段 ${i+1}/${segCount}）`,
      element: video,
      download: { href: dl.objUrl, filename: name },
      openUrl: $("wanOpenUrl").checked ? fileUrl : null,
    });
  }

  if (segCount > 1 && $("wanZipSegments").checked) {
    await zipAndDownloadMp4s(segments, `video_segments_${nowTs()}.zip`);
  }
  setStatus("成功", "ok");
}

// 初始化 UI
function initUi() {
  const zRes = $("zRes");
  for (const k of Object.keys(Z_RESOLUTIONS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    zRes.appendChild(o);
  }
  zRes.value = Object.keys(Z_RESOLUTIONS)[0];

  const wanRes = $("wanResPreset");
  for (const k of Object.keys(WAN_RES_PRESETS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    wanRes.appendChild(o);
  }
  wanRes.value = Object.keys(WAN_RES_PRESETS)[0];
  applyWanResolution();

  const box = $("editTaskTypes");
  for (const t of EDIT_TASK_TYPES) {
    const label = document.createElement("label");
    label.className = "chk";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "editTaskType";
    input.value = t;
    input.checked = (t === "id" || t === "style");
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + t));
    box.appendChild(label);
  }

  $("modelSel").addEventListener("change", (e) => showPanel(e.target.value));
  showPanel($("modelSel").value);

  $("btnZRun").onclick = async () => { try { await runTextToImage(); } catch (e) { addOutputItem({ title:"错误", meta:String(e) }); } };
  $("btnEditRun").onclick = async () => { try { await runEdit(); } catch (e) { addOutputItem({ title:"错误", meta:String(e) }); } };
  $("btnWanRun").onclick = async () => { try { await runWan(); } catch (e) { addOutputItem({ title:"错误", meta:String(e) }); } };

  $("btnClearOutput").onclick = clearOutput;
  $("btnWanApplyPreset").onclick = applyWanPreset;
  $("wanResPreset").addEventListener("change", applyWanResolution);
  $("btnClearKey").onclick = clearRememberedKey;

  loadRememberedKey();
}

window.addEventListener("DOMContentLoaded", () => {
  initUi();
  setStatus("准备就绪 / Ready");
});
