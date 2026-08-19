// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.[span_0](start_span)[span_0](end_span)
// - Downloads images via /dl?url=... (Pages Function) to avoid cross-origin blocks.[span_1](start_span)[span_1](end_span)

const BASE_V1 = "https://ai.gitee.com/v1";[span_2](start_span)[span_2](end_span)
const $ = (id) => document.getElementById(id);[span_3](start_span)[span_3](end_span)

// 已加回 2048x2048 高清分辨率选项
const Z_RESOLUTIONS = {
  "1:1 (1024x1024)": [1024, 1024],
  "1:1 (2048x2048) [高清]": [2048, 2048],
  "3:4 (768x1024)": [768, 1024],
  "3:4 (1536x2048) [高清]": [1536, 2048],
  "16:9 (1024x576)": [1024, 576],
  "16:9 (2048x1152) [高清]": [2048, 1152],
};

function nowTs() {[span_4](start_span)[span_4](end_span)
  const d = new Date();[span_5](start_span)[span_5](end_span)
  const pad = (n) => String(n).padStart(2, "0");[span_6](start_span)[span_6](end_span)
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;[span_7](start_span)[span_7](end_span)
}

function setStatus(text, kind="info") {[span_8](start_span)[span_8](end_span)
  const badge = $("statusBadge");[span_9](start_span)[span_9](end_span)
  if (!badge) return;[span_10](start_span)[span_10](end_span)

  badge.textContent = text;[span_11](start_span)[span_11](end_span)
  badge.style.borderColor =[span_12](start_span)[span_12](end_span)
    kind === "ok" ? "rgba(37,194,160,.7)" :[span_13](start_span)[span_13](end_span)
    kind === "err" ? "rgba(255,84,112,.75)" :[span_14](start_span)[span_14](end_span)
    "rgba(255,255,255,.10)";[span_15](start_span)[span_15](end_span)

  badge.style.background =[span_16](start_span)[span_16](end_span)
    kind === "ok" ? "rgba(37,194,160,.10)" :[span_17](start_span)[span_17](end_span)
    kind === "err" ? "rgba(255,84,112,.10)" :[span_18](start_span)[span_18](end_span)
    "rgba(255,255,255,.06)";[span_19](start_span)[span_19](end_span)
}

function getApiKey() {[span_20](start_span)[span_20](end_span)
  const key = $("apiKey").value.trim();[span_21](start_span)[span_21](end_span)
  if (!key) throw new Error("请输入 API Key / Please enter API Key");[span_22](start_span)[span_22](end_span)
  return key;[span_23](start_span)[span_23](end_span)
}

function rememberKeyMaybe() {[span_24](start_span)[span_24](end_span)
  const key = $("apiKey").value.trim();[span_25](start_span)[span_25](end_span)
  if ($("rememberKey").checked && key) {[span_26](start_span)[span_26](end_span)
    localStorage.setItem("moark_api_key", key);[span_27](start_span)[span_27](end_span)
  }
}

function loadRememberedKey() {[span_28](start_span)[span_28](end_span)
  const key = localStorage.getItem("moark_api_key") || "";[span_29](start_span)[span_29](end_span)
  if (key) {[span_30](start_span)[span_30](end_span)
    $("apiKey").value = key;[span_31](start_span)[span_31](end_span)
    $("rememberKey").checked = true;[span_32](start_span)[span_32](end_span)
  }
}

function clearRememberedKey() {[span_33](start_span)[span_33](end_span)
  localStorage.removeItem("moark_api_key");[span_34](start_span)[span_34](end_span)
  $("apiKey").value = "";[span_35](start_span)[span_35](end_span)
  $("rememberKey").checked = false;[span_36](start_span)[span_36](end_span)
}

