const MODELS = [
  { value: "z-image", label: "Z‑Image", panel:"z" },
  { value: "z-image-turbo", label: "Z‑Image‑Turbo(人体性价比)", panel:"zTurbo" },
  { value: "Qwen‑Image‑2512", label: "Qwen‑Image‑2512(亚洲人像优选)", panel:"qwen2512" },
  { value: "HiDream‑I1‑Full", label: "HiDream‑I1‑Full(国产人体强)", panel:"hiDream" },
  { value: "FLUX.2‑dev", label: "FLUX.2‑dev(写实人体天花板)", panel:"flux2Dev" },
  { value: "Edit-2511", label: "Qwen‑Image‑Edit‑2511(局部重绘)", panel:"edit" },
  { value: "Wan2.2-I2V-A14B", label: "Wan2.2-I2V-A14B视频", panel:"wan" },
  { value: "HunyuanVideo-1.5", label: "HunyuanVideo‑1.5视频", panel:"hunyuan" }
];

const Z_RESOLUTIONS = {
  "1:1 (2048x2048)": [2048, 2048],
  "1:1 (1024x1024)": [1024, 1024],
  "3:4 (768x1024)": [768, 1024],
  "4:3 (1024x768)": [1024, 768],
  "16:9 (1024x576)": [1024, 576],
  "9:16 (576x1024)": [576, 1024],
};

// 切换面板
function showPanel(model) {
  document.getElementById("panelZ").style.display = "none";
  document.getElementById("panelZTurbo").style.display = "none";
  document.getElementById("panelQwen2512").style.display = "none";
  document.getElementById("panelHiDream").style.display = "none";
  document.getElementById("panelFlux2Dev").style.display = "none";
  document.getElementById("panelEdit").style.display = "none";
  document.getElementById("panelWan").style.display = "none";
  document.getElementById("panelHunyuan").style.display = "none";

  switch(model){
    case "z-image":
      document.getElementById("panelZ").style.display = "block";
      break;
    case "z-image-turbo":
      document.getElementById("panelZTurbo").style.display = "block";
      break;
    case "Qwen‑Image‑2512":
      document.getElementById("panelQwen2512").style.display = "block";
      break;
    case "HiDream‑I1‑Full":
      document.getElementById("panelHiDream").style.display = "block";
      break;
    case "FLUX.2‑dev":
      document.getElementById("panelFlux2Dev").style.display = "block";
      break;
    case "Edit-2511":
      document.getElementById("panelEdit").style.display = "block";
      break;
    case "Wan2.2-I2V-A14B":
      document.getElementById("panelWan").style.display = "block";
      break;
    case "HunyuanVideo-1.5":
      document.getElementById("panelHunyuan").style.display = "block";
      break;
  }
}

// 获取对应模型宽高
function getCurrentWH(selectedModel){
  let selText;
  switch(selectedModel){
    case "z-image":
      selText = document.getElementById("zRes").value;
      return Z_RESOLUTIONS[selText];
    case "z-image-turbo":
      selText = document.getElementById("zTurboRes").value;
      return Z_RESOLUTIONS[selText];
    case "Qwen‑Image‑2512":
      selText = document.getElementById("qwen2512Res").value;
      return Z_RESOLUTIONS[selText];
    case "HiDream‑I1‑Full":
      selText = document.getElementById("hiDreamRes").value;
      return Z_RESOLUTIONS[selText];
    case "FLUX.2‑dev":
      selText = document.getElementById("flux2DevRes").value;
      return Z_RESOLUTIONS[selText];
    default:
      return [1024,1024];
  }
}

// 获取对应模型步数
function getCurrentSteps(selectedModel){
  switch(selectedModel){
    case "z-image": return Number(document.getElementById("zSteps").value||28);
    case "z-image-turbo": return Number(document.getElementById("zTurboSteps").value||28);
    case "Qwen‑Image‑2512": return Number(document.getElementById("qwen2512Steps").value||30);
    case "HiDream‑I1‑Full": return Number(document.getElementById("hiDreamSteps").value||25);
    case "FLUX.2‑dev": return Number(document.getElementById("flux2DevSteps").value||35);
    default: return 28;
  }
}
