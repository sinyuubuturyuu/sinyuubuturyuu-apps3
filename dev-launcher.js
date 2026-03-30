const QR_SIZE = 512;
const GITHUB_PAGES_BASE_URL = "https://sinyuubuturyuu.github.io/sinyuubuturyuu-apps3";
const PROD_INSTALL_PATH = "/sinyuubuturyuu/index.html";
const DEV_INSTALL_PATH = "/dev/sinyuubuturyuu/index.html";

const elements = {
  refreshQrButton: document.getElementById("refreshQrButton"),
  downloadQrButton: document.getElementById("downloadQrButton"),
  qrImage: document.getElementById("qrImage"),
  statusText: document.getElementById("statusText")
};

void initialize();

function initialize() {
  bindEvents();
  void refreshQrImage({ announce: false }).catch((error) => {
    console.warn("Failed to initialize QR image:", error);
    setStatus("QR\u30b3\u30fc\u30c9\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
  });
}

function bindEvents() {
  elements.refreshQrButton.addEventListener("click", async () => {
    await withQrButtonLock(async () => {
      await refreshQrImage({ announce: true });
    });
  });

  elements.downloadQrButton.addEventListener("click", async () => {
    await withQrButtonLock(async () => {
      await saveQrImage();
    });
  });
}

function buildInstallUrl() {
  const baseUrl = getPublicBaseUrl();
  const installPath = isDevMode() ? DEV_INSTALL_PATH : PROD_INSTALL_PATH;
  return new URL(installPath, `${baseUrl}/`).toString();
}

function getPublicBaseUrl() {
  return GITHUB_PAGES_BASE_URL;
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

async function refreshQrImage({ announce }) {
  const installUrl = buildInstallUrl();
  const qrUrl = buildQrImageUrl(installUrl, Date.now());

  await loadQrImage(qrUrl);
  elements.qrImage.src = qrUrl;
  elements.qrImage.alt = `sinyuubuturyuu install QR for ${installUrl}`;

  if (announce) {
    setStatus(`${getEnvironmentLabel()}\u7528\u306e\u6700\u65b0QR\u30b3\u30fc\u30c9\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f\u3002`);
  }
}

async function saveQrImage() {
  const qrUrl = buildQrImageUrl(buildInstallUrl(), Date.now());
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
      setStatus(`\u9078\u629e\u3057\u305f\u30d5\u30a9\u30eb\u30c0\u306b\u4fdd\u5b58\u3057\u307e\u3057\u305f: ${getQrFileName()}`);
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

async function loadQrImage(qrUrl) {
  await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error("qr_image_load_failed"));
    image.src = qrUrl;
  });
}

async function withQrButtonLock(task) {
  setButtonsDisabled(true);
  try {
    await task();
  } catch (error) {
    console.warn("QR action failed:", error);
    setStatus("QR\u30b3\u30fc\u30c9\u306e\u4f5c\u6210\u307e\u305f\u306f\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  elements.refreshQrButton.disabled = disabled;
  elements.downloadQrButton.disabled = disabled;
}

function setStatus(message) {
  elements.statusText.textContent = message;
}
