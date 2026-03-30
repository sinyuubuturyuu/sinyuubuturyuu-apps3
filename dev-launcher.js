const QR_SIZE = 512;
const GITHUB_PAGES_BASE_URL = "https://sinyuubuturyuu.github.io/sinyuubuturyuu-apps3";
const PROD_INSTALL_PATH = "/sinyuubuturyuu/index.html";
const DEV_INSTALL_PATH = "/dev/sinyuubuturyuu/index.html";
const DEV_LAUNCHER_STORAGE_KEY = "sinyuubuturyuu_dev_launcher_base_url";
let installBaseUrlPromise = null;

const elements = {
  refreshQrButton: document.getElementById("refreshQrButton"),
  selectNoticeFileButton: document.getElementById("selectNoticeFileButton"),
  devModeLink: document.getElementById("devModeLink"),
  downloadQrButton: document.getElementById("downloadQrButton"),
  noticeFileInput: document.getElementById("noticeFileInput"),
  qrImage: document.getElementById("qrImage"),
  installUrlText: document.getElementById("installUrlText"),
  statusText: document.getElementById("statusText")
};

void initialize();

function initialize() {
  bindEvents();
  void refreshQrImage({ announce: false }).catch((error) => {
    console.warn("Failed to initialize QR image:", error);
    setStatus("\u0051\u0052\u30b3\u30fc\u30c9\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
  });
}

function bindEvents() {
  if (elements.refreshQrButton) {
    elements.refreshQrButton.addEventListener("click", async () => {
      await withLauncherButtonsLock(async () => {
        await refreshQrImage({ announce: true, resetBaseUrl: true });
      });
    });
  }

  if (elements.downloadQrButton) {
    elements.downloadQrButton.addEventListener("click", async () => {
      await withLauncherButtonsLock(async () => {
        await saveQrImage();
      });
    });
  }

  if (elements.selectNoticeFileButton && elements.noticeFileInput) {
    elements.selectNoticeFileButton.addEventListener("click", () => {
      elements.noticeFileInput.click();
    });

    elements.noticeFileInput.addEventListener("change", async (event) => {
      await handleSelectedNoticeFile(event.currentTarget);
    });
  }

}

async function openDevMode() {
  if (canOpenLocalDevDirectly()) {
    window.location.assign(buildDevPageUrl(window.location.origin));
    return;
  }

  const savedBaseUrl = loadSavedDevLauncherBaseUrl();
  const input = window.prompt(
    "\u958b\u767a\u74b0\u5883URL\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u4f8b: http://192.168.3.22:8080",
    savedBaseUrl || ""
  );

  if (input === null) {
    return;
  }

  const normalizedBaseUrl = normalizeDevLauncherBaseUrl(input);
  if (!normalizedBaseUrl) {
    window.alert("\u958b\u767a\u74b0\u5883URL\u304c\u4e0d\u6b63\u3067\u3059\u3002\u4f8b: http://192.168.3.22:8080");
    return;
  }

  saveDevLauncherBaseUrl(normalizedBaseUrl);
  window.location.assign(buildDevPageUrl(normalizedBaseUrl));
}

function canOpenLocalDevDirectly() {
  return window.location.protocol === "http:" && isLocalDevHost(window.location.hostname);
}

function isLocalDevHost(hostname) {
  return hostname === "127.0.0.1"
    || hostname === "localhost"
    || /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function normalizeDevLauncherBaseUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    console.warn("Invalid DEV launcher base URL:", error);
    return null;
  }
}

function buildDevPageUrl(baseUrl) {
  return new URL(DEV_INSTALL_PATH, `${baseUrl}/`).toString();
}

