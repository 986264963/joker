// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.
// - Downloads images/videos via /dl?url=... (Pages Function) to avoid cross-origin blocks.

const BASE_V1 = "https://ai.gitee.com/v1"; // for reference only (proxied)
const $ = (id) => document.getElementById(id);

const Z_RESOLUTIONS = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 768],
  "16:9 (1024x576)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

// 新增SDXL写实模型分辨率配置（和z-image共用尺寸）
const XL_RESOLUTIONS = {...Z_RESOLUTIONS};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

const WAN_RES_PRESETS = {
  "480p 横屏 / 832x480 (推荐 / Recommended)": [832, 480],
  "480p 竖屏 / 480x832": [480, 832],
  "720p 横屏 / 1280x720": [1280, 720],
  "720p 竖屏 / 720x1280": [720, 1280],
  "1024 方图 / 1024x1024": [1024, 1024],
  "2048 方图 / 2048x2048 (高成本 / Expensive)": [2048, 2048],
};

// 新增SDXL模型ID配置
const XL_MODEL_LIST = {
  "Juggernaut-XL-V9（外景人体全能）": "scenario-labs/juggernaut_reborn",
  "CyberRealistic-XL（皮肤人像细节）": "cyberdelia/cyberrealistic-xl"
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

// 扩展面板显示逻辑，新增xl面板
function showPanel(model) {
  $("panelZ").style.display = model === "z-image" ? "block" : "none";
  $("panelEdit").style.display = model === "Edit-2511" ? "block" : "none";
  $("panelWan").style.display = model === "Wan2.2-I2V-A14B" ? "block" : "none";
  $("panelHunyuan").style.display = model === "HunyuanVideo-1.5" ? "block" : "none";
  $("panelXL").style.display = model === "xl-sd" ? "block" : "none";
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
    b2.href = open