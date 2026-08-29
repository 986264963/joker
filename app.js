// Moark Web - Image Generation Only (4 Models)
// 剔除了视频和编辑功能，仅保留 Z-Image-Turbo, Z-Image, Qwen-Image, Qwen-Image-2512
// 逻辑完全基于你上传的 app.js 重构

const $ = (id) => document.getElementById(id);

// --- 1. 分辨率配置 (严格对应原版) ---
const Z_RESOLUTIONS = {
    "1:1 (2048x2048)": [2048, 2048], "4:3 (2048x1536)": [2048, 1536],
    "3:4 (1536x2048)": [1536, 2048], "3:2 (2048x1360)": [2048, 1360],
    "2:3 (1360x2048)": [1360, 2048], "16:9 (2048x1152)": [2048, 1152],
    "9:16 (1152x2048)": [1152, 2048]
};

const Z_STD_RESOLUTIONS = {
    "1:1 (1024x1024)": [1024, 1024], "1:1 (512x512)": [512, 512],
    "1:1 (256x256)": [256, 256], "4:3 (1024x768)": [1024, 768],
    "3:4 (768x1024)": [768, 1024], "16:9 (1024x576)": [1024, 576],
    "9:16 (576x1024)": [576, 1024], "3:2 (1024x640)": [1024, 640]
};

// --- 2. 工具函数 (保留原版逻辑) ---
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
    if (key) { $("apiKey").value = key; $("rememberKey").checked = true; }
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
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function readJsonSafely(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { _text: text }; }
}

// 代理请求 (避免跨域)
async function apiFetch(path, {method="GET", headers={}, body=null}={}) {
    const res = await fetch(`/api/${path.replace(/^\/+/, "")}`, { method, headers, body });
    return res;
}

// 下载图片处理
async function fetchAsBlob(url) {
    const res = await fetch(url); // 这里假设图片URL可以直接访问，如果跨域可能需要 /dl 代理
    if (!res.ok) throw new Error("下载失败");
    const blob = await res.blob();
    return { blob, objUrl: URL.createObjectURL(blob) };
}

function addOutputItem({title, meta="", element=null, download=null}) {
    const out = $("output");
    const box = document.createElement("div"); box.className = "item";
    const h = document.createElement("h3"); h.textContent = title; box.appendChild(h);
    if (meta) { const m = document.createElement("div"); m.className = "meta"; m.textContent = meta; box.appendChild(m); }
    if (element) box.appendChild(element);
    if (download) {
        const btn = document.createElement("a");
        btn.className = "btn"; btn.textContent = "下载图片";
        btn.href = download.href; btn.download = download.filename; btn.target = "_blank";
        const row = document.createElement("div"); row.className = "row"; row.appendChild(btn);
        box.appendChild(row);
    }
    out.prepend(box);
}

function clearOutput() { $("output").innerHTML = ""; }

// --- 3. 模型生成逻辑 (4个模型) ---

// 通用图片处理逻辑
async function handleImageResponse(res, modelPrefix, metaInfo) {
    const j = await readJsonSafely(res);
    if (!res.ok) throw new Error(j.error?.message || `API Error ${res.status}`);
    
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) throw new Error("API 返回空数据");

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        let blobInfo = null;
        if (item.url) blobInfo = await fetchAsBlob(item.url);
        else if (item.b64_json) {
            const bytes = new Uint8Array(atob(item.b64_json).split('').map(c => c.charCodeAt(0)));
            blobInfo = { blob: new Blob([bytes], {type:"image/png"}), objUrl: URL.createObjectURL(new Blob([bytes])) };
        }
        
        if (blobInfo) {
            const img = document.createElement("img");
            img.src = blobInfo.objUrl;
            const filename = `${modelPrefix}-${nowTs()}-${i+1}.png`;
            addOutputItem({
                title: `${modelPrefix} 输出 #${i+1}`,
                meta: metaInfo,
                element: img,
                download: { href: blobInfo.objUrl, filename }
            });
        }
    }
}

