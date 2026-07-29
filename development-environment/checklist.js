(function () {
  "use strict";

  const STORAGE_KEY = "development.environment.checklist.v5";
  const sections = [
    {
      id: "required",
      title: "必須確認",
      description: "安全な開発環境切替に必要な7項目だけを確認します。",
      items: [
        { id: "required-branch", label: "当日の日付の作業ブランチで、最新mainを基点にしている", note: "古い開発ブランチを無条件に再利用しない。" },
        { id: "required-scope", label: "変更が開発環境切替に関係するファイルだけである", note: "社員情報訂正などの機能変更を含めない。" },
        { id: "required-config", label: "Firebase設定一式が確認済みの開発用設定である", note: "値を推測せず、任意項目を必須扱いしない。" },
        { id: "required-no-prod", label: "実行コードに本番Firebaseへの接続設定が残っていない", note: "docs内の説明用IDとは分けて確認する。" },
        { id: "required-isolation", label: "Service Worker・キャッシュ・アプリ再利用で本番設定が混ざらない", note: "開発環境の表示も確認する。" },
        { id: "required-checks", label: "構文確認とgit diff --checkが成功している", note: "変更ファイル一覧と理由も確認する。" },
        { id: "required-external", label: "commit・push・PR・デプロイ・Firebaseデータ変更をしていない", note: "別途明示された操作がある場合は、その内容が報告されている。" }
      ]
    }
  ];

  const totalItems = sections.reduce(function (sum, section) {
    return sum + section.items.length;
  }, 0);

  const elements = {
    checklistSections: document.getElementById("checklistSections"),
    overallProgressText: document.getElementById("overallProgressText"),
    overallProgressBar: document.getElementById("overallProgressBar"),
    overallProgressCaption: document.getElementById("overallProgressCaption"),
    resetChecklistButton: document.getElementById("resetChecklistButton"),
    copyPromptButton: document.getElementById("copyPromptButton"),
    codexPromptText: document.getElementById("codexPromptText"),
    copyPromptStatus: document.getElementById("copyPromptStatus")
  };

  let checkedMap = loadState();

  render();
  bindEvents();
  updateSummary();
  updateSectionStates();

  function bindEvents() {
    elements.checklistSections.addEventListener("change", function (event) {
      const checkbox = event.target.closest("input[type='checkbox'][data-item-id]");
      if (!checkbox) return;
      checkedMap[checkbox.dataset.itemId] = checkbox.checked;
      saveState();
      updateSummary();
      updateSectionStates();
    });

    elements.resetChecklistButton.addEventListener("click", function () {
      if (!window.confirm("チェックをすべて外しますか？")) return;
      checkedMap = {};
      saveState();
      elements.checklistSections.querySelectorAll("input[type='checkbox'][data-item-id]").forEach(function (checkbox) {
        checkbox.checked = false;
      });
      updateSummary();
      updateSectionStates();
    });

    if (elements.copyPromptButton && elements.codexPromptText) {
      elements.copyPromptButton.addEventListener("click", copyPromptText);
    }
  }

  async function copyPromptText() {
    const promptText = elements.codexPromptText ? elements.codexPromptText.textContent : "";
    if (!promptText) {
      setCopyPromptStatus("依頼文が見つかりません。", true);
      return;
    }

    elements.copyPromptButton.disabled = true;
    try {
      const copied = await copyTextToClipboard(promptText);
      if (!copied) {
        selectPromptText();
        throw new Error("copy failed");
      }
      setCopyPromptStatus("依頼文をコピーしました。", false);
    } catch (error) {
      console.warn("Failed to copy prompt text:", error);
      setCopyPromptStatus("自動コピーに失敗しました。選択中の依頼文を Ctrl+C でコピーしてください。", true);
    } finally {
      elements.copyPromptButton.disabled = false;
    }
  }

  async function copyTextToClipboard(text) {
    if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn("Clipboard API failed; using fallback copy:", error);
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.inset = "0 auto auto -9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    return copied;
  }

  function selectPromptText() {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(elements.codexPromptText);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function setCopyPromptStatus(message, isError) {
    if (!elements.copyPromptStatus) return;
    elements.copyPromptStatus.textContent = message;
    elements.copyPromptStatus.dataset.state = isError ? "error" : "info";
  }

  function render() {
    elements.checklistSections.innerHTML = sections.map(function (section) {
      return [
        '<section class="release-section">',
        '  <div class="release-section-head">',
        '    <div class="release-section-title">',
        '      <h3>' + escapeHtml(section.title) + '</h3>',
        '      <span class="section-status" id="section-status-' + escapeHtml(section.id) + '"></span>',
        '    </div>',
        '    <p>' + escapeHtml(section.description) + '</p>',
        '    <p id="section-count-' + escapeHtml(section.id) + '" class="status-text"></p>',
        '  </div>',
        '  <ul class="release-item-list">',
        section.items.map(function (item) {
          const checked = checkedMap[item.id] === true ? " checked" : "";
          return [
            '    <li><label class="release-item">',
            '      <input type="checkbox" data-item-id="' + escapeHtml(item.id) + '"' + checked + '>',
            '      <span class="release-item-copy">',
            '        <span class="release-item-label">' + escapeHtml(item.label) + '</span>',
            '        <span class="release-item-note">' + escapeHtml(item.note) + '</span>',
            '      </span>',
            '    </label></li>'
          ].join("");
        }).join(""),
        '  </ul>',
        '</section>'
      ].join("");
    }).join("");
  }

  function updateSummary() {
    const doneCount = countCheckedItems();
    const percent = totalItems === 0 ? 0 : Math.round((doneCount / totalItems) * 100);
    elements.overallProgressText.textContent = doneCount + " / " + totalItems;
    elements.overallProgressBar.style.width = percent + "%";
    if (doneCount === 0) {
      elements.overallProgressCaption.textContent = "未着手です。まず依頼文と作業範囲を確認してください。";
    } else if (doneCount === totalItems) {
      elements.overallProgressCaption.textContent = "確認完了です。未確認事項がないか最終報告も確認してください。";
    } else {
      elements.overallProgressCaption.textContent = "確認中です。報告と差分を順番に確認してください。";
    }
  }

  function updateSectionStates() {
    sections.forEach(function (section) {
      const doneCount = section.items.reduce(function (sum, item) {
        return sum + (checkedMap[item.id] === true ? 1 : 0);
      }, 0);
      const statusNode = document.getElementById("section-status-" + section.id);
      const countNode = document.getElementById("section-count-" + section.id);
      if (countNode) countNode.textContent = "完了 " + doneCount + " / " + section.items.length;
      if (!statusNode) return;
      if (doneCount === 0) {
        statusNode.dataset.state = "todo";
        statusNode.textContent = "未着手";
      } else if (doneCount === section.items.length) {
        statusNode.dataset.state = "done";
        statusNode.textContent = "完了";
      } else {
        statusNode.dataset.state = "doing";
        statusNode.textContent = "確認中";
      }
    });
  }

  function countCheckedItems() {
    return sections.reduce(function (sum, section) {
      return sum + section.items.reduce(function (sectionSum, item) {
        return sectionSum + (checkedMap[item.id] === true ? 1 : 0);
      }, 0);
    }, 0);
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("Failed to load development environment checklist state:", error);
      return {};
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedMap));
    } catch (error) {
      console.warn("Failed to save development environment checklist state:", error);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