function addOutputItem({title, kind="info", meta="", element=null, rawJson=null, download=null}) {[span_37](start_span)[span_37](end_span)
  const out = $("output");[span_38](start_span)[span_38](end_span)
  const box = document.createElement("div");[span_39](start_span)[span_39](end_span)
  box.className = "item";[span_40](start_span)[span_40](end_span)

  const h = document.createElement("h3");[span_41](start_span)[span_41](end_span)
  h.textContent = title;[span_42](start_span)[span_42](end_span)
  box.appendChild(h);[span_43](start_span)[span_43](end_span)

  if (meta) {[span_44](start_span)[span_44](end_span)
    const m = document.createElement("div");[span_45](start_span)[span_45](end_span)
    m.className = "meta";[span_46](start_span)[span_46](end_span)
    m.textContent = meta;[span_47](start_span)[span_47](end_span)
    box.appendChild(m);[span_48](start_span)[span_48](end_span)
  }

  if (element) box.appendChild(element);[span_49](start_span)[span_49](end_span)

  if (rawJson) {[span_50](start_span)[span_50](end_span)
    const pre = document.createElement("pre");[span_51](start_span)[span_51](end_span)
    pre.textContent = JSON.stringify(rawJson, null, 2);[span_52](start_span)[span_52](end_span)
    box.appendChild(pre);[span_53](start_span)[span_53](end_span)
  }

  if (download) {[span_54](start_span)[span_54](end_span)
    const btn = document.createElement("a");[span_55](start_span)[span_55](end_span)
    btn.className = "btn";[span_56](start_span)[span_56](end_span)
    btn.textContent = "下载 / Download";[span_57](start_span)[span_57](end_span)
    btn.href = download.href;[span_58](start_span)[span_58](end_span)
    btn.download = download.filename || "";[span_59](start_span)[span_59](end_span)
    btn.target = "_blank";[span_60](start_span)[span_60](end_span)
    btn.rel = "noopener";[span_61](start_span)[span_61](end_span)
    const row = document.createElement("div");[span_62](start_span)[span_62](end_span)
    row.className = "row";[span_63](start_span)[span_63](end_span)
    row.appendChild(btn);[span_64](start_span)[span_64](end_span)
    box.appendChild(row);[span_65](start_span)[span_65](end_span)
  }

  out.prepend(box);[span_66](start_span)[span_66](end_span)
  return box;
}

function clearOutput() {[span_67](start_span)[span_67](end_span)
  $("output").innerHTML = "";[span_68](start_span)[span_68](end_span)
}

async function apiFetch(path, {method="GET", headers={}, body=null, signal=null}={}) {[span_69](start_span)[span_69](end_span)
  const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, {[span_70](start_span)[span_70](end_span)
    method,[span_71](start_span)[span_71](end_span)
    headers,[span_72](start_span)[span_72](end_span)
    body,[span_73](start_span)[span_73](end_span)
    signal,[span_74](start_span)[span_74](end_span)
  });
  return res;[span_75](start_span)[span_75](end_span)
}

async function dlFetch(url, {signal=null}={}) {[span_76](start_span)[span_76](end_span)
  const u = `/dl?url=${encodeURIComponent(url)}`;[span_77](start_span)[span_77](end_span)
  const res = await fetch(u, {method:"GET", signal});[span_78](start_span)[span_78](end_span)
  return res;[span_79](start_span)[span_79](end_span)
}

async function readJsonSafely(res) {[span_80](start_span)[span_80](end_span)
  const text = await res.text();[span_81](start_span)[span_81](end_span)
  try {[span_82](start_span)[span_82](end_span)
    return JSON.parse(text);[span_83](start_span)[span_83](end_span)
  } catch {[span_84](start_span)[span_84](end_span)
    return { _text: text };[span_85](start_span)[span_85](end_span)
  }
}

function clampInt(v, lo, hi, defv) {[span_86](start_span)[span_86](end_span)
  const n = Number.parseInt(String(v), 10);[span_87](start_span)[span_87](end_span)
  if (Number.isFinite(n)) return Math.max(lo, Math.min(hi, n));[span_88](start_span)[span_88](end_span)
  return defv;[span_89](start_span)[span_89](end_span)
}