// 1. Z-Image Turbo
async function runZTurbo() {
    const apiKey = getApiKey(); rememberKeyMaybe();
    const prompt = $("zTurboPrompt").value.trim();
    if (!prompt) throw new Error("请输入提示词");
    
    const [w, h] = Z_RESOLUTIONS[$("zTurboRes").value];
    const size = `${w}x${h}`;
    
    setStatus("Z-Image Turbo 生成中...");
    const payload = {
        model: "z-image-turbo",
        prompt: prompt,
        size: size,
        n: 1
    };

    const res = await apiFetch("images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    await handleImageResponse(res, "z-turbo", `size=${size}`);
    setStatus("Z-Image Turbo 成功", "ok");
}

// 2. Z-Image Standard
async function runZStd() {
    const apiKey = getApiKey(); rememberKeyMaybe();
    const prompt = $("zStdPrompt").value.trim();
    if (!prompt) throw new Error("请输入提示词");

    const [w, h] = Z_STD_RESOLUTIONS[$("zStdRes").value];
    const size = `${w}x${h}`;
    const steps = clampInt($("zStdSteps").value, 1, 50, 30);
    const cfg = clampFloat($("zStdCfg").value, 0, 20, 5);
    const seed = clampInt($("zStdSeed").value, 0, 999999999, 0); // 0 为随机

    setStatus("Z-Image Standard 生成中...");
    const payload = {
        model: "z-image",
        prompt: prompt,
        size: size,
        n: 1,
        num_inference_steps: steps,
        guidance_scale: cfg
    };
    if (seed > 0) payload.seed = seed;

    const res = await apiFetch("images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    await handleImageResponse(res, "z-std", `size=${size}, steps=${steps}, cfg=${cfg}`);
    setStatus("Z-Image Standard 成功", "ok");
}

// 3. Qwen-Image
async function runQwen() {
    const apiKey = getApiKey(); rememberKeyMaybe();
    const prompt = $("qwenPrompt").value.trim();
    if (!prompt) throw new Error("请输入提示词");

    const [w, h] = Z_RESOLUTIONS[$("qwenRes").value]; // 复用高分辨率配置
    const size = `${w}x${h}`;
    const steps = clampInt($("qwenSteps").value, 1, 50, 30);
    const cfg = clampFloat($("qwenCfg").value, 0, 20, 4);

    setStatus("Qwen-Image 生成中...");
    const payload = {
        model: "Qwen-Image",
        prompt: prompt,
        size: size,
        n: 1,
        num_inference_steps: steps,
        cfg_scale: cfg
    };

    const res = await apiFetch("images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    await handleImageResponse(res, "qwen", `size=${size}, steps=${steps}, cfg=${cfg}`);
    setStatus("Qwen-Image 成功", "ok");
}

// 4. Qwen-Image-2512
async function runQwen2512() {
    const apiKey = getApiKey(); rememberKeyMaybe();
    const prompt = $("qwen2512Prompt").value.trim();
    if (!prompt) throw new Error("请输入提示词");

    const [w, h] = Z_RESOLUTIONS[$("qwen2512Res").value]; // 复用高分辨率配置
    const size = `${w}x${h}`;
    const steps = clampInt($("qwen2512Steps").value, 1, 50, 4);
    const cfg = clampFloat($("qwen2512Cfg").value, 0, 20, 1);

    setStatus("Qwen-Image-2512 生成中...");
    const payload = {
        model: "Qwen-Image-2512",
        prompt: prompt,
        size: size,
        n: 1,
        num_inference_steps: steps,
        cfg_scale: cfg
    };

    const res = await apiFetch("images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    await handleImageResponse(res, "qwen2512", `size=${size}, steps=${steps}, cfg=${cfg}`);
    setStatus("Qwen-Image-2512 成功", "ok");
}

// --- 4. 初始化 UI ---
function initUi() {
    // 填充分辨率
    const fillSelect = (id, map) => {
        const sel = $(id);
        for (const k of Object.keys(map)) {
            const o = document.createElement("option");
            o.value = k; o.textContent = k;
            sel.appendChild(o);
        }
    };

    fillSelect("zTurboRes", Z_RESOLUTIONS);
    fillSelect("zStdRes", Z_STD_RESOLUTIONS);
    fillSelect("qwenRes", Z_RESOLUTIONS);
    fillSelect("qwen2512Res", Z_RESOLUTIONS);

    // 绑定事件
    $("btnZTurbo").onclick = async () => { try { await runZTurbo(); } catch(e) { setStatus(e.message, "err"); } };
    $("btnZStd").onclick = async () => { try { await runZStd(); } catch(e) { setStatus(e.message, "err"); } };
    $("btnQwen").onclick = async () => { try { await runQwen(); } catch(e) { setStatus(e.message, "err"); } };
    $("btnQwen2512").onclick = async () => { try { await runQwen2512(); } catch(e) { setStatus(e.message, "err"); } };
    $("btnClear").onclick = clearOutput;

    loadRememberedKey();
    setStatus("准备就绪");
}

window.addEventListener("DOMContentLoaded", initUi);
