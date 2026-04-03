(function () {
  "use strict";

  const FEATURE_STORAGE_KEY = "driver.points.feature.enabled.v1";
  const LAST_AWARD_KEY = "driver.points.last_award_at.v1";
  const POINT_SUMMARY_CACHE_TTL_MS = 5000;
  const PAGE_SHOW_REFRESH_INTERVAL_MS = 5000;
  const BADGE_REFRESH_DEBOUNCE_MS = 120;
  const STORAGE_TARGET = Object.freeze({
    collection: "driver-points",
    summaryPrefix: "driver_points_summary",
    eventPrefix: "driver_points_event"
  });
  const FIREBASE_CONFIG = Object.freeze({
    apiKey: "AIzaSyCUhbTrb3c5wN3zeJkFHzYvdWtN777hpNk",
    authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
    projectId: "sinyuubuturyuu-86aeb",
    storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
    messagingSenderId: "213947378677",
    appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
    measurementId: "G-F9VYGCTHEV"
  });

  const uiState = {
    mounted: false,
    badgeRefreshToken: 0,
    observer: null,
    refreshTimer: 0,
    pendingRefreshOptions: null,
    lastBadgeSyncAt: 0,
    summaryCache: new Map()
  };
  const runtimeState = {
    promise: null,
    featureStateInitialized: false
  };

  function normalizeText(value) {
    return String(value ?? "").trim();
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
    const currentValue = window.localStorage.getItem(FEATURE_STORAGE_KEY);
    if (currentValue !== "on" && currentValue !== "off") {
      window.localStorage.setItem(FEATURE_STORAGE_KEY, "on");
    }
    runtimeState.featureStateInitialized = true;
  }

  function hasFirebaseConfig() {
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = FIREBASE_CONFIG[key];
      return typeof value === "string" && value.trim();
    });
  }

  function getFeatureState() {
    ensureFeatureStateInitialized();
    const value = window.localStorage.getItem(FEATURE_STORAGE_KEY);
    if (value === "on" || value === "off") {
      return value;
    }
    window.localStorage.setItem(FEATURE_STORAGE_KEY, "off");
    return "off";
  }

  function isEnabled() {
    return getFeatureState() === "on";
  }

  function setEnabled(enabled) {
    ensureFeatureStateInitialized();
    window.localStorage.setItem(FEATURE_STORAGE_KEY, enabled ? "on" : "off");
    syncLauncherUi();
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
        app = typeof getApps === "function" && getApps().length
          ? getApp()
          : initializeApp(FIREBASE_CONFIG);
      }
      if (!auth) {
        auth = authModule.getAuth(app);
      }

      if (!auth.currentUser && typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
      if (!auth.currentUser) {
        try {
          await authModule.signInAnonymously(auth);
        } catch (error) {
          throw new Error(`ログインしてください: ${error && error.message ? error.message : error}`);
        }
      }

      return {
        db: firestoreModule.getFirestore(app),
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
    if (!isEnabled()) {
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
    if (!isEnabled()) {
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
      ".driver-points-badge[hidden] { display: none !important; }"
    ].join("\n");
    document.head.appendChild(style);
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
    if (!isEnabled() || !selection.driverName || !selection.vehicleNumber) {
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
      console.warn("Failed to load driver points:", error);
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

  function syncLauncherUi(options = {}) {
    requestBadgeRefresh(options);
  }

  function mountLauncherUi() {
    if (uiState.mounted) {
      syncLauncherUi({ reason: "remount" });
      return;
    }
    uiState.mounted = true;
    ensureBadgeElements();
    observeLauncherSelection();
    requestBadgeRefresh({ force: true, reason: "mount", delayMs: 0 });
  }

  function bootUiWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountLauncherUi, { once: true });
      return;
    }
    mountLauncherUi();
  }

  window.addEventListener("storage", (event) => {
    if (event.key === FEATURE_STORAGE_KEY) {
      syncLauncherUi({ reason: "storage" });
    }
  });

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
