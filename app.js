// -------- Qwen-Image --------
async function runQwenImage() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("qiPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const [w, h] = Z_RESOLUTIONS[$("qiRes").value];
  const size = `${w}x${h}`;
  const negative_prompt = $("qiNeg").value.trim();
  const num_inference_steps = clampInt($("qiSteps").value, 1, 50, 4);
  const cfg_scale = clampFloat($("qiCfg").value, 0, 10, 1.0);
  const n = clampInt($("qiN").value, 1, 4, 1);
  
  const seedRaw = $("qiSeed").value.trim();
  const seed = seedRaw === "" ? [] : [clampInt(seedRaw, 0, 2147483647, 0)];

  setStatus("Qwen-Image 生成中... / Generating...");
  const payload = {
    prompt,
    model: "Qwen-Image",
    size,
    n,
    extra_body: {
      num_inference_steps,
      cfg_scale,
      seed,
      negative_prompt,
      width: 0,
      height: 0,
      lora_weights: [],
      lora_scale: 0
    }
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
    setStatus("Qwen-Image 失败 / Failed", "err");
    addOutputItem({ title: "Qwen-Image 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: "Qwen-Image 返回无数据 / Empty response", rawJson: j });
    setStatus("Qwen-Image 失败 / Failed", "err");
    return;
  }

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
      addOutputItem({ title: `Qwen-Image 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `qwen-image-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `Qwen-Image 输出 #${i+1}`,
      meta: `size=${size}, steps=${num_inference_steps}, cfg=${cfg_scale}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
    });
  }

  setStatus("Qwen-Image 成功 / Success", "ok");
}

// -------- z-image-turbo --------
async function runZImageTurbo() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("ztPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const [w, h] = Z_RESOLUTIONS[$("ztRes").value];
  const size = `${w}x${h}`;
  const negative_prompt = $("ztNeg").value.trim();
  const num_inference_steps = clampInt($("ztSteps").value, 1, 50, 9);
  const n = clampInt($("ztN").value, 1, 4, 1);
  const failover = $("ztFailover").checked;
  
  const seedRaw = $("ztSeed").value.trim();
  const seed = seedRaw === "" ? [] : [clampInt(seedRaw, 0, 2147483647, 0)];

  setStatus("z-image-turbo 生成中... / Generating...");
  
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (failover) {
    headers["X-Failover-Enabled"] = "true";
  }

  const payload = {
    prompt,
    model: "z-image-turbo",
    size,
    n,
    extra_body: {
      negative_prompt,
      width: 0,
      height: 0,
      num_inference_steps,
      seed,
      lora_weights: [],
      lora_scale: 0
    }
  };

  const res = await apiFetch("images/generations", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const j = await readJsonSafely(res);
  if (!res.ok) {
    setStatus("z-image-turbo 失败 / Failed", "err");
    addOutputItem({ title: "z-image-turbo 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: "z-image-turbo 返回无数据 / Empty response", rawJson: j });
    setStatus("z-image-turbo 失败 / Failed", "err");
    return;
  }

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
      addOutputItem({ title: `z-image-turbo 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `z-image-turbo-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `z-image-turbo 输出 #${i+1}`,
      meta: `size=${size}, steps=${num_inference_steps}, failover=${failover}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
    });
  }

  setStatus("z-image-turbo 成功 / Success", "ok");
}

// -------- Qwen-Image-2512 --------
async function runQwenImage2512() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("q2Prompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const [w, h] = Z_RESOLUTIONS[$("q2Res").value];
  const size = `${w}x${h}`;
  const negative_prompt = $("q2Neg").value.trim();
  const num_inference_steps = clampInt($("q2Steps").value, 1, 50, 4);
  const cfg_scale = clampFloat($("q2Cfg").value, 0, 10, 1.0);
  const n = clampInt($("q2N").value, 1, 4, 1);
  
  const seedRaw = $("q2Seed").value.trim();
  const seed = seedRaw === "" ? [] : [clampInt(seedRaw, 0, 2147483647, 0)];

  setStatus("Qwen-Image-2512 生成中... / Generating...");
  const payload = {
    prompt,
    model: "Qwen-Image-2512",
    size,
    n,
    extra_body: {
      width: 0,
      height: 0,
      num_inference_steps,
      cfg_scale,
      seed,
      negative_prompt,
      lora_weights: [],
      lora_scale: 0
    }
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

  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: "Qwen-Image-2512 返回无数据 / Empty response", rawJson: j });
    setStatus("Qwen-Image-2512 失败 / Failed", "err");
    return;
  }

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
      addOutputItem({ title: `Qwen-Image-2512 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `qwen-image-2512-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `Qwen-Image-2512 输出 #${i+1}`,
      meta: `size=${size}, steps=${num_inference_steps}, cfg=${cfg_scale}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
    });
  }

  setStatus("Qwen-Image-2512 成功 / Success", "ok");
}

// -------- Z-Image --------
async function runZImageBase() {
  const apiKey = getApiKey();
  rememberKeyMaybe();

  const prompt = $("ziPrompt").value.trim();
  if (!prompt) throw new Error("请输入提示词 / Please input prompt");

  const [w, h] = Z_RESOLUTIONS[$("ziRes").value];
  const size = `${w}x${h}`;
  const negative_prompt = $("ziNeg").value.trim();
  const num_inference_steps = clampInt($("ziSteps").value, 1, 100, 30);
  const guidance_scale = clampFloat($("ziGuidance").value, 0, 20, 5.0);
  const n = clampInt($("ziN").value, 1, 4, 1);
  
  const seedRaw = $("ziSeed").value.trim();
  const seed = seedRaw === "" ? [] : [clampInt(seedRaw, -1, 2147483647, -1)];

  setStatus("Z-Image 生成中... / Generating...");
  const payload = {
    prompt,
    model: "Z-Image",
    size,
    n,
    extra_body: {
      guidance_scale,
      num_inference_steps,
      seed,
      lora_weights: [],
      lora_scale: 0,
      width: 0,
      height: 0,
      negative_prompt
    }
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
    setStatus("Z-Image 失败 / Failed", "err");
    addOutputItem({ title: "Z-Image 生成失败 / Failed", rawJson: j, meta: `HTTP ${res.status}` });
    throw new Error(`API 错误 / API Error (${res.status})`);
  }

  const data = Array.isArray(j.data) ? j.data : [];
  if (!data.length) {
    addOutputItem({ title: "Z-Image 返回无数据 / Empty response", rawJson: j });
    setStatus("Z-Image 失败 / Failed", "err");
    return;
  }

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
      addOutputItem({ title: `Z-Image 第${i+1}张无数据 / No image data`, rawJson: item });
      continue;
    }

    const img = document.createElement("img");
    img.src = blobInfo.objUrl;

    const filename = `z-image-base-${nowTs()}-${i+1}.png`;
    addOutputItem({
      title: `Z-Image 输出 #${i+1}`,
      meta: `size=${size}, steps=${num_inference_steps}, guidance=${guidance_scale}`,
      element: img,
      download: { href: blobInfo.objUrl, filename },
    });
  }

  setStatus("Z-Image 成功 / Success", "ok");
}
