// Moark Web (Cloudflare Pages/Workers)
// - Calls ai.gitee.com via same-origin proxy: /api/* (Pages Functions) to avoid CORS.
// - Downloads images/videos via /dl?url=... (Pages Function) to avoid cross‑origin blocks.

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

// SDXL 写实人体模型分辨率配置
const XL_RESOLUTIONS = { ...Z_RESOLUTIONS };

// SDXL 模型列表：如果你以后换模型，只改这里
const XL_MODEL_LIST = {
    "Juggernaut‑XL (外景人体全能) ": "scenario_labs/juggernaut_reborn",
    "CyberRealistic‑XL (皮肤人像细节) ": "cyberdelia/cyberrealistic‑xl"
};

const EDIT_TASK_TYPES = ["id", "style", "pose", "layout", "color", "background"];

const WAN_RES_PRESETS = {
    "480p 横屏 / 832×480 (推荐)": [832, 480],
    "480p 竖屏 / 480×832": [480, 832],
    "720p 横屏 / 1280×720": [1280, 720],
    "720p 竖屏 / 720×1280": [720, 1280],
    "1024 方图 / 1024x1024": [1024, 1024],
    "2048 方图 / 2048x2048 (高成本 / Expensive)": [2048, 2048],
};

function nowTs() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function setStatus(text, kind = "info") {
    const badge = $("statusBadge");
    if (!badge) return;
    badge.textContent = text;
    badge.style.borderColor = kind === "ok" ? "rgba(37,194,160,.7)" : kind === "err" ? "rgba(239,68,68,.7)" : "#888";
}

function addOutputHtml(html) {
    const out = $("outputBox");
    const div = document.createElement("div");
    div.innerHTML = html;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
}

function clearOutput() {
    $("outputBox").innerHTML = "";
}

