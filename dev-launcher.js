const QR_SIZE = 320;
const QR_FILE_NAME = "sinyuubuturyuu-install-qr.png";

const elements = {
  downloadQrButton: document.getElementById("downloadQrButton"),
  qrImage: document.getElementById("qrImage"),
  statusText: document.getElementById("statusText")
};

void initialize();

function initialize() {
  bindEvents();
  updateInstallArtifacts();
}

function bindEvents() {
  elements.downloadQrButton.addEventListener("click", async () => {
    elements.downloadQrButton.disabled = true;
    try {
      await saveQrImage();
    } catch (error) {
      console.warn("Failed to save QR image:", error);
      setStatus("QR画像の保存に失敗しました。");
    } finally {
      elements.downloadQrButton.disabled = false;
    }
  });
}

function buildInstallUrl() {
  return new URL("./sinyuubuturyuu/index.html", window.location.href).toString();
}

function buildQrImageUrl(text) {
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&format=png&data=${encoded}`;
}

function updateInstallArtifacts() {
  const installUrl = buildInstallUrl();
  const qrUrl = buildQrImageUrl(installUrl);

  elements.qrImage.src = qrUrl;
  elements.qrImage.alt = `sinyuubuturyuu install QR for ${installUrl}`;
}

async function saveQrImage() {
  const qrUrl = buildQrImageUrl(buildInstallUrl());
  const response = await fetch(qrUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("qr_download_failed");
  }

  const qrBlob = await response.blob();

  if (window.showDirectoryPicker) {
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const fileHandle = await directoryHandle.getFileHandle(QR_FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(qrBlob);
      await writable.close();
      setStatus(`選択したフォルダに保存しました: ${QR_FILE_NAME}`);
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
  link.download = QR_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setStatus("このブラウザは保存先フォルダ指定に未対応のため、通常ダウンロードに切り替えました。");
}

function setStatus(message) {
  elements.statusText.textContent = message;
}
