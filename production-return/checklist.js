(function () {
  "use strict";

  const STORAGE_KEY = "production.return.checklist.v1";
  const sections = [
    {
      id: "report",
      title: "Codex の完了報告",
      description: "作業完了時の返答に、依頼した確認結果が含まれているかを確認します。",
      items: [
        {
          id: "report-files",
          label: "変更ファイル一覧が報告されている。",
          note: "復帰対象のどのファイルを書き換えたかを確認します。"
        },
        {
          id: "report-projectid",
          label: "`projectId` が `sinyuubuturyuu-86aeb` になる確認結果が報告されている。",
          note: "本番設定へ戻ったことを確認します。"
        },
        {
          id: "report-no-dev",
          label: "`sinyuubuturyuu-dev` が対象ファイル内に残っていない確認結果が報告されている。",
          note: "開発環境向けの設定が残っていないことを確認します。"
        }
      ]
    },
    {
      id: "manual",
      title: "手動確認の順番",
      description: "ここから先は人がパソコン用アプリを開いて確認します。",
      items: [
        {
          id: "manual-login",
          label: "いったんログアウトして、本番用の通常ユーザーでログインした。",
          note: "復帰後のログイン状態を確認する最初の手順です。"
        },
        {
          id: "manual-restore",
          label: "再読み込み後も同じユーザーが表示された。",
          note: "復元状態も本番環境で正常かを確認します。"
        },
        {
          id: "manual-tire",
          label: "`月次タイヤ点検表` で通常の入力と保存ができた。",
          note: "保存内容が通常どおり反映されることまで確認します。"
        },
        {
          id: "manual-daily",
          label: "`月次日常点検表` で通常の入力と保存ができた。",
          note: "保存内容が通常どおり反映されることまで確認します。"
        },
        {
          id: "manual-points",
          label: "`ポイント管理` で通常の操作と保存ができた。",
          note: "確認用の操作結果が通常どおり反映されることを確認します。"
        },
        {
          id: "manual-directory",
          label: "`社員名簿` が正しく表示された。",
          note: "本番で使う社員データが通常どおり見えることを確認します。"
        },
        {
          id: "manual-dev-safe",
          label: "開発環境 `sinyuubuturyuu-dev` に影響が出ていない。",
          note: "本番へ戻した操作が開発環境へ波及していないことを確認します。"
        }
      ]
    },
    {
      id: "merge",
      title: "マージ前の最終確認",
      description: "全部終わってから main へマージします。",
      items: [
        {
          id: "merge-ready",
          label: "上の確認がすべて終わっている。",
          note: "確認が終わる前にマージしません。"
        },
        {
          id: "merge-main",
          label: "この同じ作業ブランチを `main` へマージする準備ができている。",
          note: "新しいブランチは作らず、このブランチのまま進めます。"
        }
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
      elements.overallProgressCaption.textContent = "確認完了です。このブランチを main へマージできます。";
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
