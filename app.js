// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.
// - Downloads images/videos via /dl?url=... (Pages Function) to avoid cross-origin blocks.

const BASE_V1 = "https://ai.gitee.com/v1"; // for reference only (proxied)
const $ = (id) => document.getElementById(id);

// FLUX.2-dev 独立分辨率 (按图1)
const FLUX_RESOLUTIONS = {
  "1:1 (1024x1024)": "1024x1024",
  "4:3 (1024x768)": "1024x768",
  "3:4 (768x1024)": "768x1024",
  "16:9 (1024x576)": "1024x576",
  "9:16 (576x1024)": "576x1024",
  "3:2 (1024x640)": "1024x640",
  "2:3 (640x1024)": "640x1024",
};

// z-image-turbo 独立分辨率 (按图3/4)
const Z_IMAGE_RESOLUTIONS = {
  "1:1 (2048x2048)": "2048x2048",
  "4:3 (2048x1536)": "2048x1536",
  "3:4 (1536x2048)": "1536x2048",
  "3:2 (2048x1360)": "2048x1360",
  "2:3 (1360x2048)": "1360x2048",
  "16:9 (2048x1152)": "2048x1152",
  "9:16 (1152x2048)": "1152x2048",
};

// Qwen-Image-2512 独立分辨率 (按图5/6，注意没有 1:1)
const QWEN_IMAGE_RESOLUTIONS = {
  "4:3 (2048x1536)": "2048x1536",
  "3:4 (1536x2048)": "1536x2048",
  "3:2 (2048x1360)": "2048x1360",
  "2:3 (1360x2048)": "1360x2048",
  "16:9 (2048x1152)": "2048x1152",
  "9:16 (1152x2048)": "1152x2048",
};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

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

function getApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) throw new Error("请输入 API Key / Please enter API Key");
  return key;
}