async function fetchAsBlob(url) {[span_90](start_span)[span_90](end_span)
  const r = await dlFetch(url);[span_91](start_span)[span_91](end_span)
  if (!r.ok) {[span_92](start_span)[span_92](end_span)
    const j = await readJsonSafely(r);[span_93](start_span)[span_93](end_span)
    throw new Error(`下载失败 / Download failed (${r.status}): ${JSON.stringify(j).slice(0, 240)}`);[span_94](start_span)[span_94](end_span)
  }
  const blob = await r.blob();[span_95](start_span)[span_95](end_span)
  const objUrl = URL.createObjectURL(blob);[span_96](start_span)[span_96](end_span)
  return { blob, objUrl };[span_97](start_span)[span_97](end_span)
}

// -------- 文生图统一调用（已对齐官方 API，支持高分辨率及 extra_body）--------
async function runZImage() {
  const apiKey = getApiKey();[span_98](start_span)[span_98](end_span)
  rememberKeyMaybe();[span_99](start_span)[span_99](end_span)

  const prompt = $("zPrompt").value.trim();[span_100](start_span)[span_100](end_span)
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");[span_101](start_span)[span_101](end_span)

  const model = $("zModelSel").value; 
  const n = clampInt($("zN").value, 1, 4, 1);[span_102](start_span)[span_102](end_span)
  const [w, h] = Z_RESOLUTIONS[$("zRes").value];[span_103](start_span)[span_103](end_span)
  const size = `${w}x${h}`;[span_104](start_span)[span_104](end_span)

  const seedInput = $("zSeed").value.trim();
  const seed = (seedInput === "" || Number(seedInput) < 0) 
    ? Math.floor(Math.random() * 2147483647) 
    : Number.parseInt(seedInput, 10);

  setStatus(`${model} (${size}) 生成中... / Generating...`);[span_105](start_span)[span_105](end_span)
  
  // 严格对齐官方 API 文档中的 extra_body 参数及高画质步数
  const isTurbo = model === "z-image-turbo";
  const payload = { 
    prompt, 
    model, 
    n, 
    size, 
    seed,
    extra_body: {
      width: 0,
      height: 0,
      num_inference_steps: isTurbo ? 9 : 4,
      cfg_scale: 1,
      seed: seed,
      negative_prompt: "",
      lora_weights: [],
      lora_scale: 0
    }
  };[span_106](start_span)[span_106](end_span)

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  
  // 针对 turbo 模型开启容灾/高分辨率支持头
  if (isTurbo) {
    headers["X-Failover-Enabled"] = "true";
  }

  const res = await apiFetch("images/generations", {[span_107](start_span)[span_107](end_span)
    method: "POST",[span_108](start_span)[span_108](end_span)
    headers,[span_109](start_span)[span_109](end_span)
    body: JSON.stringify(payload),[span_110](start_span)[span_110](end_span)
  });

  const j = await readJsonSafely(res);[span_111](start_span)[span_111](end_span)
  if (!res.ok) {[span_112](start_span)[span_112](end_span)
    setStatus(`${model} 失败 / Failed`, "err");[span_113](start_span)[span_113](end_span)
    addOutputItem({ title: `${model} 生成失败 / Failed`, rawJson: j, meta: `HTTP ${res.status}` });[span_114](start_span)[span_114](end_span)
    throw new Error(`API 错误 / API Error (${res.status})`);[span_115](start_span)[span_115](end_span)
  }

  const data = Array.isArray(j.data) ? j.data : [];[span_116](start_span)[span_116](end_span)
  if (!data.length) {[span_117](start_span)[span_117](end_span)
    addOutputItem({ title: `${model} 返回无数据 / Empty response`, rawJson: j });[span_118](start_span)[span_118](end_span)
    setStatus(`${model} 失败 / Failed`, "err");[span_119](start_span)[span_119](end_span)
    return;[span_120](start_span)[span_120](end_span)
  }

  for (let i = 0; i < data.length; i++) {[span_121](start_span)[span_121](end_span)
    const item = data[i] || {};[span_122](start_span)[span_122](end_span)
    let blobInfo = null;[span_123](start_span)[span_123](end_span)

    if (item.url) {[span_124](start_span)[span_124](end_span)
      blobInfo = await fetchAsBlob(item.url);[span_125](start_span)[span_125](end_span)
    } else if (item.b64_json) {[span_126](start_span)[span_126](end_span)
      const byteChars = atob(item.b64_json);[span_127](start_span)[span_127](end_span)
      const bytes = new Uint8Array(byteChars.length);[span_128](start_span)[span_128](end_span)
      for (let k = 0; k < byteChars.length; k++) bytes[k] = byteChars.charCodeAt(k);[span_129](start_span)[span_129](end_span)
      const blob = new Blob([bytes], { type: "image/png" });[span_130](start_span)[span_130](end_span)
      blobInfo = { blob, objUrl: URL.createObjectURL(blob) };[span_131](start_span)[span_131](end_span)
    } else {[span_132](start_span)[span_132](end_span)
      addOutputItem({ title: `${model} 第${i+1}张无数据 / No image data`, rawJson: item });[span_133](start_span)[span_133](end_span)
      continue;[span_134](start_span)[span_134](end_span)
    }

    const img = document.createElement("img");[span_135](start_span)[span_135](end_span)
    img.src = blobInfo.objUrl;[span_136](start_span)[span_136](end_span)

    const filename = `${model}-${size}-${nowTs()}-${i+1}.png`;[span_137](start_span)[span_137](end_span)
    addOutputItem({[span_138](start_span)[span_138](end_span)
      title: `${model} 输出 #${i+1} (${size})`,[span_139](start_span)[span_139](end_span)
      meta: `model=${model}, size=${size}, seed=${seed}, n=${n}`,[span_140](start_span)[span_140](end_span)
      element: img,[span_141](start_span)[span_141](end_span)
      download: { href: blobInfo.objUrl, filename },[span_142](start_span)[span_142](end_span)
    });
  }

  setStatus(`${model} 成功 / Success`, "ok");[span_143](start_span)[span_143](end_span)
}

