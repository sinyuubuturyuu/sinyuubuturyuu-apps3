(function () {
  "use strict";

  const STORAGE_KEY = "production.return.checklist.v2";
  const sections = [
    {
      id: "required",
      title: "必須確認",
      description: "本番設定へ安全に戻すための7項目だけを確認します。",
      items: [
        { id: "required-restore", label: "開発環境用の差分を正確に取り除いている", note: "本番値を手入力で再作成せず、記録した環境差分または最新mainを基準に戻す。" },
        { id: "required-config", label: "実行コードのFirebase設定一式が確認済みの本番用設定である", note: "projectIdだけでなく関連する設定値を確認する。" },
        { id: "required-no-dev", label: "開発用の接続設定・表示・キャッシュ名が残っていない", note: "docs内の説明用IDとは分けて確認する。" },
        { id: "required-cache", label: "Service Workerとキャッシュの更新経路が本番用である", note: "古い開発設定が再配信されない。" },
        { id: "required-checks", label: "構文確認とgit diff --checkが成功している", note: "変更ファイル一覧と理由も確認する。" },
        { id: "required-diff", label: "最終差分に意図した機能変更だけが残っている", note: "環境切替だけのブランチをmainへマージしない。" },
        { id: "required-approval", label: "commit・push・PR・マージ・デプロイは別途承認後に行う", note: "Firebaseデータ変更も明示的な許可なしでは行わない。" }
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
      if (!checkbox) {
        return;
      }

      checkedMap[checkbox.dataset.itemId] = checkbox.checked;
      saveState();
      updateSummary();
      updateSectionStates();
    });

    elements.resetChecklistButton.addEventListener("click", function () {
      const shouldReset = window.confirm("チェックをすべて戻しますか？");
      if (!shouldReset) {
        return;
      }

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

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(promptText);
      } else {
        const range = document.createRange();
        range.selectNodeContents(elements.codexPromptText);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const copied = document.execCommand("copy");
        selection.removeAllRanges();
        if (!copied) {
          throw new Error("copy failed");
        }
      }

      setCopyPromptStatus("依頼文をコピーしました。 Codex へそのまま貼り付けてください。", false);
    } catch (error) {
      console.warn("Failed to copy prompt text:", error);
      setCopyPromptStatus("コピーに失敗しました。依頼文を選択して手動でコピーしてください。", true);
    }
  }

  function setCopyPromptStatus(message, isError) {
    if (!elements.copyPromptStatus) {
      return;
    }

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
          const checked = checkedMap[item.id] === true ? ' checked' : '';
          return [
            '    <li>',
            '      <label class="release-item">',
            '        <input type="checkbox" data-item-id="' + escapeHtml(item.id) + '"' + checked + '>',
            '        <span class="release-item-copy">',
            '          <span class="release-item-label">' + escapeHtml(item.label) + '</span>',
            '          <span class="release-item-note">' + escapeHtml(item.note) + '</span>',
            '        </span>',
            '      </label>',
            '    </li>'
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
      elements.overallProgressCaption.textContent = "未着手です。まずは依頼文を Codex へ貼り付けてください。";
      return;
    }

    if (doneCount === totalItems) {
      elements.overallProgressCaption.textContent = "確認完了です。マージ・デプロイは別途承認後に行ってください。";
      return;
    }

    elements.overallProgressCaption.textContent = "確認中です。Codex の報告と手動確認を順番に進めてください。";
  }

  function updateSectionStates() {
    sections.forEach(function (section) {
      const doneCount = section.items.reduce(function (sum, item) {
        return sum + (checkedMap[item.id] === true ? 1 : 0);
      }, 0);
      const totalCount = section.items.length;
      const statusNode = document.getElementById("section-status-" + section.id);
      const countNode = document.getElementById("section-count-" + section.id);

      if (countNode) {
        countNode.textContent = "確認数 " + doneCount + " / " + totalCount;
      }

      if (!statusNode) {
        return;
      }

      if (doneCount === 0) {
        statusNode.dataset.state = "todo";
        statusNode.textContent = "未着手";
        return;
      }

      if (doneCount === totalCount) {
        statusNode.dataset.state = "done";
        statusNode.textContent = "確認完了";
        return;
      }

      statusNode.dataset.state = "doing";
      statusNode.textContent = "確認中";
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
      console.warn("Failed to load production return checklist state:", error);
      return {};
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedMap));
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
