(function () {
  "use strict";

  const STORAGE_KEY = "development.environment.checklist.v3";
  const sections = [
  {
    "id": "report",
    "title": "変更内容の報告",
    "description": "Codex の完了報告に、依頼した内容の結果が書かれているかを確認します。",
    "items": [
      {
        "id": "report-files",
        "label": "変更ファイル一覧が報告されている。",
        "note": "どこを触ったか人が見返せるようにするためです。"
      },
      {
        "id": "report-projectid",
        "label": "`projectId` が `sinyuubuturyuu-dev` になる確認結果が報告されている。",
        "note": "設定切替が終わったかを先に見るためです。"
      },
      {
        "id": "report-no-prod",
        "label": "`sinyuubuturyuu-86aeb` が対象ファイル内に残っていない確認結果が報告されている。",
        "note": "本番設定が残っていないかを確認するためです。"
      }
    ]
  },
  {
    "id": "manual",
    "title": "手動確認の順番",
    "description": "ここから先は人がパソコン用アプリを開いて確認する内容です。",
    "items": [
      {
        "id": "manual-login",
        "label": "テストユーザー `sinyuu@test.000` / `000000` でログインできる。",
        "note": "認証が開発環境側に向いているかを確かめるためです。"
      },
      {
        "id": "manual-restore",
        "label": "再読み込み後も同じテストユーザーが表示される。",
        "note": "復元の状態も開発環境側で動いているかを見るためです。"
      },
      {
        "id": "manual-tire",
        "label": "`月次タイヤ点検表` でテスト入力・保存ができる。",
        "note": "入力した内容が反映されることまで確認します。"
      },
      {
        "id": "manual-daily",
        "label": "`月次日常点検表` でテスト入力・保存ができる。",
        "note": "入力した内容が反映されることまで確認します。"
      },
      {
        "id": "manual-points",
        "label": "`ポイント管理` でテスト操作・保存ができる。",
        "note": "操作結果が反映されることまで確認します。"
      },
      {
        "id": "manual-directory",
        "label": "`社員名簿` で `testユーザー` が表示される。",
        "note": "社員名簿だけは入力確認をせず、表示確認だけ行います。"
      },
      {
        "id": "manual-prod-safe",
        "label": "本番環境には影響が出ていない。",
        "note": "開発用で行った入力・保存が本番側へ出ていないことを確認します。"
      }
    ]
  },
  {
    "id": "start",
    "title": "作業開始の前提",
    "description": "手動確認まで通っているときだけ、そのブランチで開発を始めます。",
    "items": [
      {
        "id": "start-ready",
        "label": "上の確認が全て終わっている。",
        "note": "確認が終わる前には機能開発を始めません。"
      },
      {
        "id": "start-separate",
        "label": "本番反映時は Firebase 設定を本番用へ戻す別作業にする。",
        "note": "開発用設定のまま本番反映しないためです。"
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
      const shouldReset = window.confirm("チェックをすべて外しますか？");
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

      setCopyPromptStatus("依頼文をコピーしました。Codex へそのまま貼り付けてください。", false);
    } catch (error) {
      console.warn("Failed to copy prompt text:", error);
      setCopyPromptStatus("コピーに失敗しました。依頼文を手動で選択して貼り付けてください。", true);
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
      elements.overallProgressCaption.textContent = "未着手です。まず依頼文を Codex へ貼り付けてください。";
      return;
    }

    if (doneCount == totalItems) {
      elements.overallProgressCaption.textContent = "確認完了です。このブランチで開発を始められます。";
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
        countNode.textContent = "完了" + " " + doneCount + " / " + totalCount;
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
        statusNode.textContent = "完了";
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
      console.warn("Failed to load development environment checklist state:", error);
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
      .replaceAll('\"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