// ---- 初始化 UI ----
function initUi() {[span_144](start_span)[span_144](end_span)
  const zRes = $("zRes");[span_145](start_span)[span_145](end_span)
  for (const k of Object.keys(Z_RESOLUTIONS)) {[span_146](start_span)[span_146](end_span)
    const o = document.createElement("option");[span_147](start_span)[span_147](end_span)
    o.value = k; o.textContent = k;[span_148](start_span)[span_148](end_span)
    zRes.appendChild(o);[span_149](start_span)[span_149](end_span)
  }
  zRes.value = Object.keys(Z_RESOLUTIONS)[0];[span_150](start_span)[span_150](end_span)

  $("btnZRun").onclick = async () => {[span_151](start_span)[span_151](end_span)
    try { await runZImage(); }[span_152](start_span)[span_152](end_span)
    catch (e) { addOutputItem({ title:"生成错误 / Error", meta:String(e) }); }[span_153](start_span)[span_153](end_span)
  };

  $("btnClearOutput").onclick = clearOutput;[span_154](start_span)[span_154](end_span)
  $("btnClearKey").onclick = clearRememberedKey;[span_155](start_span)[span_155](end_span)

  loadRememberedKey();[span_156](start_span)[span_156](end_span)
}

window.addEventListener("DOMContentLoaded", () => {[span_157](start_span)[span_157](end_span)
  initUi();[span_158](start_span)[span_158](end_span)
  setStatus("准备就绪 / Ready");[span_159](start_span)[span_159](end_span)
});