function getApiKey() {
    const input = $("apiKey");
    let token = input.value.trim();
    if (!token) token = localStorage.getItem("moark_token") || "";
    return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function saveRememberKey() {
    const ck = $("rememberKey");
    const val = $("apiKey").value.trim();
    if (ck.checked && val) {
        localStorage.setItem("moark_token", val);
    } else {
        localStorage.removeItem("moark_token");
    }
}

function loadRememberKey() {
    const ck = $("rememberKey");
    const stored = localStorage.getItem("moark_token");
    if (stored) {
        $("apiKey").value = stored;
        ck.checked = true;
    } else {
        ck.checked = false;
    }
}

async function apiFetch(path, payload, method = "POST") {
    const token = getApiKey();
    const resp = await fetch(`/api/${path}`, {
        method,
        headers: {
            "Content‑Type": "application/json",
            "Authorization": token
        },
        body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
}

async function pollTask(taskId) {
    for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const { ok, status, data } = await apiFetch(`tasks/${taskId}`, {}, "GET");
        if (!ok) {
            setStatus(`查询任务失败 ${status}`, "err");
            return null;
        }
        const st = data?.status;
        if (st === "succeeded") return data;
        if (st === "failed") {
            setStatus(`任务失败：${data?.error?.message||""}`,"err");
            return null;
        }
        setStatus(`运行中 ${i}s…`);
    }
    setStatus("任务超时","err");
    return null;
}

async function runZ() {
    const prompt = $("zPrompt").value.trim();
    const neg = $("zNeg").value.trim();
    const n = Number($("zN").value);
    const [w,h] = Z_RESOLUTIONS[$("zRes").value];
    const steps = Number($("zSteps").value);
    const cfg = Number($("zCfg").value);
    const seedRaw = $("zSeed").value.trim();
    const seed = seedRaw ? Number(seedRaw) : undefined;

    if (!prompt) { setStatus("请输入提示词","err"); return; }
    setStatus("提交生成请求…");
    const payload = {
        model:"z‑image",
        prompt,
        negative_prompt:neg||undefined,
        width:w,
        height:h,
        n,
        steps,
        guidance_scale:cfg,
        seed
    };
    const {ok,status,data} = await apiFetch("tasks",payload);
    if(!ok){
        setStatus(`API错误 ${status}`,"err");
        addOutputHtml(`<div><b>z‑image生成失败</b><pre>${JSON.stringify(data,null,2)}</pre></div>`);
        return;
    }
    const tid = data.id;
    addOutputHtml(`<div>任务ID: ${tid}，开始轮询</div>`);
    const res = await pollTask(tid);
    if(!res) return;
    const imgs = res.output?.images||[];
    for(const img of imgs){
        addOutputHtml(`<div><img src="${img.url}" style="max‑width:100%;"/><div>${img.seed}</div></div>`);
    }
    setStatus("完成","ok");
}

async function runXl() {
    const selKey = $("xlModelSel").value;
    const modelId = XL_MODEL_LIST[selKey];
    const prompt = $("xlPrompt").value.trim();
    const neg = $("xlNeg").value.trim();
    const n = Number($("xlN").value);
    const [w,h] = XL_RESOLUTIONS[$("xlRes").value];
    const steps = Number($("xlSteps").value);
    const cfg = Number($("xlCfg").value);
    const seedRaw = $("xlSeed").value.trim();
    const seed = seedRaw ? Number(seedRaw) : undefined;

    if (!prompt) { setStatus("请输入提示词","err"); return; }
    setStatus("提交SDXL生成请求…");
    const payload = {
        model: modelId,
        prompt,
        negative_prompt: neg||undefined,
        width:w,
        height:h,
        n,
        steps,
        guidance_scale:cfg,
        seed
    };
    const {ok,status,data} = await apiFetch("tasks",payload);
    if(!ok){
        setStatus(`SDXL API错误 ${status}`,"err");
        addOutputHtml(`<div><b>SDXL生成失败</b><pre>${JSON.stringify(data,null,2)}</pre></div>`);
        return;
    }
    const tid = data.id;
    addOutputHtml(`<div>SDXL任务ID: ${tid}，开始轮询</div>`);
    const res = await pollTask(tid);
    if(!res) return;
    const imgs = res.output?.images||[];
    for(const img of imgs){
        addOutputHtml(`<div><img src="${img.url}" style="max‑width:100%;"/><div>seed:${img.seed}</div></div>`);
    }
    setStatus("SDXL完成","ok");
}

function buildSelectFromObj(selId, obj){
    const sel = $(selId);
    sel.innerHTML = "";
    for(const label of Object.keys(obj)){
        const opt = document.createElement("option");
        opt.textContent = label;
        opt.value = label;
        sel.appendChild(opt);
    }
}

function switchModelPanel(){
    const v = $("modelSel").value;
    $("panelZ").style.display = v==="z‑image" ? "block":"none";
    $("panelXl").style.display = v==="xl‑sd" ? "block":"none";
    $("panelEdit").style.display = v==="Edit‑2511" ? "block":"none";
    $("panelWan").style.display = (v==="Wan2.2‑I2V‑A14B"||v==="HunyuanVideo‑1.5")?"block":"none";
}

window.onload = ()=>{
    loadRememberKey();
    buildSelectFromObj("zRes", Z_RESOLUTIONS);
    buildSelectFromObj("xlRes", XL_RESOLUTIONS);
    buildSelectFromObj("xlModelSel", XL_MODEL_LIST);
    buildSelectFromObj("wanPresetSel", WAN_RES_PRESETS);

    $("modelSel").addEventListener("change", switchModelPanel);
    $("btnZRun").addEventListener("click", runZ);
    $("btnXlRun").addEventListener("click", runXl);
    $("btnClearOut").addEventListener("click", clearOutput);
    $("btnClearKey").addEventListener("click", ()=>{
        $("apiKey").value="";
        localStorage.removeItem("moark_token");
    });
    $("rememberKey").addEventListener("change", saveRememberKey);

    switchModelPanel();
    setStatus("就绪");
};