function rememberKeyMaybe() {
  const key = $("apiKey").value.trim();
  if ($("rememberKey").checked && key) {
    localStorage.setItem("moark_api_key", key);
  } else {
    localStorage.removeItem("moark_api_key");
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

function showPanel(model) {
  $("panelFlux").style.display = model === "flux" ? "block" : "none";
  $("panelZ").style.display = model === "z-image" ? "block" : "none";
  $("panelQwenImage").style.display = model === "qwen-image" ? "block" : "none";
  $("panelEdit").style.display = model === "Edit-2511" ? "block" : "none";
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

// 获取随机种子：如果输入为空、-1、0 或小于0，则生成随机正整数
function getRandomSeed(inputId) {
  const raw = $(inputId).value.trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return Math.floor(Math.random() * 2147483647) + 1;
  }
  return n;
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
    throw new Error(`下载失败 / Download failed (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);
  }
  const blob = await r.blob();
  const objUrl = URL.createObjectURL(blob);
  return { blob, objUrl };
}

// 提取公用的图片处理逻辑
async function handleImageResponse(j, modelName, openAfter) {
  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: `${modelName} 返回无数据 / Empty response`, rawJson: j });
    setStatus(`${modelName} 失败 / Failed`, "err");
    return;
  }

  let successCount = 0;
  for (let i = 0; i < data.length; i++) {
    const item = data[i] || {};
    let blobInfo = null;

    if (item.url) {
      blobInfo = await fetchAsBlob(item.url, "image");
    } else if (item.b64_json) {
      const byteChars = atob(item.b64_json);
      const bytes = new Uint8Array(byteChars.length);
      for (let k = 0; k < byteChars.length; k++) bytes[k] = byteChars.charCodeAt(k);
      const blob = new Blob([bytes], { type: "image/png" });
      blobInfo = { blob, objUrl: URL.createObjectURL(blob) };
    } else {
      addOutputItem({ title: `${modelName} 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `${modelName}-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `${modelName} 输出 #${i+1}`,
      meta: `size=${j.size || "unknown"}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
      openUrl: openAfter ? item.url || blobInfo.objUrl : null,
    });
    successCount++;
  }

  if (successCount > 0) {
    setStatus(`${modelName} 成功 / Success`, "ok");
  } else {
    setStatus(`${modelName} 失败 / Failed`, "err");
  }
}

// -------- FLUX.2-dev --------
async function runFlux() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("fluxPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const size = FLUX_RESOLUTIONS[$("fluxRes").value];
  const steps = clampInt($("fluxSteps").value, 1, 100, 50);
  const guidance = clampFloat($("fluxGuidance").value, 1, 200, 100);
  const seed = getRandomSeed("fluxSeed");
  const openAfter = $("fluxOpenUrl").checked;

  setStatus(`FLUX.2-dev 生成中... (seed=${seed}) / Generating...`);

  // 注意：extra_body 的内容需要平铺到请求体顶层
  const payload = {
    prompt,
    model: "FLUX.2-dev",
    size,
    width: 0,
    height: 0,
    num_inference_steps: steps,
    guidance_scale: guidance,
    seed: seed,
  };

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Failover-Enabled": "true"
    },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("FLUX.2-dev 失败 / Failed", "err");
    addOutputItem({ title: "FLUX.2-dev 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  await handleImageResponse(j, "FLUX.2-dev", openAfter);
}

// -------- z-image-turbo --------
async function runZImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const negative_prompt = $("zNeg").value.trim();
  const size = Z_IMAGE_RESOLUTIONS[$("zRes").value];
  const steps = clampInt($("zSteps").value, 1, 100, 50);
  const seed = getRandomSeed("zSeed");
  const openAfter = $("zOpenUrl")?.checked || false;

  setStatus(`z-image-turbo 生成中... (seed=${seed}) / Generating...`);

  // 注意：extra_body 的内容需要平铺到请求体顶层
  const payload = {
    prompt,
    model: "z-image-turbo",
    size,
    negative_prompt,
    width: 0,
    height: 0,
    num_inference_steps: steps,
    seed: seed,
    lora_weights: [],
    lora_scale: 0,
  };

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Failover-Enabled": "true"
    },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("z-image-turbo 失败 / Failed", "err");
    addOutputItem({ title: "z-image-turbo 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  await handleImageResponse(j, "z-image-turbo", openAfter);
}

// -------- Qwen-Image-2512 --------
async function runQwenImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("qwenImgPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const negative_prompt = $("qwenImgNeg").value.trim();
  const size = QWEN_IMAGE_RESOLUTIONS[$("qwenImgRes").value];
  const steps = clampInt($("qwenImgSteps").value, 1, 20, 4);
  const cfg = clampFloat($("qwenImgCfg").value, 1, 10, 1);
  const seed = getRandomSeed("qwenImgSeed");
  const openAfter = $("qwenImgOpenUrl").checked;

  setStatus(`Qwen-Image-2512 生成中... (seed=${seed}) / Generating...`);

  // 关键修复：把原本放在 extra_body 里的字段全部平铺到顶层
  const payload = {
    prompt,
    model: "Qwen-Image-2512",
    size,
    width: 0,
    height: 0,
    num_inference_steps: steps,
    cfg_scale: cfg,
    seed: seed,
    negative_prompt,
    lora_weights: [],
    lora_scale: 0,
  };

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("Qwen-Image-2512 失败 / Failed", "err");
    addOutputItem({ title: "Qwen-Image-2512 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  await handleImageResponse(j, "Qwen-Image-2512", openAfter);
}

// -------- Edit-2511（图生图） --------
async function runEdit() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const f1 = $("editImg1").files?.[0];
  const f2 = $("editImg2").files?.[0];
  const prompt = $("editPrompt").value.trim();
  if (!f1 || !f2 || !prompt) throw new Error("请上传2张图片并输入提示词 / Please provide 2 images and prompt");

  const taskTypes = Array.from(document.querySelectorAll("input[name='editTaskType']:checked")).map(x => x.value);
  if (!taskTypes.length) throw new Error("至少选择一个 task_types / Choose at least one task type");

  const steps = clampInt($("editSteps").value, 1, 50, 4);
  const guidance = clampFloat($("editGuidance").value, 0, 10, 1.0);

  const fd = new FormData();
  fd.append("prompt", prompt);
  fd.append("model", "Qwen-Image-Edit-2511");
  fd.append("num_inference_steps", String(steps));
  fd.append("guidance_scale", String(guidance));
  for (const t of taskTypes) fd.append("task_types", t);
  fd.append("image", f1, f1.name);
  fd.append("image", f2, f2.name);

  setStatus("Edit-2511 创建任务中... / Creating task...");
  const res = await apiFetch("async/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: fd,
  });

  const j = await readJsonSafely(res);
  if (!res.ok || !j.task_id) {
    setStatus("Edit-2511 创建失败 / Create failed", "err");
    addOutputItem({
      title: "Edit-2511 创建任务失败 / Create failed",
      meta: `HTTP ${res.status}`,
      rawJson: j,
    });
    throw new Error("创建任务失败 / Create failed");
  }

  const taskId = j.task_id;
  setStatus(`Edit-2511 任务已创建，开始轮询... (${taskId.slice(0,8)})`);

  const result = await pollTask(taskId, apiKey, {
    intervalMs: 6000,
    onTick: (info) => {
      const sec = Math.floor(info.elapsedMs / 1000);
      setStatus(`Edit-2511 轮询中... 已等待 ${sec}s • 第 ${info.tick} 次检查 • task=${taskId.slice(0,8)}`);
    },
  });

  addOutputItem({ title: `Edit-2511 任务结果 task=${taskId.slice(0,8)}`, rawJson: result.raw });

  if (result.status !== "success") {
    setStatus("Edit-2511 失败 / Failed", "err");
    throw new Error(`任务失败 / Task failed: ${result.status}`);
  }

  const fileUrl = result.raw?.output?.file_url;
  if (!fileUrl) throw new Error("success 但没有 file_url / no file_url");

  setStatus("Edit-2511 下载中... / Downloading...");
  const { objUrl } = await fetchAsBlob(fileUrl, "image");

  const img = document.createElement("img");
  img.src = objUrl;

  addOutputItem({
    title: "Edit-2511 输出图片",
    meta: `task_id=${taskId}`,
    element: img,
    download: { href: objUrl, filename: `edit-2511-${nowTs()}.png` },
    openUrl: $("editOpenUrl").checked ? fileUrl : null,
  });

  setStatus("Edit-2511 成功 / Success", "ok");
}

// 轮询任务状态
async function pollTask(taskId, apiKey, {timeoutMs=30*60*1000, intervalMs=6000, onTick=null}={}) {
  const start = Date.now();
  let tick = 0;

  while (Date.now() - start < timeoutMs) {
    tick++;
    const elapsedMs = Date.now() - start;

    if (onTick) {
      onTick({ tick, elapsedMs });
    }

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

// ---- init UI ----
function initUi() {
  const initResSelect = (selectId, resolutions, defaultKey) => {
    const sel = $(selectId);
    if (!sel) return;
    for (const k of Object.keys(resolutions)) {
      const o = document.createElement("option");
      o.value = k; o.textContent = k;
      sel.appendChild(o);
    }
    if (defaultKey && resolutions[defaultKey]) sel.value = defaultKey;
  };

  initResSelect("fluxRes", FLUX_RESOLUTIONS, "1:1 (1024x1024)");
  initResSelect("zRes", Z_IMAGE_RESOLUTIONS, "9:16 (1152x2048)");
  initResSelect("qwenImgRes", QWEN_IMAGE_RESOLUTIONS, "9:16 (1152x2048)");

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

  $("btnFluxRun").onclick = async () => {
    try { await runFlux(); }
    catch (e) { addOutputItem({ title:"FLUX.2-dev 错误 / Error", meta:String(e) }); }
  };
  $("btnZRun").onclick = async () => {
    try { await runZImage(); }
    catch (e) { addOutputItem({ title:"z-image-turbo 错误 / Error", meta:String(e) }); }
  };
  $("btnQwenImgRun").onclick = async () => {
    try { await runQwenImage(); }
    catch (e) { addOutputItem({ title:"Qwen-Image-2512 错误 / Error", meta:String(e) }); }
  };
  $("btnEditRun").onclick = async () => {
    try { await runEdit(); }
    catch (e) { addOutputItem({ title:"Edit-2511 错误 / Error", meta:String(e) }); }
  };

  $("btnClearOutput").onclick = clearOutput;
  $("btnClearKey").onclick = clearRememberedKey;

  loadRememberedKey();
}

window.addEventListener("DOMContentLoaded", () => {
  initUi();
  setStatus("准备就绪 / Ready");
});
