(function () {
  "use strict";

  const STORAGE_KEY = "dev.releaseChecklist.v1";
  const sections = [
    {
      id: "rules",
      title: "1. Firestore Security Rules の本番化",
      week: "第1週",
      reason: "他の実装より先に、読める人・書ける人の境界を固定する必要があります。",
      items: [
        { id: "rules-current-audit", label: "現状の Firestore Security Rules を棚卸しした" },
        { id: "rules-collections", label: "本番で使うコレクションごとの読み書き権限を整理した" },
        { id: "rules-env-split", label: "dev / prod 分離方針を確定した" },
        { id: "rules-policy", label: "本番用 Rules の設計方針を決定した" },
        { id: "rules-auth-required", label: "未ログインの読み書きを禁止する Rules を定義した" },
        { id: "rules-role-scope", label: "点検画面・管理画面・ポイント管理の権限差を定義した" },
        { id: "rules-test-plan", label: "Rules の確認観点とテストケースを用意した" },
        { id: "rules-ready", label: "本番投入できる Rules に固めた" }
      ]
    },
    {
      id: "auth",
      title: "2. Firebase Authentication の導入",
      week: "第1週-第2週",
      reason: "Rules とセットで認証前提に切り替えないと、後続の社員特定と試験が進みません。",
      items: [
        { id: "auth-method", label: "Authentication 方式を確定した" },
        { id: "auth-login-screen", label: "初期画面をログイン画面化した" },
        { id: "auth-guard", label: "未ログイン時のアクセス制御を入れた" },
        { id: "auth-login-logout", label: "ログイン / ログアウトを実装した" },
        { id: "auth-session", label: "認証状態の維持を確認した" },
        { id: "auth-mobile-check", label: "Android / iPhone で基本ログインを確認した" },
        { id: "auth-error", label: "認証エラー表示を整備した" }
      ]
    },
    {
      id: "employee-link",
      title: "3. 認証による社員特定連携",
      week: "第3週",
      reason: "ログインだけでは業務運用にならないため、認証済み社員として一貫して扱える状態へ移します。",
      items: [
        { id: "employee-mapping", label: "認証ユーザーと社員情報の対応付け方式を決めた" },
        { id: "employee-input", label: "点検入力で認証済み社員情報を使うよう移行した" },
        { id: "employee-admin-view", label: "ログイン後に正しい社員として利用できることを確認した" },
        { id: "employee-points", label: "ポイント加算で認証済み社員を使えるようにした" },
        { id: "employee-settings-reduce", label: "既存の社員設定依存を減らした" },
        { id: "employee-legacy-plan", label: "旧社員設定の段階廃止方針を決めた" }
      ]
    },
    {
      id: "privacy",
      title: "4. 個人情報案内メッセージ整備",
      week: "第1週-第3週",
      reason: "運用開始後に後付けしづらいので、扱う情報・目的・掲載場所を先に固めます。",
      items: [
        { id: "privacy-scope", label: "氏名、メールアドレス、車番、点検入力内容などの取扱範囲を整理した" },
        { id: "privacy-purpose", label: "利用目的を業務運用、記録保存、管理確認、障害対応で整理した" },
        { id: "privacy-company-use", label: "会社業務用アプリであり運用ルール順守が必要と明記した" },
        { id: "privacy-location", label: "個人情報案内の掲載位置を決定した" },
        { id: "privacy-ui", label: "初回案内や画面内説明へ反映した" },
        { id: "privacy-final", label: "個人情報案内文を最終化した" }
      ],
      infoTitle: "個人情報案内メッセージ案",
      infoBody: [
        "本アプリでは、ログイン認証、社員特定、点検記録管理のために、氏名、メールアドレス、車番、点検入力内容などの情報を取り扱います。",
        "取得した情報は、業務運用、記録保存、管理確認、障害対応の目的で利用します。",
        "本アプリは会社業務用です。利用者は会社の指示および運用ルールに従って利用してください。"
      ]
    },
    {
      id: "help",
      title: "5. 利用者向け / 管理者向けヘルプ作成",
      week: "第3週-第4週",
      reason: "実装完了後にまとめて書くと運用の抜け漏れが出るので、画面仕様と並行して固めます。",
      items: [
        { id: "help-user", label: "利用者向けヘルプを作成した" },
        { id: "help-admin", label: "管理者向けヘルプを作成した" },
        { id: "help-flow", label: "画面内説明と業務フロー説明を整理した" },
        { id: "help-errors", label: "困った時の対処と問い合わせ導線を記載した" },
        { id: "help-match", label: "ヘルプ内容と実動作が一致していることを確認した" }
      ]
    },
    {
      id: "integrated-test",
      title: "6. 総合試験",
      week: "第4週",
      reason: "運用開始前に、権限、業務フロー、端末差、キャッシュ差まで通しで確認する必要があります。",
      items: [
        { id: "test-no-login", label: "未ログインで利用できないことを確認した" },
        { id: "test-correct-employee", label: "ログイン後に正しい社員として利用できることを確認した" },
        { id: "test-submit", label: "点検送信が正常であることを確認した" },
        { id: "test-admin", label: "管理画面で確認できることを確認した" },
        { id: "test-edit-delete", label: "修正 / 削除の影響が想定通りであることを確認した" },
        { id: "test-points", label: "ポイント加算が想定通りであることを確認した" },
        { id: "test-device-layout", label: "Android / iPhone / PC で崩れないことを確認した" },
        { id: "test-help-match", label: "ヘルプ内容と実動作が一致していることを確認した" },
        { id: "test-privacy-visible", label: "個人情報案内が適切に表示されることを確認した" },
        { id: "test-cache", label: "キャッシュ起因で旧画面が残らないことを確認した" },
        { id: "test-gh-pages", label: "GitHub Pages 本番環境で確認した" },
        { id: "test-sw", label: "Service Worker / キャッシュ確認を完了した" },
        { id: "test-main-flow", label: "主要業務フローの通しテストを完了した" }
      ]
    },
    {
      id: "release-judge",
      title: "7. 運用開始判定",
      week: "第4週",
      reason: "最後は実装の有無ではなく、運用開始してよい条件が揃ったかで判断します。",
      items: [
        { id: "release-rules", label: "Security Rules が本番運用可能な状態になっている" },
        { id: "release-auth", label: "Authentication が導入されている" },
        { id: "release-employee", label: "認証で社員特定できる" },
        { id: "release-privacy", label: "個人情報案内文が整備されている" },
        { id: "release-help", label: "ヘルプが整備されている" },
        { id: "release-test", label: "総合試験が完了している" },
        { id: "release-runbook", label: "運用開始手順書を作成した" },
        { id: "release-incident", label: "障害時の連絡 / 復旧手順を作成した" },
        { id: "release-go", label: "運用開始判定を実施した" }
      ]
    }
  ];

  const totalItems = sections.reduce(function (sum, section) {
    return sum + section.items.length;
  }, 0);

  const elements = {
    priorityList: document.getElementById("priorityList"),
    checklistSections: document.getElementById("checklistSections"),
    overallProgressText: document.getElementById("overallProgressText"),
    overallProgressBar: document.getElementById("overallProgressBar"),
    overallProgressCaption: document.getElementById("overallProgressCaption"),
    resetChecklistButton: document.getElementById("resetChecklistButton")
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
      const shouldReset = window.confirm("チェックをすべて外します。よろしいですか？");
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
  }

  function render() {
    elements.priorityList.innerHTML = sections.map(function (section) {
      return "<li><strong>" + escapeHtml(section.title) + "</strong><br>" + escapeHtml(section.reason) + "</li>";
    }).join("");

    elements.checklistSections.innerHTML = sections.map(function (section, index) {
      return [
        '<section class="release-section">',
        '  <div class="release-section-head">',
        '    <div class="release-section-top">',
        '      <div class="release-section-tags">',
        '        <span class="section-tag">優先 ' + String(index + 1) + '</span>',
        '        <span class="section-tag">' + escapeHtml(section.week) + '</span>',
        '      </div>',
        '      <span class="section-status" id="section-status-' + escapeHtml(section.id) + '"></span>',
        '    </div>',
        '    <div class="release-section-copy">',
        '      <h2>' + escapeHtml(section.title) + '</h2>',
        '      <p>' + escapeHtml(section.reason) + '</p>',
        '      <p id="section-count-' + escapeHtml(section.id) + '" class="status-text"></p>',
        '    </div>',
        '  </div>',
        renderInfoBox(section),
        '  <ul class="release-item-list">',
        section.items.map(function (item) {
          const checked = checkedMap[item.id] === true ? ' checked' : '';
          return [
            '    <li>',
            '      <label class="release-item">',
            '        <input type="checkbox" data-item-id="' + escapeHtml(item.id) + '"' + checked + '>',
            '        <span class="release-item-copy">',
            '          <span class="release-item-label">' + escapeHtml(item.label) + '</span>',
            '        </span>',
            '      </label>',
            '    </li>'
          ].join('');
        }).join(''),
        '  </ul>',
        '</section>'
      ].join('');
    }).join('');
  }

  function renderInfoBox(section) {
    if (!section.infoTitle || !Array.isArray(section.infoBody) || !section.infoBody.length) {
      return "";
    }

    return [
      '<div class="info-box">',
      '  <h3>' + escapeHtml(section.infoTitle) + '</h3>',
      section.infoBody.map(function (line) {
        return '  <p>' + escapeHtml(line) + '</p>';
      }).join(''),
      '</div>'
    ].join('');
  }

  function updateSummary() {
    const doneCount = countCheckedItems();
    const percent = totalItems === 0 ? 0 : Math.round((doneCount / totalItems) * 100);

    elements.overallProgressText.textContent = doneCount + " / " + totalItems;
    elements.overallProgressBar.style.width = percent + "%";

    if (doneCount === 0) {
      elements.overallProgressCaption.textContent = "未着手です。優先 1 から着手してください。";
      return;
    }

    if (doneCount === totalItems) {
      elements.overallProgressCaption.textContent = "全項目完了です。運用開始判定へ進めます。";
      return;
    }

    elements.overallProgressCaption.textContent = "進行中です。完了率 " + percent + "% です。";
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
        countNode.textContent = "完了 " + doneCount + " / " + totalCount;
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
      statusNode.textContent = "進行中";
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
      console.warn("Failed to load checklist state:", error);
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