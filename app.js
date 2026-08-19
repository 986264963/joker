const $ = (id) => document.getElementById(id);

const Z_RESOLUTIONS = {
  "1:1 (2048*2048)": [2048, 2048],
  "4:3 (2048*1536)": [2048, 1536],
  "3:4 (1536*2048)": [1536, 2048],
  "3:2 (2048*1360)": [2048, 1360],
  "2:3 (1360*2048)": [1360, 2048],
  "16:9 (2048*1152)": [2048, 1152],
  "9:16 (1152*2048)": [1152, 2048],
  "1:1 (1024*1024)": [1024, 1024],
  "4:3 (1024*768)": [1024, 768],
  "3:4 (768*1024)": [768, 1024],
  "16:9 (1024*576)": [1024, 576],
  "9:16 (576*1024)": [576, 1024],
  "3:2 (1024*640)": [1024, 640],
  "1:1 (512*512)": [512, 512],
  "1:1 (256*256)": [256, 256],
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
  badge.style.borderColor = kind === "ok" ? "rgba(37,194,160,.7)" : kind === "err" ? "rgba(255,84,112,.75)" : "rgba(255,255,255,.10)";
  badge.style.background = kind === "ok" ? "rgba(37,194,160,.10)" : kind === "err" ? "rgba(255,84,112,.10)" : "rgba(255,255,255,.06)";
}

function waitingStatusText(label, tick, elapsedMs) {
  const sec = Math.floor(elapsedMs / 1000);
  return `${label} 轮询中... 已等待 ${sec}s • 第 ${tick} 次检查`;
}

function getApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) throw new Error("请输入 API Key");
  return key;
}

function rememberKeyMaybe() {
  const key = $("apiKey").value.trim();
  if ($("rememberKey")?.checked && key) localStorage.setItem("moark_api_key", key);
}

function loadRememberedKey() {
  const key = localStorage.getItem("moark_api_key") || "";
  if (key) {
    $("apiKey").value = key;
    if ($("rememberKey")) $("rememberKey").checked = true;
  }
}

const T2I_MODELS = ["Qwen-Image-2512", "Z-Image-Turbo"];
const EDIT_MODELS = ["Qwen-Image-Edit-2511", "Qwen-Image-Edit"];

function showPanel(model) {
  const isT2I = T2I_MODELS.includes(model);
  const isEdit = EDIT_MODELS.includes(model);
  $("panelZ").style.display = isT2I ? "block" : "none";
  $("panelEdit").style.display = isEdit ? "block" : "none";
  if (isT2I) $("t2iTitle").textContent = `${model}（文生图）`;
  if (isEdit) $("editTitle").textContent = `${model}（图生图）`;

  // 针对 Z-Image-Turbo 默认推荐 9 步，Qwen 推荐 4 步
  if (model === "Z-Image-Turbo") {
    $("zSteps").value = 9;
  } else if (model === "Qwen-Image-2512") {
    $("zSteps").value = 4;
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
  }

  if (download || openUrl) {
    const row = document.createElement("div");
    row.className = "row";
    if (download) {
      const btn = document.createElement("a");
      btn.className = "btn";
      btn.textContent = "下载图片";
      btn.href = download.href;
      btn.download = download.filename || "";
      btn.target = "_blank";
      row.appendChild(btn);
    }
    if (openUrl) {
      const b2 = document.createElement("a");
      b2.className = "btn";
      b2.textContent = "打开 file_url";
      b2.href = openUrl;
      b2.target = "_blank";
      row.appendChild(b2);
    }
    box.appendChild(row);
  }

  out.prepend(box);
  return box;
}

function clearOutput() { $("output").innerHTML = ""; }

async function apiFetch(path, {method="GET", headers={}, body=null, signal=null}={}) {
  return await fetch(`/api/${path.replace(/^\/+/, "")}`, { method, headers, body, signal });
}

async function dlFetch(url) {
  return await fetch(`/dl?url=${encodeURIComponent(url)}`, { method: "GET" });
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

async function fetchAsBlob(url) {
  const r = await dlFetch(url);
  if (!r.ok) {
    const j = await readJsonSafely(r);
    throw new Error(`下载失败 (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);
  }
  const blob = await r.blob();
  return { blob, objUrl: URL.createObjectURL(blob) };
}

async function pollTask(taskId, apiKey, {timeoutMs=30*60*1000, intervalMs=6000, onTick=null}={}) {
  const start = Date.now();
  let tick = 0;
  while (Date.now() - start < timeoutMs) {
    tick++;
    if (onTick) onTick({ tick, elapsedMs: Date.now() - start });
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
  return { status: "timeout", raw: { status:"timeout" } };
}

// -------- 文生图（核心修复：参数放入 extra_body） --------
async function runTextToImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const model = $("modelSel").value;
  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词");

  const negPrompt = $("zNegPrompt").value.trim();
  const n = clampInt($("zN").value, 1, 4, 1);
  const [w, h] = Z_RESOLUTIONS[$("zRes").value];
  const size = `${w}*${h}`;

  // 获取高级参数
  const steps = clampInt($("zSteps").value, 1, 50, 4);
  const cfg = clampFloat($("zCfg").value, 0, 20, 1);
  const seed = clampInt($("zSeed").value, -1, 2147483647, 0);

  setStatus(`${model} 生成中...`);

  // 严格按照官方 API 要求，将参数封装在 extra_body 中
  const payload = {
    prompt,
    model,
    n,
    size,
    extra_body: {
      width: 0,
      height: 0,
      num_inference_steps: steps,
      cfg_scale: cfg,
      seed: seed,
      negative_prompt: negPrompt,
      lora_weights: [],
      lora_scale: 0
    }
  };

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  // 如果是 Z-Image-Turbo，带上官方截图中的 failover 请求头
  if (model === "Z-Image-Turbo") {
    headers["X-Failover-Enabled"] = "true";
  }

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers: headers,
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

// -------- 图生图 --------
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

function initUi() {
  const zRes = $("zRes");
  for (const k of Object.keys(Z_RESOLUTIONS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    zRes.appendChild(o);
  }
  zRes.value = Object.keys(Z_RESOLUTIONS)[0];

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

  if ($("btnClearOutput")) $("btnClearOutput").onclick = clearOutput;
  if ($("btnClearKey")) $("btnClearKey").onclick = () => { localStorage.removeItem("moark_api_key"); $("apiKey").value = ""; };

  loadRememberedKey();
}

window.addEventListener("DOMContentLoaded", () => {
  initUi();
  setStatus("准备就绪 / Ready");
});
