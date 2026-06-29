(function () {
  "use strict";

  const FIREBASE_CONFIG = Object.freeze(getRuntimeFirebaseConfig(window.APP_FIREBASE_CONFIG || window.APP_FIREBASE_DIRECTORY_CONFIG || {}));
  const COLLECTIONS = Object.freeze({
    quizzes: "daily-safety-quizzes",
    answers: "daily-safety-quiz-answers",
    progress: "daily-safety-quiz-progress",
    points: "driver-points"
  });
  const QUIZ_READ_LIMIT = 30;
  const DISPLAY_SETTINGS_STORAGE_KEY = "sinyuubuturyuu.dailySafetyQuizDisplaySettings.v1";
  const DEFAULT_SETTINGS = Object.freeze({
    quizEnabled: true,
    completionImageEnabled: true
  });

  const runtimeState = {
    promise: null,
  };

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeDriverName(value) {
    const text = normalizeText(value)
      .replace(/\s*[（(][^）)]*[）)]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text === "\u672a\u9078\u629e" ? "" : text;
  }

  function normalizeVehicleNumber(value) {
    const text = normalizeText(value)
      .replace(/\s+/g, " ")
      .trim();
    return text === "\u672a\u9078\u629e" ? "" : text;
  }
  function buildDriverKey(driverName) {
    return normalizeDriverName(driverName)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function buildVehicleKey(vehicleNumber) {
    return normalizeVehicleNumber(vehicleNumber)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function buildIdentity(driverName, vehicleNumber) {
    const normalizedDriverName = normalizeDriverName(driverName);
    const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
    const driverKey = buildDriverKey(normalizedDriverName);
    const vehicleKey = buildVehicleKey(normalizedVehicleNumber);
    const summaryKey = `${vehicleKey}|${driverKey}`;
    const driverProgressKey = driverKey || normalizedDriverName || 'unknown';
    return {
      driverName: normalizedDriverName,
      vehicleNumber: normalizedVehicleNumber,
      driverKey,
      vehicleKey,
      summaryKey,
      idSuffix: hashText(summaryKey || `${normalizedVehicleNumber}|${normalizedDriverName}` || "unknown"),
      progressIdSuffix: hashText(driverProgressKey)
    };
  }

  function buildSummaryDocId(identity) {
    return `driver_points_summary_${identity.idSuffix}`;
  }

  function buildEventDocId(eventId) {
    return `driver_points_event_${hashText(eventId)}`;
  }

  function buildLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function buildMonthKey(date = new Date()) {
    return String(date.getMonth() + 1);
  }

  function buildAnsweredQuizKey(dateKey, quizId) {
    return hashText(`${dateKey}|${quizId}`);
  }

  function buildQuizProgressKey(quizId) {
    return hashText(quizId);
  }

  function isLocalDevelopmentHost() {
    const host = window.location.hostname;
    return host === "localhost"
      || host === "127.0.0.1"
      || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
  }

  function shouldUseFirebaseEmulator() {
    return window.APP_USE_FIREBASE_EMULATOR === true && isLocalDevelopmentHost();
  }

  function getRuntimeFirebaseConfig(config) {
    return shouldUseFirebaseEmulator()
      ? { ...(config || {}), ...(window.APP_FIREBASE_EMULATOR_CONFIG || {}) }
      : (config || {});
  }

  function getFirebaseEmulatorRuntime() {
    return {
      authUrl: "http://127.0.0.1:9099",
      firestoreHost: "127.0.0.1",
      firestorePort: 8080,
      ...(window.APP_FIREBASE_EMULATOR || {})
    };
  }

  function connectAuthEmulatorIfNeeded(authModule, auth) {
    if (!shouldUseFirebaseEmulator() || !authModule || typeof authModule.connectAuthEmulator !== "function" || auth.__sinyuubuturyuuQuizEmulatorConnected) {
      return;
    }
    authModule.connectAuthEmulator(auth, getFirebaseEmulatorRuntime().authUrl, { disableWarnings: true });
    auth.__sinyuubuturyuuQuizEmulatorConnected = true;
  }

  function connectFirestoreEmulatorIfNeeded(firestoreModule, db) {
    if (!shouldUseFirebaseEmulator() || !firestoreModule || typeof firestoreModule.connectFirestoreEmulator !== "function" || db.__sinyuubuturyuuQuizEmulatorConnected) {
      return;
    }
    const runtime = getFirebaseEmulatorRuntime();
    firestoreModule.connectFirestoreEmulator(db, runtime.firestoreHost, runtime.firestorePort);
    db.__sinyuubuturyuuQuizEmulatorConnected = true;
  }

  function hasFirebaseConfig() {
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = FIREBASE_CONFIG[key];
      return typeof value === "string" && value.trim();
    });
  }

  async function waitForSignedInUser(authApi, authModule, auth) {
    if (authApi && typeof authApi.getCurrentUser === "function") {
      return authApi.getCurrentUser({ waitMs: 5000 });
    }
    if (auth.currentUser) {
      return auth.currentUser;
    }
    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
      return auth.currentUser || null;
    }
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = () => {};
      const finish = (user) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(user || null);
      };
      unsubscribe = authModule.onAuthStateChanged(auth, (user) => finish(user), () => finish(null));
      window.setTimeout(() => finish(auth.currentUser || null), 5000);
    });
  }

  async function ensureRuntime() {
    if (!hasFirebaseConfig()) {
      throw new Error("Firebase config is missing for daily safety quiz.");
    }
    if (runtimeState.promise) {
      return runtimeState.promise;
    }

    runtimeState.promise = (async () => {
      const [{ getApp, getApps, initializeApp }, authModule, firestoreModule] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js")
      ]);

      const authApi = window.DevFirebaseAuth;
      let app = null;
      let auth = null;
      if (authApi && typeof authApi.ensureRuntime === "function") {
        const sharedRuntime = await authApi.ensureRuntime();
        app = sharedRuntime && sharedRuntime.app ? sharedRuntime.app : null;
        auth = sharedRuntime && sharedRuntime.auth ? sharedRuntime.auth : null;
      }
      if (!app) {
        app = typeof getApps === "function" && getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
      }
      if (!auth) {
        auth = authModule.getAuth(app);
      }
      connectAuthEmulatorIfNeeded(authModule, auth);

      const user = await waitForSignedInUser(authApi, authModule, auth);
      if (!user) {
        throw new Error("ログインしてください。");
      }

      const db = firestoreModule.getFirestore(app);
      connectFirestoreEmulatorIfNeeded(firestoreModule, db);
      return { db, user, firestoreModule };
    })().catch((error) => {
      runtimeState.promise = null;
      throw error;
    });
    return runtimeState.promise;
  }

  function readLocalDisplaySettings() {
    try {
      const raw = window.localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        quizEnabled: data.quizEnabled !== false,
        completionImageEnabled: data.completionImageEnabled !== false
      };
    } catch {
      return null;
    }
  }

  async function loadSettings() {
    return readLocalDisplaySettings() || { ...DEFAULT_SETTINGS };
  }

  async function shouldShowCompletionImage() {
    const settings = await loadSettings();
    return settings.completionImageEnabled !== false;
  }

  async function shouldShowQuiz() {
    const settings = await loadSettings();
    return settings.quizEnabled !== false;
  }

  function ensureStyle() {
    if (document.getElementById("dailySafetyQuizStyle")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "dailySafetyQuizStyle";
    style.textContent = [
      ".daily-safety-quiz-dialog{width:min(520px,calc(100vw - 24px));max-width:100%;border:0;border-radius:20px;padding:0;background:#fff;color:#17202a;box-shadow:0 24px 80px rgba(15,23,42,.28)}",
      ".daily-safety-quiz-dialog::backdrop{background:rgba(8,15,28,.48);backdrop-filter:blur(3px)}",
      ".daily-safety-quiz-panel{display:grid;gap:16px;padding:22px}",
      ".daily-safety-quiz-title{margin:0;font-size:1.2rem;font-weight:800;line-height:1.35}",
      ".daily-safety-quiz-meta{display:inline-flex;width:max-content;max-width:100%;border-radius:999px;background:#eef5ff;color:#1769d2;padding:5px 10px;font-size:.82rem;font-weight:800}",
      ".daily-safety-quiz-question{margin:0;font-size:1.05rem;font-weight:800;line-height:1.6}",
      ".daily-safety-quiz-choices{display:grid;gap:10px}",
      ".daily-safety-quiz-choice{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:10px;width:100%;min-height:54px;border:1px solid #cfd8e4;border-radius:14px;background:#f8fafc;color:#17202a;padding:12px 14px;text-align:left;font:inherit;font-weight:700;cursor:pointer}",
      ".daily-safety-quiz-choice-mark{width:22px;height:22px;border:2px solid #8aa0b8;border-radius:50%;background:#fff;display:inline-block;position:relative}",
      ".daily-safety-quiz-choice.is-selected{border-color:#1769d2;background:#edf5ff}",
      ".daily-safety-quiz-choice.is-selected .daily-safety-quiz-choice-mark{border-color:#1769d2}",
      ".daily-safety-quiz-choice.is-selected .daily-safety-quiz-choice-mark::after{content:'';position:absolute;inset:4px;border-radius:50%;background:#1769d2}",
      ".daily-safety-quiz-actions{display:grid;gap:10px}",
      ".daily-safety-quiz-button{min-height:52px;border:0;border-radius:14px;background:#1769d2;color:#fff;font:inherit;font-weight:800;cursor:pointer}",
      ".daily-safety-quiz-button:disabled{opacity:.55;cursor:not-allowed}",
      ".daily-safety-quiz-secondary{background:#e8eef6;color:#17202a}",
      ".daily-safety-quiz-result{display:grid;gap:12px}",
      ".daily-safety-quiz-result-heading{margin:0;font-size:1.15rem;font-weight:900;line-height:1.45}",
      ".daily-safety-quiz-explanation{margin:0;line-height:1.7;color:#334155;white-space:pre-line}",
      ".daily-safety-quiz-correct-answer{padding:12px;border-radius:12px;background:#f3f8ef;color:#245b2a;font-weight:800;line-height:1.6}",
      "@media (max-width:480px){.daily-safety-quiz-panel{padding:18px}.daily-safety-quiz-title{font-size:1.08rem}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
    dialog.remove();
  }

  function renderDoneDialog(message) {
    ensureStyle();
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "daily-safety-quiz-dialog";
      dialog.innerHTML = [
        '<div class="daily-safety-quiz-panel">',
        '<h2 class="daily-safety-quiz-title">今日の安全ワンポイント</h2>',
        '<p class="daily-safety-quiz-explanation">' + escapeHtml(message) + "</p>",
        '<div class="daily-safety-quiz-actions">',
        '<button class="daily-safety-quiz-button" type="button">完了</button>',
        "</div>",
        "</div>"
      ].join("");
      dialog.querySelector("button").addEventListener("click", () => {
        closeDialog(dialog);
        resolve();
      });
      document.body.appendChild(dialog);
      showDialog(dialog);
    });
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function normalizeQuiz(snapshotDoc) {
    const data = snapshotDoc.data() || {};
    const choices = Array.isArray(data.choices) ? data.choices.map(normalizeText).filter(Boolean).slice(0, 4) : [];
    return {
      id: snapshotDoc.id,
      category: normalizeText(data.category),
      question: normalizeText(data.question),
      choices,
      correctIndex: Number(data.correctIndex || 0),
      explanation: normalizeText(data.explanation),
      enabled: data.enabled !== false
    };
  }

  function isUsableQuiz(quiz) {
    return quiz
      && quiz.enabled
      && quiz.question
      && quiz.choices.length === 4
      && Number.isInteger(quiz.correctIndex)
      && quiz.correctIndex >= 0
      && quiz.correctIndex < 4;
  }

  function shuffle(items, seedText) {
    const next = items.slice();
    let seed = parseInt(hashText(seedText), 16) || 1;
    for (let index = next.length - 1; index > 0; index -= 1) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
      const target = seed % (index + 1);
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
    }
    return next;
  }

  async function fetchQuizPool(runtime, monthKey) {
    const { collection, getDocs, limit, query, where } = runtime.firestoreModule;
    const collectionRef = collection(runtime.db, COLLECTIONS.quizzes);
    const queries = [
      query(collectionRef, where("monthKeys", "array-contains", monthKey), limit(QUIZ_READ_LIMIT)),
      query(collectionRef, where("monthKeys", "array-contains", "all"), limit(QUIZ_READ_LIMIT)),
      query(collectionRef, limit(QUIZ_READ_LIMIT))
    ];
    const snapshots = await Promise.all(queries.map((currentQuery) => getDocs(currentQuery)));
    const seen = new Set();
    const quizzes = [];
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        if (seen.has(snapshotDoc.id)) return;
        seen.add(snapshotDoc.id);
        const quiz = normalizeQuiz(snapshotDoc);
        if (isUsableQuiz(quiz)) {
          quizzes.push(quiz);
        }
      });
    });
    return quizzes;
  }

  async function selectQuiz(runtime, identity, progress, dateKey) {
    const monthKey = buildMonthKey();
    const quizzes = await fetchQuizPool(runtime, monthKey);
    const correctQuizIds = progress && progress.correctQuizIds && typeof progress.correctQuizIds === "object"
      ? progress.correctQuizIds
      : {};
    const answeredQuizIds = progress && progress.answeredQuizIds && typeof progress.answeredQuizIds === "object"
      ? progress.answeredQuizIds
      : {};
    const candidates = shuffle(quizzes, `${identity.summaryKey}|${dateKey}`)
      .filter((quiz) => {
        const quizProgressKey = buildQuizProgressKey(quiz.id);
        return correctQuizIds[quiz.id] !== true && correctQuizIds[quizProgressKey] !== true;
      })
      .filter((quiz) => answeredQuizIds[buildAnsweredQuizKey(dateKey, quiz.id)] !== true);
    return candidates[0] || null;
  }

  async function readProgress(runtime, identity) {
    const { collection, doc, getDoc, getDocs, limit, query, where } = runtime.firestoreModule;
    const progressRef = doc(runtime.db, COLLECTIONS.progress, identity.progressIdSuffix);
    const legacyProgressRef = doc(runtime.db, COLLECTIONS.progress, identity.idSuffix);
    const refs = identity.progressIdSuffix === identity.idSuffix
      ? [progressRef]
      : [progressRef, legacyProgressRef];
    const snapshots = await Promise.all(refs.map((ref) => getDoc(ref)));
    const progressRows = snapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => snapshot.data() || {});

    if (identity.driverKey) {
      const progressCollection = collection(runtime.db, COLLECTIONS.progress);
      const driverProgressQuery = query(progressCollection, where("driverKey", "==", identity.driverKey), limit(50));
      const driverProgressSnapshot = await getDocs(driverProgressQuery);
      driverProgressSnapshot.docs.forEach((snapshotDoc) => {
        progressRows.push(snapshotDoc.data() || {});
      });
    }

    return progressRows.reduce((merged, data) => ({
      ...merged,
      ...data,
      correctQuizIds: {
        ...(merged.correctQuizIds || {}),
        ...(data.correctQuizIds || {})
      },
      answeredQuizIds: {
        ...(merged.answeredQuizIds || {}),
        ...(data.answeredQuizIds || {})
      }
    }), {});
  }

  async function saveAnswer(runtime, identity, quiz, selectedIndex, dateKey) {
    const {
      doc,
      increment,
      runTransaction,
      serverTimestamp
    } = runtime.firestoreModule;
    const answeredQuizKey = buildAnsweredQuizKey(dateKey, quiz.id);
    const quizProgressKey = buildQuizProgressKey(quiz.id);
    const answerRef = doc(runtime.db, COLLECTIONS.answers, `${identity.progressIdSuffix}_${dateKey}_${answeredQuizKey}`);
    const progressRef = doc(runtime.db, COLLECTIONS.progress, identity.progressIdSuffix);
    const summaryRef = doc(runtime.db, COLLECTIONS.points, buildSummaryDocId(identity));
    const eventId = `daily_safety_quiz_${identity.progressIdSuffix}_${quizProgressKey}`;
    const eventRef = doc(runtime.db, COLLECTIONS.points, buildEventDocId(eventId));
    const isCorrect = selectedIndex === quiz.correctIndex;
    const earnedPoint = isCorrect ? 1 : 0;
    const nowIso = new Date().toISOString();
    const result = {
      alreadyAnswered: false,
      isCorrect,
      earnedPoint
    };

    await runTransaction(runtime.db, async (transaction) => {
      const [answerSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(answerRef),
        transaction.get(eventRef)
      ]);
      if (answerSnapshot.exists()) {
        result.alreadyAnswered = true;
        const data = answerSnapshot.data() || {};
        result.isCorrect = data.isCorrect === true;
        result.earnedPoint = Number(data.earnedPoint || 0);
        return;
      }

      transaction.set(answerRef, {
        date: dateKey,
        quizId: quiz.id,
        category: quiz.category,
        selectedChoice: selectedIndex,
        selectedChoiceText: quiz.choices[selectedIndex],
        correctChoice: quiz.correctIndex,
        correctChoiceText: quiz.choices[quiz.correctIndex],
        isCorrect,
        earnedPoint,
        answeredAt: serverTimestamp(),
        answeredAtLocal: nowIso,
        driverKey: identity.driverKey,
        driverName: identity.driverName,
        vehicleKey: identity.vehicleKey,
        vehicleNumber: identity.vehicleNumber,
          progressIdSuffix: identity.progressIdSuffix,
        uid: normalizeText(runtime.user && runtime.user.uid),
        email: normalizeText(runtime.user && runtime.user.email)
      });

      const progressUpdate = {
        driverKey: identity.driverKey,
        driverName: identity.driverName,
        vehicleKey: identity.vehicleKey,
        vehicleNumber: identity.vehicleNumber,
          progressIdSuffix: identity.progressIdSuffix,
        lastAnsweredDate: dateKey,
        lastQuizId: quiz.id,
        answeredCount: increment(1),
        updatedAt: serverTimestamp()
      };
      progressUpdate[`answeredQuizIds.${answeredQuizKey}`] = true;
      if (isCorrect) {
        progressUpdate[`correctQuizIds.${quizProgressKey}`] = true;
        progressUpdate.correctCount = increment(1);
      }
      transaction.set(progressRef, progressUpdate, { merge: true });

      if (isCorrect && !eventSnapshot.exists()) {
        transaction.set(summaryRef, {
          kind: "driver_points_summary",
          driverKey: identity.driverKey,
          driverName: identity.driverName,
          vehicleKey: identity.vehicleKey,
          vehicleNumber: identity.vehicleNumber,
          progressIdSuffix: identity.progressIdSuffix,
          totalPoints: increment(1),
          dailySafetyQuizPoints: increment(1),
          updatedAt: serverTimestamp(),
          lastAwardAt: serverTimestamp(),
          lastSource: "dailySafetyQuiz"
        }, { merge: true });
        transaction.set(eventRef, {
          kind: "driver_points_event",
          driverKey: identity.driverKey,
          driverName: identity.driverName,
          vehicleKey: identity.vehicleKey,
          vehicleNumber: identity.vehicleNumber,
          progressIdSuffix: identity.progressIdSuffix,
          source: "dailySafetyQuiz",
          points: 1,
          targetDate: dateKey,
          quizId: quiz.id,
          category: quiz.category,
          createdAt: serverTimestamp()
        });
      }
    });

    if (result.earnedPoint > 0 && window.DriverPoints && typeof window.DriverPoints.notifyPointAwarded === "function") {
      window.DriverPoints.notifyPointAwarded();
    }
    return result;
  }

  function renderQuizDialog(quiz, onSubmit) {
    ensureStyle();
    return new Promise((resolve) => {
      let selectedIndex = -1;
      let submitted = false;
      const dialog = document.createElement("dialog");
      dialog.className = "daily-safety-quiz-dialog";
      dialog.innerHTML = [
        '<div class="daily-safety-quiz-panel">',
        '<h2 class="daily-safety-quiz-title">今日の安全ワンポイント</h2>',
        '<span class="daily-safety-quiz-meta">' + escapeHtml(quiz.category || "クイズ") + "</span>",
        '<p class="daily-safety-quiz-question">' + escapeHtml(quiz.question) + "</p>",
        '<div class="daily-safety-quiz-choices">',
        quiz.choices.map((choice, index) => [
          '<button class="daily-safety-quiz-choice" type="button" data-choice-index="' + String(index) + '">',
          '<span class="daily-safety-quiz-choice-mark" aria-hidden="true"></span>',
          '<span>' + escapeHtml(choice) + "</span>",
          "</button>"
        ].join("")).join(""),
        "</div>",
        '<div class="daily-safety-quiz-actions">',
        '<button class="daily-safety-quiz-button" type="button" data-submit disabled>この答えで決定</button>',
        "</div>",
        "</div>"
      ].join("");
      const submitButton = dialog.querySelector("[data-submit]");
      const choiceButtons = Array.from(dialog.querySelectorAll("[data-choice-index]"));
      choiceButtons.forEach((button) => {
        button.addEventListener("click", () => {
          if (submitted) return;
          selectedIndex = Number(button.dataset.choiceIndex);
          choiceButtons.forEach((choiceButton) => {
            const active = Number(choiceButton.dataset.choiceIndex) === selectedIndex;
            choiceButton.classList.toggle("is-selected", active);
            choiceButton.setAttribute("aria-pressed", active ? "true" : "false");
          });
          submitButton.disabled = false;
        });
      });
      submitButton.addEventListener("click", async () => {
        if (selectedIndex < 0 || submitted) return;
        submitted = true;
        submitButton.disabled = true;
        submitButton.textContent = "送信中...";
        try {
          const result = await onSubmit(selectedIndex);
          renderResult(dialog, quiz, result, () => {
            closeDialog(dialog);
            resolve(result);
          });
        } catch (error) {
          console.warn("Failed to submit daily safety quiz:", error);
          renderResult(dialog, quiz, {
            isCorrect: false,
            earnedPoint: 0,
            submitError: "回答を保存できませんでした。通信状態を確認して、もう一度お試しください。"
          }, () => {
            closeDialog(dialog);
            resolve(null);
          });
        }
      });
      document.body.appendChild(dialog);
      showDialog(dialog);
    });
  }

  function renderResult(dialog, quiz, result, onDone) {
    const correct = result && result.isCorrect === true;
    dialog.innerHTML = [
      '<div class="daily-safety-quiz-panel daily-safety-quiz-result">',
      '<h2 class="daily-safety-quiz-title">今日の安全ワンポイント</h2>',
      '<p class="daily-safety-quiz-result-heading">' + escapeHtml(
        result && result.submitError
          ? "回答を保存できませんでした"
          : correct
            ? "正解です。1ポイント獲得しました"
            : "今回はポイントなし"
      ) + "</p>",
      correct || (result && result.submitError) ? "" : [
        '<div class="daily-safety-quiz-correct-answer">',
        "正解: " + escapeHtml(quiz.choices[quiz.correctIndex]),
        "</div>",
        '<p class="daily-safety-quiz-explanation">' + escapeHtml(quiz.explanation || "") + "</p>"
      ].join(""),
      result && result.submitError ? '<p class="daily-safety-quiz-explanation">' + escapeHtml(result.submitError) + "</p>" : "",
      '<div class="daily-safety-quiz-actions">',
      '<button class="daily-safety-quiz-button" type="button">完了</button>',
      "</div>",
      "</div>"
    ].join("");
    dialog.querySelector("button").addEventListener("click", onDone);
  }

  async function showAfterInspection(options = {}) {
    if (!await shouldShowQuiz()) {
      return { shown: false, reason: "disabled" };
    }
    const identity = buildIdentity(options.driverName, options.vehicleNumber);
    if (!identity.driverKey || !identity.vehicleKey) {
      return { shown: false, reason: "missing_identity" };
    }

    try {
      const runtime = await ensureRuntime();
      const dateKey = buildLocalDateKey();
      const progress = await readProgress(runtime, identity);
      const quiz = await selectQuiz(runtime, identity, progress, dateKey);
      if (!quiz) {
        return { shown: false, reason: "no_quiz" };
      }

      await renderQuizDialog(quiz, (selectedIndex) => saveAnswer(runtime, identity, quiz, selectedIndex, dateKey));
      return { shown: true, reason: "answered" };
    } catch (error) {
      console.warn("Failed to show daily safety quiz:", error);
      await renderDoneDialog("クイズを読み込めませんでした。通信状態とログイン状態を確認してください。");
      return { shown: true, reason: "error", error };
    }
  }

  window.DailySafetyQuiz = Object.freeze({
    loadSettings,
    shouldShowCompletionImage,
    showAfterInspection
  });
})();
