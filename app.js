const $ = (id) => document.getElementById(id);[span_0](start_span)[span_0](end_span)

// 包含高清分辨率选项，解决 2048 报错问题
const Z_RESOLUTIONS = {
  "1:1 (1024x1024)": [1024, 1024],
  "1:1 (2048x2048) [高清]": [2048, 2048],
  "3:4 (768x1024)": [768, 1024],
  "3:4 (1536x2048) [高清]": [1536, 2048],
  "16:9 (1024x576)": [1024, 576],
  "16:9 (2048x1152) [高清]": [2048, 1152],
};

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

function addOutputItem({title, meta="", element=null, rawJson=null, download=null}) {
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

  if (download) {
    const btn = document.createElement("a");
    btn.className = "btn";
    btn.textContent = "下载 / Download";
    btn.href = download.href;
    btn.download = download.filename || "";
    btn.target = "_blank";
    box.appendChild(btn);
  }

  out.prepend(box);
}

// 模型切换联动：根据下拉菜单显示对应的面板
function updateModelPanels() {
  const val = $("modelSel").value;
  const panels = {
    "z-image": "panelZ",
    "Edit-2511": "panelEdit",
    "Wan2.2-I2V-A14B": "panelWan",
    "HunyuanVideo-1.5": "panelHunyuan"
  };

  for (const [mKey, pId] of Object.entries(panels)) {
    const el = $(pId);
    if (el) {
      el.style.display = (mKey === val) ? "block" : "none";
    }
  }
}

// 核心：文生图（含 2048 高清修复及 extra_body 参数）
async function runZImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();
  const prompt = $("zPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词");

  const [w, h] = Z_RESOLUTIONS[$("zRes").value];
  const size = `${w}x${h}`;
  const n = parseInt($("zN").value) || 1;
  const seed = Math.floor(Math.random() * 2147483647);

  setStatus("z-image 生成中...");
  
  // 补全官方要求的 extra_body 参数，解决高清报错
  const payload = {
    prompt,
    model: "z-image",
    n,
    size,
    seed,
    extra_body: {
      width: 0,
      height: 0,
      num_inference_steps: 4,
      cfg_scale: 1,
      seed,
      negative_prompt: "",
      lora_weights: [],
      lora_scale: 0
    }
  };

  const res = await fetch("/api/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const j = await res.json();
  if (!res.ok) {
    setStatus("生成失败", "err");
    addOutputItem({ title: "z-image 失败", rawJson: j });
    throw new Error(`HTTP ${res.status}`);
  }

  const data = Array.isArray(j.data) ? j.data : [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const img = document.createElement("img");
    img.src = item.url;
    addOutputItem({
      title: `z-image 输出 #${i+1} (${size})`,
      meta: `size=${size}, seed=${seed}`,
      element: img,
      download: { href: item.url, filename: `z-image-${size}.png` }
    });
  }
  setStatus("生成成功", "ok");
}

function initUi() {
  const zRes = $("zRes");
  for (const k of Object.keys(Z_RESOLUTIONS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    zRes.appendChild(o);
  }
  zRes.value = Object.keys(Z_RESOLUTIONS)[0];

  // 绑定下拉框切换事件
  $("modelSel").onchange = updateModelPanels;
  updateModelPanels(); // 初始化显示

  $("btnZRun").onclick = async () => { try { await runZImage(); } catch (e) { addOutputItem({ title:"错误", meta:String(e) }); } };
  $("btnClearOutput").onclick = () => { $("output").innerHTML = ""; };
  $("btnClearKey").onclick = () => { localStorage.removeItem("moark_api_key"); $("apiKey").value=""; };

  loadRememberedKey();
}

window.addEventListener("DOMContentLoaded", () => {
  initUi();
  setStatus("准备就绪 / Ready");
});
