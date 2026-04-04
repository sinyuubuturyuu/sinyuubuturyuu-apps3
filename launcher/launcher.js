const QR_SIZE = 512;
const GITHUB_PAGES_BASE_URL = "https://sinyuubuturyuu.github.io/sinyuubuturyuu-apps3";
const INSTALL_PATH = "sinyuubuturyuu/index.html";

const elements = {
  selectNoticeFileButton: document.getElementById("selectNoticeFileButton"),
  downloadQrButton: document.getElementById("downloadQrButton"),
  noticeFileInput: document.getElementById("noticeFileInput"),
  qrImage: document.getElementById("qrImage"),
  installUrlText: document.getElementById("installUrlText"),
  statusText: document.getElementById("statusText")
};

void initialize();

function initialize() {
  bindEvents();
  void refreshQrImage().catch((error) => {
    console.warn("Failed to initialize QR image:", error);
    setStatus("QRコードの読み込みに失敗しました。");
  });
}

function bindEvents() {
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

async function buildInstallUrl() {
  const baseUrl = await getInstallBaseUrl();
  return new URL(INSTALL_PATH, `${baseUrl}/`).toString();
}

async function getInstallBaseUrl() {
  return GITHUB_PAGES_BASE_URL;
}

function buildQrImageUrl(text, cacheKey = Date.now()) {
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&format=png&data=${encoded}&charset-source=UTF-8&charset-target=UTF-8&ecc=M&margin=12&qzone=4&color=000000&bgcolor=FFFFFF&cb=${cacheKey}`;
}

function getQrFileName() {
  return "sinyuubuturyuu-install-qr.png";
}

async function refreshQrImage() {
  const installUrl = await buildInstallUrl();
  const qrUrl = buildQrImageUrl(installUrl, Date.now());

  await loadImage(qrUrl);
  if (elements.qrImage) {
    elements.qrImage.src = qrUrl;
    elements.qrImage.alt = `sinyuubuturyuu install QR for ${installUrl}`;
  }
  if (elements.installUrlText) {
    elements.installUrlText.textContent = installUrl;
  }
}

async function saveQrImage() {
  const installUrl = await buildInstallUrl();
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
      setStatus(`選択したフォルダに保存しました : ${getQrFileName()}`);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus("フォルダ選択をキャンセルしました。");
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
  setStatus("このブラウザは保存先フォルダ指定に未対応のため、通常ダウンロードに切り替えました。");
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
  setStatus(`お知らせファイルをダウンロードしました : ${file.name}`);
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
    setStatus("処理に失敗しました。");
  } finally {
    setLauncherButtonsDisabled(false);
  }
}

function setLauncherButtonsDisabled(disabled) {
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
