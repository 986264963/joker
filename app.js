// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.
// - Downloads images/videos via /dl?url=... (Pages Function) to avoid cross-origin blocks.

const BASE_V1 = "https://ai.gitee.com/v1"; // for reference only (proxied)

const $ = (id) => document.getElementById(id);

// 1. 定义两套分辨率方案
const Z_RESOLUTIONS_STANDARD = {
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 768],
  "16:9 (1024x576)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

const Z_RESOLUTIONS_2512 = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (1536x2048)": [1536, 2048],
  "4:3 (2048x1536)": [2048, 1536],
  "16:9 (2048x1152)": [2048, 1152],
  "9:16 (1152x2048)": [1152, 2048],
};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

const WAN_RES_PRESETS = {
  "480p 横屏 / 832x480 (推荐 / Recommended)": [832, 480],
  "480p 竖屏 / 480x832": [480, 832],
  "720p 横屏 / 1280x720": [1280, 720],
  "720p 竖屏 / 720x1280": [720, 1280],
  "1024 方图 / 1024x1024": [1024, 1024],
  "2048 方图 / 2048x2048 (高成本 / Expensive)": [2048, 2048],
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
  return `${label} 轮询中... 已等待 ${sec}s • 第 ${tick} 次检查${extraText} • 正常等待，并非卡死`;
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

// 2. 更新模型列表，加入了 Z-Image 和 Qwen-Image 系列
const T2I_MODELS = [
  "Z-Image",
  "Z-Image-Turbo",
  "Qwen-Image-2512",
  "Qwen-Image-2.0-Pro",
  "Qwen-Image-2.0",
  "FLUX.2-dev",
  "FLUX.1-dev",
  "FLUX.1-schnell",
  "FLUX.1-Krea-dev",
  "Kolors",
  "stable-diffusion-3.5-large-turbo",
  "GLM-Image",
  "CogView4-6B",
  "HiDream-I1-Full",
  "Wan2.7-Image"
];

const EDIT_MODELS = [
  "Qwen-Image-Edit-2511",
  "Qwen-Image-Edit",
  "LongCat-Image-Edit",
  "RMBG-2.0",
  "Real-ESRGAN"
];

const VIDEO_MODELS = [
  "Wan 2.7-万相视频生成模型",
  "Wan2.2-I2V-A14B",
  "Wan2.1-T2V-14B",
  "HunyuanVideo-1.5",
  "ViduQ3-Pro",
  "LTX-2"
];

// 3. 修改 showPanel 函数，增加分辨率切换逻辑
function showPanel(model) {
  const isT2I = T2I_MODELS.includes(model);
  const isEdit = EDIT_MODELS.includes(model);
  const isVideo = VIDEO_MODELS.includes(model) || model === "Wan2.2-I2V-A14B" || model === "HunyuanVideo-1.5";

  $("panelZ").style.display = isT2I ? "block" : "none";
  $("panelEdit").style.display = isEdit ? "block" : "none";
  $("panelWan").style.display = (isVideo && model !== "HunyuanVideo-1.5") ? "block" : "none";
  $("panelHunyuan").style.display = (model === "HunyuanVideo-1.5" || isVideo) ? "block" : "none";

  if (isT2I) {
    $("t2iTitle").textContent = `${model}（文生图 / Text-to-Image）`;
    // --- 新增逻辑开始 ---
    const zRes = $("zRes");
    zRes.innerHTML = ""; // 清空现有选项
    // 只有 Qwen-Image-2512 使用高清分辨率，其他都用标准分辨率
    const resolutions = (model === "Qwen-Image-2512") ? Z_RESOLUTIONS_2512 : Z_RESOLUTIONS_STANDARD;
    for (const k of Object.keys(resolutions)) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      zRes.appendChild(o);
    }
    // --- 新增逻辑结束 ---
  }
  if (isEdit) {
    $("editTitle").textContent = `${model}（图像编辑处理 / Image Process）`;
  }
}

function addOutputItem({title, kind="info", meta="", element=null, rawJson=null, download=null, openUrl=null}) {
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
  if (download) {
    const btn = document.createElement("a");
    btn.className = "btn";
    btn.textContent = "下载 / Download";
    btn.href = download.href;
    btn.download = download.filename || "";
    btn.target = "_blank";
    btn.rel = "noopener";
    const row = document.createElement("div");
    row.className = "row";
    row.appendChild(btn);
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
  } else if (openUrl) {
    const row = document.createElement("div");
    row.className = "row";
    const b2 = document.createElement("a");
    b2.className = "btn";
    b2.textContent = "打开 file_url";
    b2.href = openUrl;
    b2.target = "_blank";
    b2.rel = "noopener";
    row.appendChild(b2);
    box.appendChild(row);
  }
  out.prepend(box);
  return box;
}

function clearOutput() {
  $("output").innerHTML = "";
}

// Same-origin proxy to ai.gitee.com/v1
async function apiFetch(path, {method="GET", headers={}, body=null, signal=null}={}) {
  const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    method,
    headers,
    body,
    signal,
  });
  return res;
}

// Download proxy for arbitrary file_url/image urls to avoid CORS
async function dlFetch(url, {signal=null}={}) {
  const u = `/dl?url=${encodeURIComponent(url)}`;
  const res = await fetch(u, {method:"GET", signal});
  return res;
}

async function readJsonSafely(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _text: text };
  }
}

function clampInt(v, lo, hi, defv) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isFinite(n)) return Math.max(lo, Math.min(hi, n));
  return defv;
}