function loadSavedDevLauncherBaseUrl() {
  try {
    return window.localStorage.getItem(DEV_LAUNCHER_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Failed to read DEV launcher base URL:", error);
    return "";
  }
}

function saveDevLauncherBaseUrl(baseUrl) {
  try {
    window.localStorage.setItem(DEV_LAUNCHER_STORAGE_KEY, baseUrl);
  } catch (error) {
    console.warn("Failed to save DEV launcher base URL:", error);
  }
}

async function buildInstallUrl(resetBaseUrl = false) {
  const baseUrl = await getInstallBaseUrl(resetBaseUrl);
  const installPath = isDevMode() ? DEV_INSTALL_PATH : PROD_INSTALL_PATH;
  return new URL(installPath, `${baseUrl}/`).toString();
}

async function getInstallBaseUrl(reset = false) {
  if (!installBaseUrlPromise || reset) {
    installBaseUrlPromise = resolveInstallBaseUrl();
  }

  return installBaseUrlPromise;
}

async function resolveInstallBaseUrl() {
  if (!isLocalLauncher()) {
    return GITHUB_PAGES_BASE_URL;
  }

  try {
    const response = await fetch("/__dev/meta", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("dev_meta_fetch_failed");
    }

    const meta = await response.json();
    if (meta && typeof meta.preferredOrigin === "string" && meta.preferredOrigin) {
      return meta.preferredOrigin.replace(/\/$/, "");
    }
  } catch (error) {
    console.warn("Failed to resolve local install base URL:", error);
  }

  return GITHUB_PAGES_BASE_URL;
}

function isLocalLauncher() {
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

function isDevMode() {
  return window.location.pathname.includes("/dev/");
}

function buildQrImageUrl(text, cacheKey = Date.now()) {
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&format=png&data=${encoded}&charset-source=UTF-8&charset-target=UTF-8&ecc=M&margin=12&qzone=4&color=000000&bgcolor=FFFFFF&cb=${cacheKey}`;
}

function getEnvironmentLabel() {
  return isDevMode() ? "DEV" : "\u672c\u756a";
}

function getQrFileName() {
  return isDevMode()
    ? "sinyuubuturyuu-install-qr-dev.png"
    : "sinyuubuturyuu-install-qr.png";
}

async function refreshQrImage({ announce, resetBaseUrl = false }) {
  const installUrl = await buildInstallUrl(resetBaseUrl);
  const qrUrl = buildQrImageUrl(installUrl, Date.now());

  await loadImage(qrUrl);
  if (elements.qrImage) {
    elements.qrImage.src = qrUrl;
    elements.qrImage.alt = `sinyuubuturyuu install QR for ${installUrl}`;
  }
  if (elements.installUrlText) {
    elements.installUrlText.textContent = installUrl;
  }

  if (announce) {
    setStatus(`${getEnvironmentLabel()}\u7528\u306e\u6700\u65b0\u0051\u0052\u30b3\u30fc\u30c9\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f\u3002`);
  }
}

async function saveQrImage() {
  const installUrl = await buildInstallUrl(false);
  const qrUrl = buildQrImageUrl(installUrl, Date.now());
  const response = await fetch(qrUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("qr_download_failed");
  }

  const qrBlob = await response.blob();

  if (window.showDirectoryPicker) {
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const fileHandle = await directoryHandle.getFileHandle(getQrFileName(), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(qrBlob);
      await writable.close();
      setStatus(`\u9078\u629e\u3057\u305f\u30d5\u30a9\u30eb\u30c0\u306b\u4fdd\u5b58\u3057\u307e\u3057\u305f : ${getQrFileName()}`);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus("\u30d5\u30a9\u30eb\u30c0\u9078\u629e\u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002");
        return;
      }
      console.warn("Directory picker save failed, falling back to normal download:", error);
    }
  }

  const objectUrl = URL.createObjectURL(qrBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = getQrFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setStatus("\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u4fdd\u5b58\u5148\u30d5\u30a9\u30eb\u30c0\u6307\u5b9a\u306b\u672a\u5bfe\u5fdc\u306e\u305f\u3081\u3001\u901a\u5e38\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306b\u5207\u308a\u66ff\u3048\u307e\u3057\u305f\u3002");
}

async function handleSelectedNoticeFile(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = file.name || "notice-file";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setStatus(`\u304a\u77e5\u3089\u305b\u30d5\u30a1\u30a4\u30eb\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3057\u307e\u3057\u305f : ${file.name}`);
}

async function loadImage(url) {
  await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = url;
  });
}

async function withLauncherButtonsLock(task) {
  setLauncherButtonsDisabled(true);
  try {
    await task();
  } catch (error) {
    console.warn("Launcher action failed:", error);
    setStatus("\u51e6\u7406\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
  } finally {
    setLauncherButtonsDisabled(false);
  }
}

function setLauncherButtonsDisabled(disabled) {
  if (elements.refreshQrButton) {
    elements.refreshQrButton.disabled = disabled;
  }
  if (elements.downloadQrButton) {
    elements.downloadQrButton.disabled = disabled;
  }
  if (elements.selectNoticeFileButton) {
    elements.selectNoticeFileButton.disabled = disabled;
  }
}

function setStatus(message) {
  if (elements.statusText) {
    elements.statusText.textContent = message;
  }
}
