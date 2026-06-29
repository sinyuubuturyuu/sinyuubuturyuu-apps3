(function () {
  "use strict";

  const quizConfig = window.DRIVER_POINTS_FIREBASE_CONFIG || window.APP_FIREBASE_CONFIG || null;
  const QUIZ_COLLECTION = "daily-safety-quizzes";
  const SERVER_GET_OPTIONS = Object.freeze({ source: "server" });
  const MONTHS = Array.from({ length: 12 }, function (_, index) { return index + 1; });
  const SAMPLE_QUIZZES = Object.freeze([
    {
      category: "交通安全",
      question: "雨の日の運転で特に意識することは？",
      choices: ["速度を控えめにして車間距離を長めに取る", "いつもより車間距離を短くする", "急ブレーキを多く使う", "ライトを消して走る"],
      correctIndex: 0,
      explanation: "雨の日は止まる距離が長くなります。早めの減速と長めの車間距離を意識しましょう。"
    },
    {
      category: "車両整備",
      question: "出発前にタイヤまわりで見るべきことは？",
      choices: ["空気圧不足や損傷がないか", "車内の音楽設定", "配送先の売上", "休憩所の混雑"],
      correctIndex: 0,
      explanation: "タイヤの異常は事故につながります。出発前に空気圧不足や損傷を確認しましょう。"
    },
    {
      category: "運行管理",
      question: "眠気を感じたときに優先すべき行動は？",
      choices: ["安全な場所で休憩する", "窓を開ければ走り続ける", "音楽を大きくして我慢する", "予定を優先して急ぐ"],
      correctIndex: 0,
      explanation: "眠気を感じたら無理をせず、安全な場所で休憩することが大切です。"
    }
  ]);

  const elements = {
    statusText: document.getElementById("statusText"),
    quizForm: document.getElementById("quizForm"),
    categoryInput: document.getElementById("categoryInput"),
    questionInput: document.getElementById("questionInput"),
    choiceInputs: [
      document.getElementById("choice0Input"),
      document.getElementById("choice1Input"),
      document.getElementById("choice2Input"),
      document.getElementById("choice3Input")
    ],
    explanationInput: document.getElementById("explanationInput"),
    allMonthsInput: document.getElementById("allMonthsInput"),
    monthChecks: document.getElementById("monthChecks"),
    enabledInput: document.getElementById("enabledInput"),
    saveButton: document.getElementById("saveButton"),
    cancelEditButton: document.getElementById("cancelEditButton"),
    sampleButton: document.getElementById("sampleButton"),
    reloadButton: document.getElementById("reloadButton"),
    quizCountText: document.getElementById("quizCountText"),
    quizList: document.getElementById("quizList")
  };

  const state = {
    db: null,
    user: null,
    quizzes: [],
    editingId: "",
    busy: false
  };

  void initialize();

  async function initialize() {
    renderMonthChecks();
    bindEvents();
    setStatus("読み込んでいます...");
    try {
      await initializeDb();
      await loadQuizzes();
      setStatus("");
    } catch (error) {
      console.warn("Failed to initialize daily safety quiz admin:", error);
      setStatus("初期化に失敗しました: " + formatError(error), true);
    }
  }

  function bindEvents() {
    elements.quizForm.addEventListener("submit", function (event) {
      event.preventDefault();
      void saveQuiz();
    });
    elements.cancelEditButton.addEventListener("click", resetForm);
    elements.sampleButton.addEventListener("click", function () {
      void addSampleQuizzes();
    });
    elements.reloadButton.addEventListener("click", function () {
      void loadQuizzes();
    });
    elements.allMonthsInput.addEventListener("change", syncMonthInputs);
  }

  function renderMonthChecks() {
    elements.monthChecks.innerHTML = MONTHS.map(function (month) {
      return [
        '<label class="month-check">',
        '<input type="checkbox" data-month-value="' + String(month) + '">',
        '<span>' + String(month) + "月</span>",
        "</label>"
      ].join("");
    }).join("");
  }

  function syncMonthInputs() {
    const disabled = elements.allMonthsInput.checked;
    elements.monthChecks.querySelectorAll("input[data-month-value]").forEach(function (input) {
      input.disabled = disabled;
      if (disabled) {
        input.checked = false;
      }
    });
  }

  async function initializeDb() {
    if (!quizConfig || !firebase || !firebase.apps) {
      throw new Error("Firebase config is missing.");
    }

    const appName = "daily-safety-quiz-admin";
    const app = firebase.apps.some(function (currentApp) { return currentApp.name === appName; })
      ? firebase.app(appName)
      : firebase.initializeApp(quizConfig, appName);
    const auth = app.auth();
    const authApi = window.DevFirebaseAuth;

    if (authApi && typeof authApi.ensureCompatUser === "function") {
      state.user = await authApi.ensureCompatUser(auth, { waitMs: 5000 });
    } else if (authApi && typeof authApi.getCurrentUser === "function") {
      state.user = await authApi.getCurrentUser({ waitMs: 5000 });
    } else {
      state.user = auth.currentUser || null;
    }

    if (!state.user) {
      throw new Error("Please sign in.");
    }

    state.db = app.firestore();
  }

  async function loadQuizzes() {
    if (!state.db) return;
    setBusy(true);
    setStatus("問題を読み込んでいます...");
    try {
      const snapshot = await state.db.collection(QUIZ_COLLECTION).get(SERVER_GET_OPTIONS);
      state.quizzes = snapshot.docs.map(function (docSnapshot) {
        return {
          id: docSnapshot.id,
          data: normalizeQuiz(docSnapshot.data() || {})
        };
      }).sort(compareQuiz);
      renderQuizList();
      setStatus("");
    } catch (error) {
      console.warn("Failed to load quizzes:", error);
      setStatus("問題の読み込みに失敗しました: " + formatError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function normalizeQuiz(data) {
    return {
      category: normalizeText(data.category) || "交通安全",
      question: normalizeText(data.question),
      choices: Array.isArray(data.choices) ? data.choices.map(normalizeText).slice(0, 4) : [],
      correctIndex: normalizeCorrectIndex(data.correctIndex),
      explanation: normalizeText(data.explanation),
      enabled: data.enabled !== false,
      monthKeys: normalizeMonthKeys(data.monthKeys),
      quizNumber: Number(data.quizNumber || 0),
      randomKey: Number(data.randomKey || 0)
    };
  }

  function compareQuiz(left, right) {
    if (left.data.enabled !== right.data.enabled) {
      return left.data.enabled ? -1 : 1;
    }
    if (left.data.quizNumber !== right.data.quizNumber) {
      return left.data.quizNumber - right.data.quizNumber;
    }
    return left.data.question.localeCompare(right.data.question, "ja", { numeric: true, sensitivity: "base" });
  }

  function renderQuizList() {
    const quizzes = state.quizzes || [];
    elements.quizCountText.textContent = quizzes.length ? String(quizzes.length) + "問" : "";
    if (!quizzes.length) {
      elements.quizList.innerHTML = '<div class="quiz-empty">まだ問題がありません。</div>';
      return;
    }

    elements.quizList.innerHTML = quizzes.map(function (entry) {
      const quiz = entry.data;
      return [
        '<article class="quiz-item" data-quiz-id="' + escapeHtml(entry.id) + '">',
        '<div class="quiz-item-head">',
        '<p class="quiz-item-title">' + escapeHtml(quiz.question) + "</p>",
        '<span class="quiz-badge ' + (quiz.enabled ? "enabled" : "disabled") + '">' + (quiz.enabled ? "有効" : "無効") + "</span>",
        "</div>",
        '<div class="quiz-badges">',
        '<span class="quiz-badge">' + escapeHtml(quiz.category) + "</span>",
        '<span class="quiz-badge">' + escapeHtml(formatMonthKeys(quiz.monthKeys)) + "</span>",
        '<span class="quiz-badge">正解 ' + String(quiz.correctIndex + 1) + "</span>",
        "</div>",
        '<div class="quiz-item-actions">',
        '<button class="mini-button" type="button" data-action="edit">編集</button>',
        '<button class="mini-button" type="button" data-action="toggle">' + (quiz.enabled ? "無効にする" : "有効にする") + "</button>",
        '<button class="mini-button danger" type="button" data-action="delete">削除</button>',
        "</div>",
        "</article>"
      ].join("");
    }).join("");

    elements.quizList.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        const item = event.target.closest("[data-quiz-id]");
        const quizId = item ? item.dataset.quizId : "";
        const action = event.target.dataset.action;
        const entry = state.quizzes.find(function (current) { return current.id === quizId; });
        if (!entry) return;
        if (action === "edit") {
          startEdit(entry);
        } else if (action === "toggle") {
          void toggleQuiz(entry);
        } else if (action === "delete") {
          void deleteQuiz(entry);
        }
      });
    });
  }

  function startEdit(entry) {
    const quiz = entry.data;
    state.editingId = entry.id;
    elements.categoryInput.value = quiz.category;
    elements.questionInput.value = quiz.question;
    elements.choiceInputs.forEach(function (input, index) {
      input.value = quiz.choices[index] || "";
    });
    const correctInput = elements.quizForm.querySelector('input[name="correctChoice"][value="' + String(quiz.correctIndex) + '"]');
    if (correctInput) correctInput.checked = true;
    elements.explanationInput.value = quiz.explanation;
    elements.enabledInput.checked = quiz.enabled;
    elements.allMonthsInput.checked = quiz.monthKeys.includes("all");
    elements.monthChecks.querySelectorAll("input[data-month-value]").forEach(function (input) {
      input.checked = quiz.monthKeys.includes(input.dataset.monthValue);
    });
    syncMonthInputs();
    elements.cancelEditButton.hidden = false;
    elements.saveButton.textContent = "更新";
    elements.questionInput.focus();
  }

  function resetForm() {
    state.editingId = "";
    elements.quizForm.reset();
    elements.categoryInput.value = "交通安全";
    elements.enabledInput.checked = true;
    elements.allMonthsInput.checked = true;
    syncMonthInputs();
    elements.cancelEditButton.hidden = true;
    elements.saveButton.textContent = "保存";
  }

  async function addSampleQuizzes() {
    if (!state.db || state.busy) return;
    if (!window.confirm("サンプル問題を3問追加しますか？")) return;
    setBusy(true);
    setStatus("サンプル問題を追加しています...");
    try {
      const batch = state.db.batch();
      const now = firebase.firestore.FieldValue.serverTimestamp();
      SAMPLE_QUIZZES.forEach(function (quiz, index) {
        const ref = state.db.collection(QUIZ_COLLECTION).doc();
        batch.set(ref, {
          category: quiz.category,
          question: quiz.question,
          choices: quiz.choices.slice(),
          correctIndex: quiz.correctIndex,
          explanation: quiz.explanation,
          enabled: true,
          monthKeys: ["all"],
          quizNumber: Date.now() + index,
          randomKey: Math.random(),
          createdAt: now,
          updatedAt: now,
          updatedBy: state.user && state.user.email ? state.user.email : ""
        });
      });
      await batch.commit();
      setStatus("サンプル問題を追加しました。");
      await loadQuizzes();
    } catch (error) {
      console.warn("Failed to add sample quizzes:", error);
      setStatus("サンプル問題の追加に失敗しました: " + formatError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuiz() {
    if (!state.db || state.busy) return;
    const payload = buildPayload();
    if (!payload) return;

    setBusy(true);
    try {
      if (state.editingId) {
        await state.db.collection(QUIZ_COLLECTION).doc(state.editingId).set({
          ...payload,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: state.user && state.user.email ? state.user.email : ""
        }, { merge: true });
        setStatus("問題を更新しました。");
      } else {
        const docRef = state.db.collection(QUIZ_COLLECTION).doc();
        await docRef.set({
          ...payload,
          quizNumber: Date.now(),
          randomKey: Math.random(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: state.user && state.user.email ? state.user.email : "",
          updatedBy: state.user && state.user.email ? state.user.email : ""
        });
        setStatus("問題を追加しました。");
      }
      resetForm();
      await loadQuizzes();
    } catch (error) {
      console.warn("Failed to save quiz:", error);
      setStatus("保存に失敗しました: " + formatError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    const choices = elements.choiceInputs.map(function (input) { return normalizeText(input.value); });
    const correctInput = elements.quizForm.querySelector('input[name="correctChoice"]:checked');
    const correctIndex = correctInput ? Number(correctInput.value) : 0;
    const monthKeys = getSelectedMonthKeys();
    const payload = {
      category: normalizeText(elements.categoryInput.value) || "交通安全",
      question: normalizeText(elements.questionInput.value),
      choices,
      correctIndex,
      explanation: normalizeText(elements.explanationInput.value),
      enabled: elements.enabledInput.checked,
      monthKeys
    };

    if (!payload.question) {
      setStatus("問題文を入力してください。", true);
      return null;
    }
    if (choices.some(function (choice) { return !choice; })) {
      setStatus("選択肢を4つ入力してください。", true);
      return null;
    }
    if (!payload.explanation) {
      setStatus("不正解時の解説を入力してください。", true);
      return null;
    }
    if (!monthKeys.length) {
      setStatus("出題月を選ぶか、いつでもを選んでください。", true);
      return null;
    }
    return payload;
  }

  function getSelectedMonthKeys() {
    if (elements.allMonthsInput.checked) {
      return ["all"];
    }
    return Array.from(elements.monthChecks.querySelectorAll("input[data-month-value]:checked"))
      .map(function (input) { return input.dataset.monthValue; });
  }

  async function toggleQuiz(entry) {
    if (!state.db || state.busy) return;
    setBusy(true);
    try {
      await state.db.collection(QUIZ_COLLECTION).doc(entry.id).set({
        enabled: !entry.data.enabled,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: state.user && state.user.email ? state.user.email : ""
      }, { merge: true });
      setStatus(entry.data.enabled ? "問題を無効にしました。" : "問題を有効にしました。");
      await loadQuizzes();
    } catch (error) {
      console.warn("Failed to toggle quiz:", error);
      setStatus("切り替えに失敗しました: " + formatError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuiz(entry) {
    if (!state.db || state.busy) return;
    const confirmed = window.confirm("この問題を削除します。元に戻せません。よろしいですか？");
    if (!confirmed) return;
    setBusy(true);
    try {
      await state.db.collection(QUIZ_COLLECTION).doc(entry.id).delete();
      if (state.editingId === entry.id) {
        resetForm();
      }
      setStatus("問題を削除しました。");
      await loadQuizzes();
    } catch (error) {
      console.warn("Failed to delete quiz:", error);
      setStatus("削除に失敗しました: " + formatError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function normalizeCorrectIndex(value) {
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index <= 3 ? index : 0;
  }

  function normalizeMonthKeys(value) {
    const keys = Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : ["all"];
    const valid = keys.filter(function (key) {
      return key === "all" || (MONTHS.map(String).includes(key));
    });
    return valid.length ? Array.from(new Set(valid)) : ["all"];
  }

  function formatMonthKeys(monthKeys) {
    if (!Array.isArray(monthKeys) || monthKeys.includes("all")) {
      return "いつでも";
    }
    return monthKeys.map(function (key) { return key + "月"; }).join(" / ");
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    elements.saveButton.disabled = state.busy;
    elements.reloadButton.disabled = state.busy;
  }

  function setStatus(message, isError) {
    elements.statusText.textContent = message || "";
    elements.statusText.classList.toggle("is-error", Boolean(isError));
  }

  function formatError(error) {
    return error && error.message ? error.message : String(error || "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }
})();