function clampFloat(v, lo, hi, defv) {
  const n = Number.parseFloat(String(v));
  if (Number.isFinite(n)) return Math.max(lo, Math.min(hi, n));
  return defv;
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

async function fetchAsBlob(url, kindHint="file") {
  const r = await dlFetch(url);
  if (!r.ok) {
    const j = await readJsonSafely(r);
    throw new Error(`下载失败 / Download failed (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  return { blob, objUrl };
}

// Poll task status
async function pollTask(taskId, apiKey, {timeoutMs=30*60*1000, intervalMs=6000, onTick=null}={}) {
  const start = Date.now();
  let tick = 0;
  while (Date.now() - start < timeoutMs) {
    tick++;
    const elapsedMs = Date.now() - start;
    if (onTick) {
      onTick({ tick, elapsedMs, });
    }
    const res = await apiFetch(`task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
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

// -------- Async Video Task Handler --------
async function runHunyuanVideo() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  const model = $("modelSel").value;
  const prompt = $("hyPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");
  const negative_prompt = $("hyNeg").value.trim();
  const aspect_ratio = $("hyAspect").value;
  const num_inferenece_steps = clampInt($("hySteps").value, 1, 10, 10);
  const num_frames = clampInt($("hyFrames").value, 81, 241, 241);
  const seedRaw = $("hySeed").value;
  const seed = Number.parseInt(String(seedRaw), 10);
  if (!Number.isFinite(seed) || seed <= 0) {
    throw new Error("seed 必须是正整数 / seed must be a positive integer");
  }
  const fps = clampInt($("hyFps").value, 1, 24, 24);
  const openAfter = $("hyOpenUrl").checked;

  const payload = {
    prompt,
    model: VIDEO_MODELS.includes(model) ? model : "HunyuanVideo-1.5",
    aspect_ratio,
    negative_prompt,
    num_inferenece_steps,
    num_frames,
    seed,
    fps,
  };

  setStatus(`${model} 创建任务... / Creating task...`);
  const res = await apiFetch("async/videos/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus(`${model} 失败 / Failed`, "err");
    addOutputItem({
      title: `${model} 创建任务失败 / Create task failed`,
      meta: `HTTP ${res.status}`,
      rawJson: j,
    });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }
  const taskId = j.task_id;
  if (!taskId) {
    setStatus(`${model} 失败 / Failed`, "err");
    addOutputItem({
      title: `${model} 未返回 task_id / Missing task_id`,
      rawJson: j,
    });
    throw new Error("Task ID not found in response");
  }
  addOutputItem({
    title: `${model} 任务已创建 / Task created`,
    meta: `task_id=${taskId} • aspect_ratio=${aspect_ratio} • frames=${num_frames} • fps=${fps}`,
    rawJson: j,
    openUrl: openAfter ? `https://ai.gitee.com/v1/task/${encodeURIComponent(taskId)}` : null,
  });
  setStatus(`${model} 任务已创建，开始轮询...`);
  const result = await pollTask(taskId, apiKey, {
    intervalMs: 10 * 1000,
    timeoutMs: 30 * 60 * 1000,
    onTick: (info) => {
      setStatus(waitingStatusText(model, info.tick, info.elapsedMs));
    },
  });
  const st = result.status;
  const raw = result.raw || {};
  if (st !== "success") {
    setStatus(`${model} ${st} / ${st}`, st === "failed" ? "err" : "info");
    addOutputItem({
      title: `${model} 任务结束：${st} / Task ended: ${st}`,
      rawJson: raw,
      meta: `task_id=${taskId}`,
    });
    return;
  }
  const fileUrl = raw?.output?.file_url;
  const textRes = raw?.output?.text_result;
  if (fileUrl) {
    const blobInfo = await fetchAsBlob(fileUrl, "video");
    const video = document.createElement("video");
    video.src = blobInfo.objUrl;
    video.controls = true;
    video.playsInline = true;
    addOutputItem({
      title: `${model} 输出视频 / Output`,
      meta: `task_id=${taskId} • file_url=${fileUrl}`,
      element: video,
      rawJson: raw,
      download: { href: blobInfo.objUrl, filename: `video-${nowTs()}.mp4` },
      openUrl: openAfter ? fileUrl : null,
    });
    setStatus(`${model} 成功 / Success`, "ok");
  } else if (textRes) {
    addOutputItem({
      title: `${model} 文本输出 / Text output`,
      meta: `task_id=${taskId}`,
      rawJson: raw,
    });
    setStatus(`${model} 成功 / Success`, "ok");
  } else {
    addOutputItem({
      title: `${model} 成功但无输出 / Success but no output`,
      meta: `task_id=${taskId}`,
      rawJson: raw,
    });
    setStatus(`${model} 成功 / Success`, "ok");
  }
}

// -------- Text-to-Image --------
async function runTextToImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  const model = $("modelSel").value;
  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");
  const n = clampInt($("zN").value, 1, 4, 1);
  
  // 获取当前选中的分辨率
  const selectedRes = $("zRes").value;
  // 根据模型选择正确的分辨率配置对象
  const resolutions = (model === "Qwen-Image-2512") ? Z_RESOLUTIONS_2512 : Z_RESOLUTIONS_STANDARD;
  const [w, h] = resolutions[selectedRes] || [1024, 1024]; // 默认 1024x1024
  const size = `${w}x${h}`;

  setStatus(`${model} 生成中... / Generating...`);
  const payload = {
    prompt,
    model,
    n,
    size
  };
  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const j = await readJsonSafely(res
