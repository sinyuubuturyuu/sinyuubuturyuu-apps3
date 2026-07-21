(function () {
  "use strict";

  const LAST_AWARD_KEY = "driver.points.last_award_at.v1";
  const POINT_SETTINGS_COLLECTION = "driver-point-settings";
  const POINT_SUMMARY_CACHE_TTL_MS = 5000;
  const PAGE_SHOW_REFRESH_INTERVAL_MS = 5000;
  const BADGE_REFRESH_DEBOUNCE_MS = 120;
  const DRIVER_POINTS_HELP_TITLE = "ポイントに関するヘルプ";
  const DRIVER_POINTS_HELP_MESSAGE = [
    "現在は給与等の評価にはなりません。",
    "お金等には交換できませんので個人でお楽しみください。",
    "ポイントに関するトラブルについては当方では責任を負いかねます。",
    "当日と当月送信で２ポイント、その他送信で１ポイントです。",
    "代車に乗った時もポイントが付きますが車番の設定をお忘れなく。",
    "なおポイント反映は数秒かかります。"
  ].join("\n");
  const STORAGE_TARGET = Object.freeze({
    collection: "driver-points",
    summaryPrefix: "driver_points_summary",
    eventPrefix: "driver_points_event"
  });
  const FIREBASE_CONFIG = Object.freeze(getRuntimeFirebaseConfig({
    apiKey: "AIzaSyBBvJndQmecQfaetdjs9Pb6Z1TDmoQMOGc",
    authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
    projectId: "sinyuubuturyuu-dev",
    storageBucket: "sinyuubuturyuu-dev.firebasestorage.app",
    messagingSenderId: "997788842966",
    appId: "1:997788842966:web:e011e7340e2af863c40277"
  }));

  const uiState = {
    mounted: false,
    badgeRefreshToken: 0,
    observer: null,
    authObserverBound: false,
    refreshTimer: 0,
    pendingRefreshOptions: null,
    lastBadgeSyncAt: 0,
    summaryCache: new Map()
  };
  const runtimeState = {
    promise: null,
    featureStateInitialized: false,
    setting: {
      loginId: "",
      enabled: true,
      exists: false,
      loaded: false,
      error: null
    }
  };

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeLoginId(value) {
    return normalizeText(value).toLowerCase();
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
      firestoreHost: "127.0.0.1",
      firestorePort: 8080,
      ...(window.APP_FIREBASE_EMULATOR || {})
    };
  }

  function connectFirestoreEmulatorIfNeeded(firestoreModule, db) {
    if (!shouldUseFirebaseEmulator() || !firestoreModule || typeof firestoreModule.connectFirestoreEmulator !== "function" || db.__sinyuubuturyuuEmulatorConnected) {
      return;
    }

    const runtime = getFirebaseEmulatorRuntime();
    firestoreModule.connectFirestoreEmulator(db, runtime.firestoreHost, runtime.firestorePort);
    db.__sinyuubuturyuuEmulatorConnected = true;
  }

  function getFirebaseAppForConfig(appModule, config) {
    const apps = typeof appModule.getApps === "function" ? appModule.getApps() : [];
    const expectedProjectId = String(config && config.projectId ? config.projectId : "").trim();
    const matchedApp = apps.find((app) => {
      const projectId = app && app.options ? String(app.options.projectId || "").trim() : "";
      return projectId && projectId === expectedProjectId;
    });

    if (matchedApp) {
      return matchedApp;
    }
    if (!apps.length) {
      return appModule.initializeApp(config);
    }

    const appName = `driver-points-${expectedProjectId || "firebase"}`;
    try {
      return appModule.getApp(appName);
    } catch {
      return appModule.initializeApp(config, appName);
    }
  }

  function normalizeDriverName(value) {
    const text = normalizeText(value)
      .replace(/\s*[（(][^）)]*[）)]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text === "未選択" ? "" : text;
  }

  function normalizeVehicleNumber(value) {
    const text = normalizeText(value)
      .replace(/\s+/g, " ")
      .trim();
    return text === "未選択" ? "" : text;
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

  function buildSelectionIdentity(driverName, vehicleNumber) {
    const normalizedDriverName = normalizeDriverName(driverName);
    const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
    const driverKey = buildDriverKey(normalizedDriverName);
    const vehicleKey = buildVehicleKey(normalizedVehicleNumber);
    const summaryKey = `${vehicleKey}|${driverKey}`;
    return {
      driverName: normalizedDriverName,
      vehicleNumber: normalizedVehicleNumber,
      driverKey,
      vehicleKey,
      summaryKey,
      idSuffix: hashText(summaryKey || `${normalizedVehicleNumber}|${normalizedDriverName}` || "unknown")
    };
  }

  function buildSummaryDocId(identity) {
    return `${STORAGE_TARGET.summaryPrefix}_${identity.idSuffix}`;
  }

  function buildEventDocId(eventId) {
    return `${STORAGE_TARGET.eventPrefix}_${hashText(eventId)}`;
  }

  function getLastAwardAtMs() {
    const raw = window.localStorage.getItem(LAST_AWARD_KEY);
    if (!raw) {
      return 0;
    }
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function markPointAwarded() {
    window.localStorage.setItem(LAST_AWARD_KEY, new Date().toISOString());
  }

  function getCachedSummary(identity) {
    const entry = uiState.summaryCache.get(identity.summaryKey);
    if (!entry) {
      return null;
    }
    if ((Date.now() - entry.cachedAt) > POINT_SUMMARY_CACHE_TTL_MS) {
      uiState.summaryCache.delete(identity.summaryKey);
      return null;
    }
    return entry.summary;
  }

  function setCachedSummary(identity, summary) {
    uiState.summaryCache.set(identity.summaryKey, {
      summary,
      cachedAt: Date.now()
    });
  }

  function invalidateCachedSummary(identity) {
    uiState.summaryCache.delete(identity.summaryKey);
  }

  function ensureFeatureStateInitialized() {
    if (runtimeState.featureStateInitialized) {
      return;
    }
    runtimeState.featureStateInitialized = true;
  }

  function hasFirebaseConfig() {
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = FIREBASE_CONFIG[key];
      return typeof value === "string" && value.trim();
    });
  }

  function buildAuthRequiredError() {
    const error = new Error("Firebase auth user is missing for driver points.");
    error.code = "auth/missing-user";
    return error;
  }

  function isExpectedReadBlock(error) {
    const code = String(error && error.code || "");
    const message = String(error && error.message || "");
    return code === "auth/missing-user"
      || code === "permission-denied"
      || message.includes("Firebase auth user is missing for driver points")
      || message.includes("Missing or insufficient permissions");
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
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        resolve(user || null);
      };

      unsubscribe = authModule.onAuthStateChanged(auth, (user) => finish(user), () => finish(null));
      window.setTimeout(() => finish(auth.currentUser || null), 5000);
    });
  }

  function getCurrentLoginId(user) {
    ensureFeatureStateInitialized();
    const sharedSettings = window.SharedLauncherSettings;
    if (sharedSettings && typeof sharedSettings.ensureState === "function") {
      const sharedState = sharedSettings.ensureState();
      const currentLoginId = normalizeLoginId(sharedState && sharedState.current && sharedState.current.loginId);
      if (currentLoginId) {
        return currentLoginId;
      }
    }
    const email = normalizeLoginId(user && user.email);
    if (email) {
      return email;
    }
    return normalizeLoginId(user && user.uid);
  }

  function getCurrentDriverName() {
    const sharedSettings = window.SharedLauncherSettings;
    if (sharedSettings && typeof sharedSettings.ensureState === "function") {
      const sharedState = sharedSettings.ensureState();
      return normalizeDriverName(sharedState && sharedState.current && sharedState.current.driverName);
    }
    return "";
  }

  function isEnabled() {
    ensureFeatureStateInitialized();
    return runtimeState.setting.enabled !== false;
  }

  function isLauncherAppVisible() {
    const launcherApp = document.getElementById("launcherApp");
    return !launcherApp || launcherApp.hidden !== true;
  }

  function updateSettingState(nextSetting) {
    ensureFeatureStateInitialized();
    runtimeState.setting = {
      ...runtimeState.setting,
      ...nextSetting
    };
  }

  async function loadPointFeatureSetting(options = {}) {
    ensureFeatureStateInitialized();
    const runtime = await ensureRuntime();
    const loginId = getCurrentLoginId(runtime.user);
    if (!loginId) {
      updateSettingState({
        loginId: "",
        enabled: true,
        exists: false,
        loaded: true,
        error: null
      });
      return runtimeState.setting;
    }

    if (
      options.force !== true
      && runtimeState.setting.loaded
      && runtimeState.setting.loginId === loginId
      && !runtimeState.setting.error
    ) {
      return runtimeState.setting;
    }

    const { doc, getDoc, getDocFromServer } = runtime.firestoreModule;
    const settingRef = doc(runtime.db, POINT_SETTINGS_COLLECTION, loginId);
    let snapshot;
    try {
      if (options.force === true && typeof getDocFromServer === "function") {
        try {
          snapshot = await getDocFromServer(settingRef);
        } catch {
          snapshot = await getDoc(settingRef);
        }
      } else {
        snapshot = await getDoc(settingRef);
      }
    } catch (error) {
      updateSettingState({
        loginId,
        enabled: true,
        exists: false,
        loaded: false,
        error
      });
      throw error;
    }

    const data = snapshot.exists() ? snapshot.data() : {};
    updateSettingState({
      loginId,
      enabled: snapshot.exists() ? data.enabled !== false : true,
      exists: snapshot.exists(),
      loaded: true,
      error: null
    });
    return runtimeState.setting;
  }

  async function setEnabled(enabled) {
    ensureFeatureStateInitialized();
    updateSettingState({
      enabled: enabled !== false,
      loaded: true,
      error: null
    });
    syncLauncherUi({ reason: "setting_change" });

    const runtime = await ensureRuntime();
    const loginId = getCurrentLoginId(runtime.user);
    if (!loginId) {
      throw new Error("Login ID is missing for driver point setting.");
    }

    const { doc, serverTimestamp, setDoc } = runtime.firestoreModule;
    const settingRef = doc(runtime.db, POINT_SETTINGS_COLLECTION, loginId);
    await setDoc(settingRef, {
      enabled: enabled !== false,
      loginId,
      email: normalizeLoginId(runtime.user && runtime.user.email),
      driverName: getCurrentDriverName(),
      uid: normalizeText(runtime.user && runtime.user.uid),
      updatedAt: serverTimestamp()
    }, { merge: true });

    updateSettingState({
      loginId,
      enabled: enabled !== false,
      exists: true,
      loaded: true,
      error: null
    });
    syncLauncherUi({ force: true, reason: "setting_saved" });
    return isEnabled();
  }

  function normalizeMonthKey(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(normalizeText(value));
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return "";
    }
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function normalizeDayNumber(value) {
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return 0;
    }
    return day;
  }

  function buildLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function buildLocalMonthKey(date = new Date()) {
    return buildLocalDateKey(date).slice(0, 7);
  }

  function buildDateKey(monthKey, day) {
    const normalizedMonth = normalizeMonthKey(monthKey);
    const normalizedDay = normalizeDayNumber(day);
    if (!normalizedMonth || !normalizedDay) {
      return "";
    }
    return `${normalizedMonth}-${String(normalizedDay).padStart(2, "0")}`;
  }

  async function ensureRuntime() {
    if (!hasFirebaseConfig()) {
      throw new Error("Firebase config is missing for driver points.");
    }
    if (runtimeState.promise) {
      return runtimeState.promise;
    }

    runtimeState.promise = (async () => {
      const [appModule, authModule, firestoreModule] = await Promise.all([
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
        app = getFirebaseAppForConfig(appModule, FIREBASE_CONFIG);
      }
      if (!auth) {
        auth = authModule.getAuth(app);
      }

      const user = await waitForSignedInUser(authApi, authModule, auth);
      if (!user) {
        throw buildAuthRequiredError();
      }

      const db = firestoreModule.getFirestore(app);
      connectFirestoreEmulatorIfNeeded(firestoreModule, db);

      return {
        db,
        user,
        firestoreModule
      };
    })().catch((error) => {
      runtimeState.promise = null;
      throw error;
    });

    return runtimeState.promise;
  }

  async function readDriverPoints(driverName, vehicleNumber, options = {}) {
    const identity = buildSelectionIdentity(driverName, vehicleNumber);
    if (!identity.driverKey || !identity.vehicleKey) {
      return { ok: false, enabled: isEnabled(), driverName: identity.driverName, vehicleNumber: identity.vehicleNumber, points: 0 };
    }
    const featureSetting = await loadPointFeatureSetting({ force: options.force === true });
    if (!featureSetting.enabled) {
      return { ok: true, enabled: false, driverName: identity.driverName, vehicleNumber: identity.vehicleNumber, points: 0 };
    }
    if (options.force !== true) {
      const cachedSummary = getCachedSummary(identity);
      if (cachedSummary) {
        return cachedSummary;
      }
    }

    const runtime = await ensureRuntime();
    const { doc, getDoc, getDocFromServer } = runtime.firestoreModule;
    const summaryRef = doc(runtime.db, STORAGE_TARGET.collection, buildSummaryDocId(identity));
    let snapshot;
    if (options.force === true && typeof getDocFromServer === "function") {
      try {
        snapshot = await getDocFromServer(summaryRef);
      } catch {
        snapshot = await getDoc(summaryRef);
      }
    } else {
      snapshot = await getDoc(summaryRef);
    }

    const data = snapshot.exists() ? snapshot.data() : {};
    const summary = {
      ok: true,
      enabled: true,
      driverName: identity.driverName,
      vehicleNumber: identity.vehicleNumber,
      points: Number(data.totalPoints || 0)
    };
    setCachedSummary(identity, summary);
    return summary;
  }

  async function applyAwardBatch(options) {
    const identity = buildSelectionIdentity(options && options.driverName, options && options.vehicleNumber);
    if (!identity.driverKey || !identity.vehicleKey) {
      return { ok: false, enabled: isEnabled(), addedPoints: 0, awards: [] };
    }
    const featureSetting = await loadPointFeatureSetting();
    if (!featureSetting.enabled) {
      return { ok: true, enabled: false, addedPoints: 0, awards: [] };
    }

    const awards = Array.isArray(options && options.awards)
      ? options.awards.filter((award) => award && award.eventId && Number(award.points) > 0)
      : [];
    if (!awards.length) {
      return { ok: false, enabled: true, addedPoints: 0, awards: [] };
    }

    const runtime = await ensureRuntime();
    const { doc, increment, runTransaction, serverTimestamp } = runtime.firestoreModule;
    const pointRef = doc(runtime.db, STORAGE_TARGET.collection, buildSummaryDocId(identity));
    const eventEntries = awards.map((award) => ({
      award,
      ref: doc(runtime.db, STORAGE_TARGET.collection, buildEventDocId(award.eventId))
    }));
    const result = {
      ok: true,
      enabled: true,
      addedPoints: 0,
      awards: awards.map((award) => ({ ...award, applied: false }))
    };

    await runTransaction(runtime.db, async (transaction) => {
      const snapshots = await Promise.all(eventEntries.map((entry) => transaction.get(entry.ref)));
      const nextAwards = [];
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists()) {
          nextAwards.push(eventEntries[index].award);
          result.awards[index].applied = true;
        }
      });
      if (!nextAwards.length) {
        return;
      }

      const addedPoints = nextAwards.reduce((total, award) => total + Number(award.points || 0), 0);
      result.addedPoints = addedPoints;

      const pointUpdate = {
        kind: "driver_points_summary",
        driverKey: identity.driverKey,
        driverName: identity.driverName,
        vehicleKey: identity.vehicleKey,
        vehicleNumber: identity.vehicleNumber,
        totalPoints: increment(addedPoints),
        updatedAt: serverTimestamp(),
        lastAwardAt: serverTimestamp(),
        lastSource: normalizeText(options && options.source)
      };
      if (options && options.source === "dailyInspection") {
        pointUpdate.dailyInspectionPoints = increment(addedPoints);
      } else if (options && options.source === "monthlyTireInspection") {
        pointUpdate.monthlyTirePoints = increment(addedPoints);
      }
      transaction.set(pointRef, pointUpdate, { merge: true });

      nextAwards.forEach((award) => {
        const eventRef = eventEntries.find((entry) => entry.award.eventId === award.eventId).ref;
        transaction.set(eventRef, {
          kind: "driver_points_event",
          driverKey: identity.driverKey,
          driverName: identity.driverName,
          vehicleKey: identity.vehicleKey,
          vehicleNumber: identity.vehicleNumber,
          source: normalizeText(options && options.source),
          points: Number(award.points || 0),
          month: normalizeText(award.month),
          day: Number(award.day || 0),
          targetDate: normalizeText(award.targetDate),
          sentDate: normalizeText(award.sentDate),
          inspectionDate: normalizeText(award.inspectionDate),
          targetMonth: normalizeText(award.targetMonth),
          createdAt: serverTimestamp()
        });
      });
    });

    invalidateCachedSummary(identity);
    if (result.awards.some((award) => award.applied)) {
      markPointAwarded();
    }
    return result;
  }

  async function awardDailyInspection(options) {
    const month = normalizeMonthKey(options && options.month);
    const days = [...new Set((Array.isArray(options && options.completeDays) ? options.completeDays : [])
      .map((day) => normalizeDayNumber(day))
      .filter(Boolean))];
    if (!month || !days.length) {
      return { ok: false, enabled: isEnabled(), addedPoints: 0, awards: [] };
    }

    const sentAt = options && options.sentAt ? new Date(options.sentAt) : new Date();
    const sentDate = buildLocalDateKey(sentAt);
    const awards = days.map((day) => {
      const targetDate = buildDateKey(month, day);
      const points = targetDate && targetDate === sentDate ? 2 : 1;
      return {
        eventId: `daily_${hashText(`${buildVehicleKey(options && options.vehicleNumber)}|${buildDriverKey(options && options.driverName)}|${month}|${day}`)}`,
        points,
        month,
        day,
        targetDate,
        sentDate
      };
    });

    return applyAwardBatch({
      driverName: options && options.driverName,
      vehicleNumber: options && options.vehicleNumber,
      source: "dailyInspection",
      awards
    });
  }

  async function awardMonthlyTireInspection(options) {
    const sentAt = options && options.sentAt ? new Date(options.sentAt) : new Date();
    const targetMonth = normalizeMonthKey(options && options.targetMonth)
      || normalizeMonthKey(normalizeText(options && options.inspectionDate).slice(0, 7));
    if (!targetMonth) {
      return { ok: false, enabled: isEnabled(), addedPoints: 0, awards: [] };
    }

    const sentMonth = buildLocalMonthKey(sentAt);
    const points = targetMonth === sentMonth ? 2 : 1;
    return applyAwardBatch({
      driverName: options && options.driverName,
      vehicleNumber: options && options.vehicleNumber,
      source: "monthlyTireInspection",
      awards: [{
        eventId: `tire_${hashText(`${buildVehicleKey(options && options.vehicleNumber)}|${buildDriverKey(options && options.driverName)}|${targetMonth}`)}`,
        points,
        sentDate: buildLocalDateKey(sentAt),
        inspectionDate: normalizeText(options && options.inspectionDate),
        targetMonth
      }]
    });
  }

  function ensureStyle() {
    if (!document || document.getElementById("driverPointsStyle")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "driverPointsStyle";
    style.textContent = [
      ".driver-points-inline { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }",
      ".driver-points-name { min-width: 0; }",
      ".driver-points-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 60px; min-height: 28px; padding: 4px 10px; border-radius: 999px; background: rgba(23, 105, 210, 0.12); color: var(--primary, #1769d2); font-size: 0.82rem; font-weight: 800; line-height: 1; }",
      ".driver-points-badge[hidden] { display: none !important; }",
      ".driver-points-section-head { display: flex; align-items: center; justify-content: flex-start; gap: 8px; flex-wrap: wrap; }",
      ".driver-points-section-head h3 { margin: 0; }",
      ".driver-points-help-button { appearance: none; border: 1px solid rgba(23, 105, 210, 0.28); background: rgba(23, 105, 210, 0.08); color: var(--primary, #1769d2); border-radius: 10px; padding: 8px 14px; font-size: 0.9rem; font-weight: 700; cursor: pointer; }",
      ".driver-points-help-button:active { transform: translateY(1px); }",
      ".driver-points-help-dialog { width: min(480px, calc(100vw - 32px)); max-width: 100%; border: none; border-radius: 18px; padding: 0; background: #ffffff; color: #0f172a; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.32); }",
      ".driver-points-help-dialog::backdrop { background: rgba(15, 23, 42, 0.45); }",
      ".driver-points-help-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 20px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.24); }",
      ".driver-points-help-title { margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.4; }",
      ".driver-points-help-close { appearance: none; border: 1px solid rgba(148, 163, 184, 0.4); background: #ffffff; color: #334155; border-radius: 999px; min-width: 36px; min-height: 36px; padding: 0 12px; font-size: 0.9rem; font-weight: 700; cursor: pointer; }",
      ".driver-points-help-body { padding: 16px 20px 20px; white-space: pre-line; line-height: 1.8; font-size: 0.95rem; color: #334155; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function closeHelpDialog() {
    const dialog = document.getElementById("driverPointsHelpDialog");
    if (!dialog) {
      return;
    }

    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }

    dialog.removeAttribute("open");
  }

  function ensureHelpDialog() {
    let dialog = document.getElementById("driverPointsHelpDialog");
    if (dialog) {
      return dialog;
    }

    ensureStyle();

    dialog = document.createElement("dialog");
    dialog.id = "driverPointsHelpDialog";
    dialog.className = "driver-points-help-dialog";

    const header = document.createElement("div");
    header.className = "driver-points-help-header";

    const title = document.createElement("h4");
    title.className = "driver-points-help-title";
    title.textContent = DRIVER_POINTS_HELP_TITLE;
    header.appendChild(title);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "driver-points-help-close";
    closeButton.textContent = "閉じる";
    closeButton.addEventListener("click", closeHelpDialog);
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.className = "driver-points-help-body";
    body.textContent = DRIVER_POINTS_HELP_MESSAGE;

    dialog.appendChild(header);
    dialog.appendChild(body);

    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const isInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInside) {
        closeHelpDialog();
      }
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function showHelpDialog() {
    const dialog = ensureHelpDialog();
    if (!dialog) {
      window.alert(DRIVER_POINTS_HELP_MESSAGE);
      return;
    }

    const title = dialog.querySelector(".driver-points-help-title");
    if (title) {
      title.textContent = DRIVER_POINTS_HELP_TITLE;
    }

    const body = dialog.querySelector(".driver-points-help-body");
    if (body) {
      body.textContent = DRIVER_POINTS_HELP_MESSAGE;
    }

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    dialog.setAttribute("open", "open");
  }

  function ensureBadgeElements() {
    const nameEl = document.getElementById("currentDriverName");
    const vehicleEl = document.getElementById("currentVehicleNumber");
    if (!nameEl || !nameEl.parentNode) {
      return null;
    }
    ensureStyle();

    let wrapper = nameEl.parentElement;
    if (!wrapper || !wrapper.classList.contains("driver-points-inline")) {
      wrapper = document.createElement("span");
      wrapper.className = "current-selection-value driver-points-inline";
      nameEl.parentNode.insertBefore(wrapper, nameEl);
      wrapper.appendChild(nameEl);
      nameEl.classList.remove("current-selection-value");
      nameEl.classList.add("driver-points-name");
    }

    let badge = document.getElementById("currentDriverPoints");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "currentDriverPoints";
      badge.className = "driver-points-badge";
      badge.hidden = true;
      wrapper.appendChild(badge);
    }

    return { nameEl, vehicleEl, badge };
  }

  function getCurrentSelection(elements) {
    const sharedSettings = window.SharedLauncherSettings;
    if (sharedSettings && typeof sharedSettings.ensureState === "function") {
      const sharedState = sharedSettings.ensureState();
      return {
        driverName: normalizeDriverName(sharedState && sharedState.current && sharedState.current.driverName),
        vehicleNumber: normalizeVehicleNumber(sharedState && sharedState.current && sharedState.current.vehicleNumber)
      };
    }
    return {
      driverName: normalizeDriverName(elements && elements.nameEl && elements.nameEl.textContent),
      vehicleNumber: normalizeVehicleNumber(elements && elements.vehicleEl && elements.vehicleEl.textContent)
    };
  }

  function ensureSettingsSection() {
    const settingsFields = document.querySelector("#settingsForm .settings-fields");
    if (!settingsFields) {
      return null;
    }

    ensureStyle();

    let section = document.getElementById("driverPointsSettingsSection");
    if (section) {
      return section;
    }

    section = document.createElement("section");
    section.id = "driverPointsSettingsSection";
    section.className = "settings-section";

    const head = document.createElement("div");
    head.className = "section-head";

    const title = document.createElement("h3");
    title.textContent = "ポイント付与機能";
    head.appendChild(title);

    const summary = document.createElement("p");
    summary.innerHTML = [
      "車番と乗務員が同じ組み合わせの時だけ同じポイントとして扱います。",
      "今現在は給与等の評価にはなりません。個人でお楽しみください。",
      "このポイントについての問題に関しては、当方では一切の責任は負えません。"
    ].join("<br>");
    head.appendChild(summary);

    const field = document.createElement("label");
    field.className = "field";

    const toggle = document.createElement("select");
    toggle.id = "driverPointsFeatureToggle";
    toggle.className = "field-select";
    toggle.setAttribute("aria-label", "ポイント付与機能切替");
    toggle.innerHTML = [
      '<option value="off">OFF</option>',
      '<option value="on">ON</option>'
    ].join("");
    field.appendChild(toggle);

    section.appendChild(head);
    section.appendChild(field);
    settingsFields.appendChild(section);

    toggle.addEventListener("change", (event) => {
      const enabled = String(event.target.value || "") === "on";
      event.target.disabled = true;
      void setEnabled(enabled).catch((error) => {
        console.warn("Failed to save driver point setting:", error);
        updateSettingState({ enabled: !enabled, error });
        syncLauncherUi({ reason: "setting_save_failed" });
        window.alert("ポイント設定を保存できませんでした。通信状態とログイン状態を確認して、もう一度操作してください。");
      }).finally(() => {
        event.target.disabled = false;
        renderSettingsSection();
      });
    });

    return section;
  }

  function renderSettingsSection() {
    const section = ensureSettingsSection();
    if (!section) {
      return;
    }

    enhanceSettingsSection(section);

    const toggle = document.getElementById("driverPointsFeatureToggle");
    const enabled = isEnabled();

    if (toggle) {
      toggle.value = enabled ? "on" : "off";
    }

    if (isLauncherAppVisible() && (!runtimeState.setting.loaded || runtimeState.setting.error)) {
      void refreshFeatureSettingForUi();
    }
  }

  async function refreshFeatureSettingForUi() {
    try {
      await loadPointFeatureSetting({ force: true });
    } catch (error) {
      console.warn("Failed to load driver point setting:", error);
    } finally {
      const toggle = document.getElementById("driverPointsFeatureToggle");
      if (toggle) {
        toggle.value = isEnabled() ? "on" : "off";
      }
      requestBadgeRefresh({ force: true, reason: "feature_setting_loaded" });
    }
  }

  function enhanceSettingsSection(section) {
    if (!section) {
      return;
    }

    const head = section.querySelector(".section-head");
    if (head) {
      head.classList.add("driver-points-section-head");
    }

    const title = head && head.querySelector("h3");
    if (title) {
      title.textContent = "ポイント付与機能";
    }

    const summary = head && head.querySelector("p");
    if (summary) {
      summary.remove();
    }

    let helpButton = section.querySelector("#driverPointsHelpButton");
    if (!helpButton) {
      helpButton = document.createElement("button");
      helpButton.type = "button";
      helpButton.id = "driverPointsHelpButton";
      helpButton.className = "driver-points-help-button";
      helpButton.textContent = "ヘルプ";
      helpButton.addEventListener("click", () => {
        showHelpDialog();
      });
    }

    if (helpButton) {
      helpButton.textContent = "ヘルプ";
      if (title) {
        title.insertAdjacentElement("afterend", helpButton);
      } else if (head && helpButton.parentElement !== head) {
        head.appendChild(helpButton);
      } else if (!head && helpButton.parentElement !== section) {
        section.appendChild(helpButton);
      }
    }
  }

  function hideBadge() {
    const badge = document.getElementById("currentDriverPoints");
    if (!badge) {
      return;
    }
    badge.hidden = true;
    badge.textContent = "";
    badge.removeAttribute("title");
    badge.removeAttribute("aria-busy");
    uiState.lastBadgeSyncAt = Date.now();
  }

  function requestBadgeRefresh(options = {}) {
    const pending = uiState.pendingRefreshOptions || {};
    uiState.pendingRefreshOptions = {
      force: pending.force === true || options.force === true,
      reason: options.reason || pending.reason || "sync"
    };
    if (uiState.refreshTimer) {
      window.clearTimeout(uiState.refreshTimer);
    }
    uiState.refreshTimer = window.setTimeout(() => {
      const nextOptions = uiState.pendingRefreshOptions || { force: false, reason: "sync" };
      uiState.pendingRefreshOptions = null;
      uiState.refreshTimer = 0;
      void refreshBadge(nextOptions);
    }, options.delayMs ?? BADGE_REFRESH_DEBOUNCE_MS);
  }

  async function refreshBadge(options = {}) {
    const elements = ensureBadgeElements();
    if (!elements) {
      return;
    }

    const hasPendingAwardRefresh = getLastAwardAtMs() > uiState.lastBadgeSyncAt;
    if (options.reason === "pageshow" && options.force !== true && !hasPendingAwardRefresh && (Date.now() - uiState.lastBadgeSyncAt) < PAGE_SHOW_REFRESH_INTERVAL_MS) {
      return;
    }

    const selection = getCurrentSelection(elements);
    if (!selection.driverName || !selection.vehicleNumber) {
      hideBadge();
      return;
    }

    const refreshToken = ++uiState.badgeRefreshToken;
    elements.badge.hidden = false;
    elements.badge.textContent = "...";
    elements.badge.setAttribute("aria-busy", "true");

    try {
      const summary = await readDriverPoints(selection.driverName, selection.vehicleNumber, {
        force: options.force === true || hasPendingAwardRefresh
      });
      if (refreshToken !== uiState.badgeRefreshToken) {
        return;
      }
      if (!summary.enabled) {
        hideBadge();
        return;
      }
      elements.badge.textContent = `${summary.points}pt`;
      elements.badge.title = `${summary.vehicleNumber} / ${summary.driverName} のポイント`;
      uiState.lastBadgeSyncAt = Date.now();
    } catch (error) {
      if (!isExpectedReadBlock(error)) {
        console.warn("Failed to load driver points:", error);
      }
      if (refreshToken !== uiState.badgeRefreshToken) {
        return;
      }
      hideBadge();
    } finally {
      elements.badge.removeAttribute("aria-busy");
    }
  }

  function observeLauncherSelection() {
    const elements = ensureBadgeElements();
    if (!elements || uiState.observer) {
      return;
    }
    uiState.observer = new MutationObserver(() => {
      requestBadgeRefresh({ reason: "selection_change" });
    });
    uiState.observer.observe(elements.nameEl, { childList: true, characterData: true, subtree: true });
    if (elements.vehicleEl) {
      uiState.observer.observe(elements.vehicleEl, { childList: true, characterData: true, subtree: true });
    }
  }

  function observeAuthState() {
    if (uiState.authObserverBound) {
      return;
    }

    const authApi = window.DevFirebaseAuth;
    if (!authApi || typeof authApi.onChange !== "function") {
      return;
    }

    uiState.authObserverBound = true;
    void authApi.onChange((user) => {
      runtimeState.promise = null;
      updateSettingState({
        loginId: "",
        enabled: true,
        exists: false,
        loaded: false,
        error: null
      });
      if (user) {
        void refreshFeatureSettingForUi();
        requestBadgeRefresh({ force: true, reason: "auth_change", delayMs: 0 });
        return;
      }

      hideBadge();
    }).catch(() => {
      uiState.authObserverBound = false;
    });
  }

  function syncLauncherUi(options = {}) {
    renderSettingsSection();
    requestBadgeRefresh(options);
  }

  function mountLauncherUi() {
    if (uiState.mounted) {
      syncLauncherUi({ reason: "remount" });
      return;
    }
    uiState.mounted = true;
    ensureBadgeElements();
    ensureSettingsSection();
    renderSettingsSection();
    observeLauncherSelection();
    observeAuthState();
    requestBadgeRefresh({ force: true, reason: "mount", delayMs: 0 });
  }

  function bootUiWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountLauncherUi, { once: true });
      return;
    }
    mountLauncherUi();
  }

  window.addEventListener("pageshow", () => {
    syncLauncherUi({ reason: "pageshow" });
  });

  window.DriverPoints = Object.freeze({
    isEnabled,
    setEnabled,
    readDriverPoints,
    awardDailyInspection,
    awardMonthlyTireInspection,
    mountLauncherUi
  });

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    bootUiWhenReady();
  }
})();

