(function () {
  "use strict";

  const sharedSettings = window.SharedAppSettings || null;
  const referenceConfig = window.APP_FIREBASE_DIRECTORY_CONFIG || window.APP_FIREBASE_CONFIG || null;
  const referenceSyncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || window.APP_FIREBASE_SYNC_OPTIONS || {};
  const pointsConfig = window.DRIVER_POINTS_FIREBASE_CONFIG || null;
  const pointsSettings = window.DRIVER_POINTS_FIREBASE_SETTINGS || {};
  const SERVER_GET_OPTIONS = Object.freeze({ source: "server" });
  const DAILY_COLLECTION = "getujinitijyoutenkenhyou";
  const TIRE_COLLECTION = "getujitiretenkenhyou";
  const LOG_COLLECTION = "admin_data_adjustment_logs";
  const SUMMARY_KIND = "driver_points_summary";
  const EVENT_KIND = "driver_points_event";
  const DAILY_SOURCE = "dailyInspection";
  const TIRE_SOURCE = "monthlyTireInspection";

  const optionsDocRefs = Object.freeze({
    vehicles: {
      collection: referenceSyncOptions.collection || "syainmeibo",
      id: "monthly_tire_company_settings_backup_vehicles_slot1"
    },
    drivers: {
      collection: referenceSyncOptions.collection || "syainmeibo",
      id: "monthly_tire_company_settings_backup_drivers_slot1"
    }
  });

  const elements = {
    driverSelect: document.getElementById("driverSelect"),
    vehicleSelect: document.getElementById("vehicleSelect"),
    monthSelect: document.getElementById("monthSelect"),
    reviewButton: document.getElementById("reviewButton"),
    executeButton: document.getElementById("executeButton"),
    currentPointsValue: document.getElementById("currentPointsValue"),
    currentPointsMeta: document.getElementById("currentPointsMeta"),
    overviewDaily: document.getElementById("overviewDaily"),
    overviewTire: document.getElementById("overviewTire"),
    overviewEvents: document.getElementById("overviewEvents"),
    overviewMonthPoints: document.getElementById("overviewMonthPoints"),
    eventHistoryBody: document.getElementById("eventHistoryBody"),
    reviewSection: document.getElementById("reviewSection"),
    relatedList: document.getElementById("relatedList"),
    deletePlanList: document.getElementById("deletePlanList"),
    integrityList: document.getElementById("integrityList"),
    summaryChangeText: document.getElementById("summaryChangeText"),
    statusText: document.getElementById("statusText")
  };

  const state = {
    optionSourceReady: false,
    loading: false,
    executing: false,
    loadToken: 0,
    referenceDb: null,
    pointsDb: null,
    activeSchema: null,
    vehicleOptions: [],
    driverOptions: [],
    currentSummary: null,
    allEvents: [],
    monthEvents: [],
    dailyRecords: [],
    tireRecords: [],
    monthsWithData: new Set(),
    selectedEventId: "",
    review: null
  };

  bindEvents();
  void initialize();

  function bindEvents() {
    elements.driverSelect.addEventListener("change", handleSelectionChanged);
    elements.vehicleSelect.addEventListener("change", handleSelectionChanged);
    elements.monthSelect.addEventListener("change", handleSelectionChanged);
    elements.reviewButton.addEventListener("click", function () {
      buildAndRenderReview();
    });
    elements.executeButton.addEventListener("click", function () {
      void executeReview();
    });
    elements.eventHistoryBody.addEventListener("change", function (event) {
      const target = event.target;
      if (!target || target.name !== "eventChoice") {
        return;
      }
      state.selectedEventId = normalizeText(target.value);
      resetReview();
      syncButtons();
    });
  }

  async function initialize() {
    setStatus("候補と Firebase 接続を読み込んでいます...");
    syncButtons();
    renderMonthOptions();

    try {
      await Promise.all([
        loadSelectableOptions(),
        initializePointsDb()
      ]);
      state.optionSourceReady = true;
      setStatus("乗務員、車番、対象月を選択してください。");
    } catch (error) {
      console.warn("Failed to initialize data adjustment page:", error);
      setStatus("初期化に失敗しました: " + formatError(error), true);
    } finally {
      syncButtons();
    }
  }

  async function loadSelectableOptions() {
    const localOptions = getLocalOptions();
    let cloudVehicles = [];
    let cloudDrivers = [];

    if (referenceConfig && window.firebase) {
      try {
        state.referenceDb = await ensureDb(referenceConfig, {
          useAnonymousAuth: referenceSyncOptions.useAnonymousAuth !== false
        }, "shared-settings-reference");

        const snapshots = await Promise.all([
          state.referenceDb.collection(optionsDocRefs.vehicles.collection).doc(optionsDocRefs.vehicles.id).get(),
          state.referenceDb.collection(optionsDocRefs.drivers.collection).doc(optionsDocRefs.drivers.id).get()
        ]);

        cloudVehicles = getStringArray(snapshots[0].exists ? snapshots[0].data() : null);
        cloudDrivers = getStringArray(snapshots[1].exists ? snapshots[1].data() : null);
      } catch (error) {
        console.warn("Failed to load shared options from Firebase:", error);
      }
    }

    state.vehicleOptions = buildVehicleOptions(localOptions.vehicles, cloudVehicles);
    state.driverOptions = buildDriverOptions(localOptions.drivers, cloudDrivers);
    renderOptions(elements.vehicleSelect, state.vehicleOptions, "車番を選択");
    renderOptions(elements.driverSelect, state.driverOptions, "乗務員を選択");
  }

  async function initializePointsDb() {
    if (!pointsConfig || !window.firebase) {
      throw new Error("driver_points_config_missing");
    }
    state.pointsDb = await ensureDb(pointsConfig, pointsSettings, pointsSettings.appName || "driver-points-app");
  }

  async function ensureDb(config, settings, appName) {
    const app = getOrCreateFirebaseApp(config, appName);
    const auth = app.auth();
    const authApi = window.DevFirebaseAuth;

    if (authApi && typeof authApi.ensureCompatUser === "function") {
      await authApi.ensureCompatUser(auth, { waitMs: 5000 });
    } else if (!auth.currentUser) {
      throw new Error("ログインしてください。");
    }

    return app.firestore();
  }

  function getOrCreateFirebaseApp(config, appName) {
    const existingApp = window.firebase.apps.find(function (app) {
      return app.name === appName;
    });
    return existingApp || window.firebase.initializeApp(config, appName);
  }

  function getLocalOptions() {
    if (!sharedSettings || typeof sharedSettings.ensureState !== "function") {
      return { vehicles: [], drivers: [] };
    }
    const sharedState = sharedSettings.ensureState();
    return {
      vehicles: Array.isArray(sharedState.vehicles) ? sharedState.vehicles : [],
      drivers: Array.isArray(sharedState.drivers) ? sharedState.drivers : []
    };
  }

  function buildVehicleOptions() {
    const unique = [];
    const seen = new Set();
    Array.from(arguments).forEach(function (values) {
      (values || []).forEach(function (value) {
        const label = normalizeText(value);
        const key = normalizeVehicleKey(label);
        if (!label || !key || seen.has(key)) {
          return;
        }
        seen.add(key);
        unique.push({ value: label, label: label, key: key });
      });
    });
    return unique.sort(function (left, right) {
      return left.label.localeCompare(right.label, "ja", { numeric: true, sensitivity: "base" });
    });
  }

  function buildDriverOptions() {
    const mergedDrivers = [];
    Array.from(arguments).forEach(function (values) {
      (values || []).forEach(function (value) {
        const rawValue = normalizeText(value);
        if (rawValue) {
          mergedDrivers.push(rawValue);
        }
      });
    });

    const orderedDrivers = sharedSettings && typeof sharedSettings.normalizeDrivers === "function"
      ? sharedSettings.normalizeDrivers(mergedDrivers)
      : mergedDrivers;
    const options = [];
    const seen = new Set();

    orderedDrivers.forEach(function (value) {
      const rawValue = normalizeText(value);
      const label = normalizeDriverName(value);
      const key = normalizeDriverKey(value);
      if (!label || !key || seen.has(key)) {
        return;
      }
      seen.add(key);
      options.push({ value: rawValue || label, label: label, key: key });
    });

    return options;
  }

  function renderOptions(select, options, placeholder) {
    select.innerHTML = "";
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);

    options.forEach(function (option) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.appendChild(optionElement);
    });
  }

  function renderMonthOptions() {
    const today = new Date();
    const currentFiscalYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
    const months = [];
    for (let year = currentFiscalYear - 2; year <= currentFiscalYear + 1; year += 1) {
      for (let month = 4; month <= 15; month += 1) {
        const displayYear = month <= 12 ? year : year + 1;
        const displayMonth = month <= 12 ? month : month - 12;
        const value = displayYear + "-" + String(displayMonth).padStart(2, "0");
        months.push({ value: value, label: displayYear + "年" + displayMonth + "月" });
      }
    }

    elements.monthSelect.innerHTML = "";
    months.forEach(function (month) {
      const option = document.createElement("option");
      option.value = month.value;
      option.dataset.baseLabel = month.label;
      option.textContent = month.label;
      elements.monthSelect.appendChild(option);
    });
    elements.monthSelect.value = buildLocalMonthKey(today);
  }

  function updateMonthOptionMarkers(monthsWithData) {
    const selectedValue = elements.monthSelect.value;
    const dataMonths = monthsWithData instanceof Set ? monthsWithData : new Set();

    Array.from(elements.monthSelect.options).forEach(function (option) {
      const baseLabel = option.dataset.baseLabel || option.textContent.replace(/^●\s*/, "");
      option.dataset.baseLabel = baseLabel;
      option.textContent = dataMonths.has(option.value) ? "● " + baseLabel : baseLabel;
    });

    elements.monthSelect.value = selectedValue;
  }

  function handleSelectionChanged() {
    state.selectedEventId = "";
    resetReview();
    syncButtons();

    if (!hasBaseSelection()) {
      resetLoadedData();
      renderContext();
      setStatus("乗務員、車番、対象月を選択してください。");
      return;
    }

    void loadContext();
  }

  async function loadContext() {
    const token = ++state.loadToken;
    const vehicle = normalizeText(elements.vehicleSelect.value);
    const driverOption = getSelectedDriverOption();
    const month = normalizeMonthKey(elements.monthSelect.value);
    if (!vehicle || !driverOption || !month || !state.pointsDb) {
      return;
    }

    state.loading = true;
    setStatus("対象データを読み込んでいます...");
    syncButtons();

    try {
      const schema = await resolveSchema(false);
      const summary = await findPointSummaryRecord(schema, vehicle, driverOption);
      const allEvents = await loadPointEvents(schema, vehicle, driverOption);
      const dailyRecords = await loadDailyRecords(vehicle, driverOption, month);
      const tireRecords = await loadTireRecords(vehicle, driverOption, month);
      const monthsWithData = await loadMonthsWithData(vehicle, driverOption, allEvents, dailyRecords, tireRecords);

      if (token !== state.loadToken) {
        return;
      }

      state.activeSchema = schema;
      state.currentSummary = summary;
      state.allEvents = allEvents;
      state.monthEvents = allEvents.filter(function (eventRecord) {
        return getEventMonth(eventRecord.data) === month;
      }).sort(compareEventRecords);
      state.dailyRecords = dailyRecords;
      state.tireRecords = tireRecords;
      state.monthsWithData = monthsWithData;

      renderContext();
      setStatus("関連データを読み込みました。");
    } catch (error) {
      console.warn("Failed to load adjustment context:", error);
      resetLoadedData();
      renderContext();
      setStatus("対象データの読み込みに失敗しました: " + formatError(error), true);
    } finally {
      if (token === state.loadToken) {
        state.loading = false;
        syncButtons();
      }
    }
  }

  async function resolveSchema(forceReloadSchema) {
    if (!forceReloadSchema && state.activeSchema) {
      return state.activeSchema;
    }
    const collectionCandidates = buildCollectionCandidates();

    let firstUsableSchema = null;
    for (const collectionName of collectionCandidates) {
      const schema = await inspectCollection(collectionName);
      if (!schema) {
        continue;
      }
      if (!firstUsableSchema) {
        firstUsableSchema = schema;
      }
      if (schema.detectedFromDocuments) {
        state.activeSchema = schema;
        return schema;
      }
    }

    state.activeSchema = firstUsableSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
    return state.activeSchema;
  }

  function buildCollectionCandidates() {
    const candidates = [];
    const seen = new Set();
    const preferredCollection = normalizeText(pointsSettings.preferredCollection);
    if (preferredCollection) {
      candidates.push(preferredCollection);
      seen.add(preferredCollection);
    }
    (pointsSettings.collectionCandidates || []).forEach(function (value) {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue || seen.has(normalizedValue)) {
        return;
      }
      seen.add(normalizedValue);
      candidates.push(normalizedValue);
    });
    return candidates.length ? candidates : ["driver-points"];
  }

  async function inspectCollection(collectionName) {
    try {
      const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(collectionName).limit(100));
      if (snapshot.empty) {
        return buildFallbackSchema(collectionName);
      }
      const docs = snapshot.docs.map(function (docSnapshot) {
        return { id: docSnapshot.id, data: docSnapshot.data() || {} };
      });
      return inferSchema(collectionName, docs);
    } catch (error) {
      console.warn("Failed to inspect point collection:", collectionName, error);
      return null;
    }
  }

  function inferSchema(collectionName, docs) {
    const sampleFields = new Set();
    docs.forEach(function (entry) {
      Object.keys(entry.data || {}).forEach(function (fieldName) {
        sampleFields.add(fieldName);
      });
    });

    return {
      collectionName: collectionName,
      vehicleField: inferFieldName(sampleFields, pointsSettings.vehicleFieldCandidates, /vehicle|car|truck/i) || "vehicleNumber",
      driverField: inferFieldName(sampleFields, pointsSettings.driverFieldCandidates, /driver|name|staff|employee/i) || "driverKey",
      pointsField: inferFieldName(sampleFields, pointsSettings.pointsFieldCandidates, /point|score/i) || "totalPoints",
      updatedAtField: inferFieldName(sampleFields, pointsSettings.updatedAtFieldCandidates, /updated|created|modified/i) || "updatedAt",
      docIdPatterns: Array.isArray(pointsSettings.docIdPatterns) ? pointsSettings.docIdPatterns.slice() : [],
      detectedFromDocuments: true
    };
  }

  function inferFieldName(fieldNames, candidates, fallbackPattern) {
    for (const candidate of candidates || []) {
      if (fieldNames.has(candidate)) {
        return candidate;
      }
    }
    for (const fieldName of fieldNames) {
      if (fallbackPattern.test(fieldName)) {
        return fieldName;
      }
    }
    return "";
  }

  function buildFallbackSchema(collectionName) {
    return {
      collectionName: collectionName,
      vehicleField: "vehicleNumber",
      driverField: "driverKey",
      pointsField: "totalPoints",
      updatedAtField: "updatedAt",
      docIdPatterns: Array.isArray(pointsSettings.docIdPatterns) ? pointsSettings.docIdPatterns.slice() : [],
      detectedFromDocuments: false
    };
  }

  async function findPointSummaryRecord(schema, vehicle, driverOption) {
    const collectionRef = state.pointsDb.collection(schema.collectionName);
    const identity = buildSelectionIdentity(driverOption.label, vehicle);
    const directDoc = await getServerDocumentSnapshot(collectionRef.doc(buildSummaryDocId(identity)));
    if (directDoc.exists) {
      const record = { id: directDoc.id, ref: directDoc.ref, data: directDoc.data() || {} };
      if (recordMatchesSelection(record, schema, vehicle, driverOption)) {
        return record;
      }
    }

    const summaryKindValue = normalizeText(pointsSettings.summaryKindValue) || SUMMARY_KIND;
    try {
      const snapshot = await getServerQuerySnapshot(collectionRef.where("kind", "==", summaryKindValue).limit(600));
      const candidates = snapshot.docs.map(toRecord).filter(function (record) {
        return isSummaryRecord(record) && recordMatchesSelection(record, schema, vehicle, driverOption);
      });
      return pickLatestRecord(candidates, schema);
    } catch (error) {
      console.warn("Summary query failed:", error);
    }

    const fallbackSnapshot = await getServerQuerySnapshot(collectionRef.limit(600));
    const candidates = fallbackSnapshot.docs.map(toRecord).filter(function (record) {
      return isSummaryRecord(record) && recordMatchesSelection(record, schema, vehicle, driverOption);
    });
    return pickLatestRecord(candidates, schema);
  }

  async function loadPointEvents(schema, vehicle, driverOption) {
    const collectionRef = state.pointsDb.collection(schema.collectionName);
    let docs = [];
    try {
      const snapshot = await getServerQuerySnapshot(collectionRef.where("kind", "==", EVENT_KIND).limit(1000));
      docs = snapshot.docs;
    } catch (error) {
      console.warn("Point event query failed, falling back to collection scan:", error);
      const snapshot = await getServerQuerySnapshot(collectionRef.limit(1000));
      docs = snapshot.docs;
    }

    return docs.map(toRecord).filter(function (record) {
      return isEventRecord(record) && recordMatchesSelection(record, schema, vehicle, driverOption);
    });
  }

  async function loadDailyRecords(vehicle, driverOption, month) {
    let docs = [];
    try {
      const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(DAILY_COLLECTION).where("month", "==", month).limit(300));
      docs = snapshot.docs;
    } catch (error) {
      console.warn("Daily inspection month query failed:", error);
      const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(DAILY_COLLECTION).limit(500));
      docs = snapshot.docs;
    }

    return docs.map(toRecord).filter(function (record) {
      return normalizeMonthKey(record.data.month) === month
        && dailyRecordMatchesSelection(record.data, vehicle, driverOption);
    });
  }

  async function loadTireRecords(vehicle, driverOption, month) {
    const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(TIRE_COLLECTION).limit(700));
    return snapshot.docs.map(toRecord).filter(function (record) {
      return getTireRecordMonth(record.data) === month
        && tireRecordMatchesSelection(record.data, vehicle, driverOption);
    });
  }

  async function loadMonthsWithData(vehicle, driverOption, events, dailyRecords, tireRecords) {
    const months = new Set();

    (events || []).forEach(function (eventRecord) {
      const month = getEventMonth(eventRecord.data);
      if (month) {
        months.add(month);
      }
    });

    (dailyRecords || []).forEach(function (record) {
      const month = normalizeMonthKey(record.data && record.data.month);
      if (month && dailyRecordHasAnyContent(record.data)) {
        months.add(month);
      }
    });

    (tireRecords || []).forEach(function (record) {
      const month = getTireRecordMonth(record.data);
      if (month) {
        months.add(month);
      }
    });

    await Promise.all([
      addDailyDataMonths(months, vehicle, driverOption),
      addTireDataMonths(months, vehicle, driverOption)
    ]);

    return months;
  }

  async function addDailyDataMonths(months, vehicle, driverOption) {
    try {
      const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(DAILY_COLLECTION).limit(1000));
      snapshot.docs.map(toRecord).forEach(function (record) {
        const month = normalizeMonthKey(record.data && record.data.month);
        if (month && dailyRecordMatchesSelection(record.data, vehicle, driverOption) && dailyRecordHasAnyContent(record.data)) {
          months.add(month);
        }
      });
    } catch (error) {
      console.warn("Failed to collect daily inspection data months:", error);
    }
  }

  async function addTireDataMonths(months, vehicle, driverOption) {
    try {
      const snapshot = await getServerQuerySnapshot(state.pointsDb.collection(TIRE_COLLECTION).limit(1000));
      snapshot.docs.map(toRecord).forEach(function (record) {
        const month = getTireRecordMonth(record.data);
        if (month && tireRecordMatchesSelection(record.data, vehicle, driverOption)) {
          months.add(month);
        }
      });
    } catch (error) {
      console.warn("Failed to collect monthly tire data months:", error);
    }
  }

  function toRecord(docSnapshot) {
    return {
      id: docSnapshot.id,
      ref: docSnapshot.ref,
      data: docSnapshot.data() || {}
    };
  }

  function recordMatchesSelection(record, schema, vehicle, driverOption) {
    const data = record && record.data ? record.data : {};
    return dataVehicleMatches(data, vehicle, [schema.vehicleField].concat(pointsSettings.vehicleFieldCandidates || []))
      && dataDriverMatches(data, driverOption, [schema.driverField].concat(pointsSettings.driverFieldCandidates || []));
  }

  function dailyRecordMatchesSelection(data, vehicle, driverOption) {
    return dataVehicleMatches(data, vehicle, [
      "vehicle", "vehicleRaw", "vehicleDisplay", "vehicleAliases", "vehicleNormalized", "vehicleNumber", "vehicleKey"
    ]) && dataDriverMatches(data, driverOption, [
      "driver", "driverRaw", "driverDisplay", "driverAliases", "driverNormalized", "driverName", "driverKey"
    ]);
  }

  function tireRecordMatchesSelection(data, vehicle, driverOption) {
    return dataVehicleMatches(data, vehicle, ["vehicleNumber", "vehicle", "vehicleKey", "vehicleNo"])
      && dataDriverMatches(data, driverOption, ["driverName", "driver", "driverKey", "driverRaw", "driverDisplay"]);
  }

  function dataVehicleMatches(data, vehicle, fieldNames) {
    const targetKey = normalizeVehicleKey(vehicle);
    const values = collectNormalizedFieldValues(data, uniqueFieldNames(fieldNames), normalizeVehicleKey);
    return values.includes(targetKey);
  }

  function dataDriverMatches(data, driverOption, fieldNames) {
    if (!driverOption) {
      return false;
    }
    const keys = collectNormalizedFieldValues(data, uniqueFieldNames(fieldNames), normalizeDriverKey);
    return keys.includes(driverOption.key) || keys.includes(normalizeDriverKey(driverOption.label));
  }

  function renderContext() {
    const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
    const currentPoints = state.currentSummary ? getRecordPoints(state.currentSummary, schema) : 0;
    const monthPointTotal = calculateEventBreakdown(state.monthEvents).total;
    const dailyDays = collectDailyDays(state.dailyRecords);

    elements.currentPointsValue.textContent = hasBaseSelection() ? String(currentPoints) : "--";
    elements.currentPointsMeta.textContent = state.currentSummary
      ? "ポイントサマリーを読み込みました。"
      : (hasBaseSelection() ? "ポイントサマリーは未作成です。" : "まだ対象を選択していません。");
    updateMonthOptionMarkers(hasBaseSelection() ? state.monthsWithData : new Set());
    elements.overviewDaily.textContent = hasBaseSelection() ? String(dailyDays.length) + "日分" : "--";
    elements.overviewTire.textContent = hasBaseSelection() ? (state.tireRecords.length ? "あり" : "なし") : "--";
    elements.overviewEvents.textContent = hasBaseSelection() ? String(state.monthEvents.length) + "件" : "--";
    elements.overviewMonthPoints.textContent = hasBaseSelection() ? formatSignedPoints(monthPointTotal) : "--";
    renderEventHistory();
    syncButtons();
  }

  function renderEventHistory() {
    if (!hasBaseSelection()) {
      elements.eventHistoryBody.innerHTML = '<tr><td colspan="5">対象を選択してください。</td></tr>';
      return;
    }
    if (!state.monthEvents.length) {
      elements.eventHistoryBody.innerHTML = '<tr><td colspan="5">対象月のポイントイベントはありません。</td></tr>';
      return;
    }

    elements.eventHistoryBody.innerHTML = state.monthEvents.map(function (eventRecord) {
      const data = eventRecord.data || {};
      const checked = state.selectedEventId === eventRecord.id ? " checked" : "";
      return [
        "<tr>",
        '<td><input type="radio" name="eventChoice" value="' + escapeHtml(eventRecord.id) + '"' + checked + "></td>",
        "<td>" + escapeHtml(getEventDateLabel(data)) + "</td>",
        '<td><span class="event-source">' + escapeHtml(getEventSourceLabel(data.source)) + "</span></td>",
        '<td>' + escapeHtml(formatSignedPoints(getNumericValue(data.points))) + "</td>",
        '<td><div class="event-meta">'
          + '<span>ID: ' + escapeHtml(eventRecord.id) + "</span>"
          + '<span>月: ' + escapeHtml(getEventMonth(data) || "-") + " / 日: " + escapeHtml(getEventDay(data) || "-") + "</span>"
          + '<span>メモ: ' + escapeHtml(normalizeText(data.memo) || "-") + "</span>"
          + "</div></td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function buildAndRenderReview() {
    resetReview();

    if (!hasBaseSelection()) {
      setStatus("関連データを確認する前に乗務員、車番、対象月を選択してください。", true);
      return;
    }
    if (state.loading) {
      setStatus("対象データの読み込み中です。少し待ってから確認してください。", true);
      return;
    }

    state.review = buildReview();
    renderReview();
    syncButtons();
  }

  function buildReview() {
    const vehicle = normalizeText(elements.vehicleSelect.value);
    const driverOption = getSelectedDriverOption();
    const month = normalizeMonthKey(elements.monthSelect.value);
    const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
    const summaryBefore = state.currentSummary ? getRecordPoints(state.currentSummary, schema) : 0;
    const beforeBreakdown = calculateEventBreakdown(state.allEvents);

    const review = {
      targetType: "",
      vehicle: vehicle,
      driverOption: driverOption,
      month: month,
      day: null,
      summaryBefore: summaryBefore,
      summaryAfter: summaryBefore,
      eventTotalBefore: beforeBreakdown.total,
      eventTotalAfter: beforeBreakdown.total,
      relatedItems: [],
      deleteItems: [],
      integrityItems: [],
      errors: [],
      warnings: [],
      deleteEventIds: [],
      deleteTireRecords: [],
      deleteDailyDays: [],
      summaryPayload: null,
      deleteSummaryAfter: false,
      logAction: "",
      canExecute: false,
      executeLabel: "削除を実行"
    };

    buildSelectedEventReview(review);

    if (summaryBefore !== beforeBreakdown.total) {
      review.errors.push(
        "現在ポイントとイベント合計が一致していません。安全のため削除できません。Firebase の履歴とサマリーを確認してください。"
      );
    }

    const remainingEvents = state.allEvents.filter(function (eventRecord) {
      return !review.deleteEventIds.includes(eventRecord.id);
    });
    const afterBreakdown = calculateEventBreakdown(remainingEvents);
    review.eventTotalAfter = afterBreakdown.total;
    review.summaryAfter = afterBreakdown.total;
    review.deleteSummaryAfter = remainingEvents.length === 0;
    review.summaryPayload = buildSummaryPayload(schema, review, afterBreakdown);

    review.integrityItems = buildIntegrityMessages(review);
    review.canExecute = review.errors.length === 0
      && Boolean(review.summaryPayload)
      && (review.deleteEventIds.length > 0 || review.deleteTireRecords.length > 0 || review.deleteDailyDays.length > 0);

    return review;
  }

  function buildSelectedEventReview(review) {
    const selectedEvent = state.monthEvents.find(function (eventRecord) {
      return eventRecord.id === state.selectedEventId;
    });
    if (!selectedEvent) {
      review.errors.push("削除したい履歴を一覧から1件選択してください。");
      return;
    }

    const source = normalizeText(selectedEvent.data && selectedEvent.data.source);
    if (source === DAILY_SOURCE) {
      review.targetType = "dailyInspection";
      buildDailyReview(review, selectedEvent);
      return;
    }
    if (source === TIRE_SOURCE) {
      review.targetType = "monthlyTireInspection";
      buildMonthlyTireReview(review, selectedEvent);
      return;
    }

    review.targetType = "pointEvent";
    buildPointEventReview(review, selectedEvent);
  }

  function buildDailyReview(review, selectedEvent) {
    review.logAction = "deleteDailyInspectionWithRelatedPoints";
    if (!selectedEvent) {
      review.errors.push("日次点検削除では、対象月のポイントイベント一覧から削除する日付の履歴を1件選択してください。");
      return;
    }
    if (normalizeText(selectedEvent.data && selectedEvent.data.source) !== DAILY_SOURCE) {
      review.errors.push("日次点検削除では、日次点検のポイントイベントを選択してください。");
      return;
    }

    const day = normalizeDayNumber(getEventDay(selectedEvent.data));
    if (!day) {
      review.errors.push("選択した日次点検イベントから対象日を判断できません。");
      return;
    }
    review.day = day;

    const dailyRecords = state.dailyRecords.filter(function (record) {
      return dailyRecordHasDay(record.data, day);
    });
    const dailyEvents = state.monthEvents.filter(function (eventRecord) {
      const data = eventRecord.data || {};
      return normalizeText(data.source) === DAILY_SOURCE && normalizeDayNumber(getEventDay(data)) === day;
    });

    review.relatedItems.push("対象日: " + formatMonthLabel(review.month) + " " + day + "日");
    review.relatedItems.push("日次点検データ: " + dailyRecords.length + "件");
    review.relatedItems.push("対応ポイントイベント: " + dailyEvents.length + "件");

    if (dailyRecords.length === 0) {
      review.logAction = "deleteOrphanDailyInspectionPointEvent";
      review.warnings.push("元の日次点検データが見つからないため、選択したポイントイベントのみ削除します。");
    } else if (dailyRecords.length > 1) {
      review.errors.push("対象の日次点検データが複数見つかりました。どれを削除すべきか判断できません。");
    }
    if (dailyEvents.length !== 1) {
      review.errors.push(
        dailyEvents.length === 0
          ? "対象の日次点検に対応するポイントイベントが見つかりません。"
          : "対象の日次点検に対応するポイントイベントが複数あります。どれを削除すべきか判断できません。"
      );
    } else if (dailyEvents[0].id !== selectedEvent.id) {
      review.errors.push("選択された日次点検イベントと、削除候補のイベントが一致しません。");
    }

    if (dailyRecords.length === 1) {
      const details = describeDailyDayDetails(dailyRecords[0].data, day);
      details.forEach(function (detail) {
        review.relatedItems.push(detail);
      });
      review.deleteDailyDays.push({ record: dailyRecords[0], day: day });
      review.deleteItems.push("日次点検データ: " + dailyRecords[0].id + " の " + day + "日分");
    }
    if (dailyEvents.length === 1 && dailyEvents[0].id === selectedEvent.id) {
      review.deleteEventIds.push(selectedEvent.id);
      review.deleteItems.push("ポイントイベント: " + selectedEvent.id + " (" + formatSignedPoints(getNumericValue(selectedEvent.data.points)) + ")");
    }
  }

  function buildMonthlyTireReview(review, selectedEvent) {
    review.logAction = "deleteMonthlyTireInspectionWithRelatedPoints";
    const tireEvents = state.monthEvents.filter(function (eventRecord) {
      return normalizeText(eventRecord.data && eventRecord.data.source) === TIRE_SOURCE;
    });

    review.relatedItems.push("対象月: " + formatMonthLabel(review.month));
    review.relatedItems.push("月次タイヤ点検データ: " + state.tireRecords.length + "件");
    review.relatedItems.push("対応ポイントイベント: " + tireEvents.length + "件");

    if (state.tireRecords.length === 0) {
      review.logAction = "deleteOrphanMonthlyTireInspectionPointEvent";
      review.warnings.push("元の月次タイヤ点検データが見つからないため、選択したポイントイベントのみ削除します。");
    } else if (state.tireRecords.length > 1) {
      review.errors.push("対象月の月次タイヤ点検データが複数見つかりました。どれを削除すべきか判断できません。");
    }
    if (tireEvents.length !== 1) {
      review.errors.push(
        tireEvents.length === 0
          ? "対象月の月次タイヤ点検に対応するポイントイベントが見つかりません。"
          : "対象月の月次タイヤ点検に対応するポイントイベントが複数あります。どれを削除すべきか判断できません。"
      );
    }
    if (selectedEvent && tireEvents.length === 1 && tireEvents[0].id !== selectedEvent.id) {
      review.errors.push("選択された月次タイヤ点検イベントと、削除候補のイベントが一致しません。");
    }

    if (state.tireRecords.length === 1) {
      const data = state.tireRecords[0].data || {};
      review.relatedItems.push("点検日: " + (normalizeText(data.inspectionDate) || "-"));
      review.deleteTireRecords.push(state.tireRecords[0]);
      review.deleteItems.push("月次タイヤ点検データ: " + state.tireRecords[0].id);
    }
    if (tireEvents.length === 1 && tireEvents[0].id === selectedEvent.id) {
      review.deleteEventIds.push(tireEvents[0].id);
      review.deleteItems.push("ポイントイベント: " + tireEvents[0].id + " (" + formatSignedPoints(getNumericValue(tireEvents[0].data.points)) + ")");
    }
  }

  function buildPointEventReview(review, selectedEvent) {
    review.logAction = "deletePointEventOnly";
    if (!selectedEvent) {
      review.errors.push("ポイントイベントのみ削除では、履歴一覧から削除するイベントを1件選択してください。");
      return;
    }

    const data = selectedEvent.data || {};
    review.relatedItems.push("選択イベント: " + selectedEvent.id);
    review.relatedItems.push("種別: " + getEventSourceLabel(data.source));
    review.relatedItems.push("ポイント: " + formatSignedPoints(getNumericValue(data.points)));
    review.deleteEventIds.push(selectedEvent.id);
    review.deleteItems.push("ポイントイベントのみ削除: " + selectedEvent.id);

    if (normalizeText(data.source) === DAILY_SOURCE && sourceDailyDataExists(data)) {
      review.warnings.push("元の日次点検データが残っている可能性があります。ポイントイベントのみ削除として処理します。");
    }
    if (normalizeText(data.source) === TIRE_SOURCE && state.tireRecords.length > 0) {
      review.warnings.push("元の月次タイヤ点検データが残っている可能性があります。ポイントイベントのみ削除として処理します。");
    }
  }

  function buildIntegrityMessages(review) {
    const messages = [];
    review.errors.forEach(function (message) {
      messages.push({ type: "error", text: message });
    });
    review.warnings.forEach(function (message) {
      messages.push({ type: "warning", text: message });
    });

    if (review.errors.length === 0) {
      messages.push({ type: "ok", text: "整合性: OK" });
    } else {
      messages.push({ type: "error", text: "整合性: NG" });
    }

    if (review.summaryBefore !== review.eventTotalBefore) {
      messages.push({
        type: "error",
        text: "サマリー " + review.summaryBefore + "pt / イベント合計 " + review.eventTotalBefore + "pt"
      });
    } else {
      messages.push({ type: "ok", text: "サマリーとイベント合計は一致しています。" });
    }

    return messages;
  }

  function renderReview() {
    const review = state.review;
    if (!review) {
      return;
    }

    elements.reviewSection.hidden = false;
    elements.relatedList.innerHTML = renderReviewItems(review.relatedItems, "");
    elements.deletePlanList.innerHTML = renderReviewItems(review.deleteItems.length ? review.deleteItems : ["削除予定はありません。"], "");
    elements.integrityList.innerHTML = review.integrityItems.map(function (item) {
      return '<li class="' + escapeHtml(item.type) + '">' + escapeHtml(item.text) + "</li>";
    }).join("");
    elements.summaryChangeText.textContent = "ポイントサマリー: "
      + String(review.summaryBefore) + "pt → " + String(review.summaryAfter) + "pt";
    elements.executeButton.textContent = review.executeLabel || "削除を実行";
    elements.executeButton.disabled = !review.canExecute || state.executing;
    setStatus(review.canExecute ? "削除実行前に内容を確認してください。" : "整合性NGまたは実行対象なしのため、実行できません。", !review.canExecute);
  }

  function renderReviewItems(items, className) {
    return (items || []).map(function (item) {
      return '<li class="' + escapeHtml(className || "") + '">' + escapeHtml(item) + "</li>";
    }).join("");
  }

  async function executeReview() {
    const review = state.review;
    if (!review || !review.canExecute || state.executing) {
      return;
    }

    const confirmMessage = [
      "この操作は元に戻せません。",
      "対象: " + (review.driverOption ? review.driverOption.label : "-") + " / " + review.vehicle,
      "月: " + formatMonthLabel(review.month),
      "ポイント: " + review.summaryBefore + "pt → " + review.summaryAfter + "pt",
      "",
      "実行してよろしいですか？"
    ].join("\n");
    if (!window.confirm(confirmMessage)) {
      return;
    }

    state.executing = true;
    syncButtons();
    setStatus("削除処理を実行しています...");

    try {
      const batch = state.pointsDb.batch();
      const FieldValue = window.firebase.firestore.FieldValue;
      const now = FieldValue.serverTimestamp();
      const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
      const summaryRef = getSummaryRef(schema, review);

      review.deleteDailyDays.forEach(function (entry) {
        batch.update(entry.record.ref, buildDailyDayDeletePayload(entry.day, FieldValue, now));
      });
      review.deleteTireRecords.forEach(function (record) {
        batch.delete(record.ref);
      });
      review.deleteEventIds.forEach(function (eventId) {
        const eventRecord = state.allEvents.find(function (record) {
          return record.id === eventId;
        });
        if (eventRecord) {
          batch.delete(eventRecord.ref);
        }
      });
      if (review.deleteSummaryAfter) {
        batch.delete(summaryRef);
      } else {
        batch.set(summaryRef, review.summaryPayload, { merge: true });
      }
      batch.set(state.pointsDb.collection(LOG_COLLECTION).doc(), buildLogPayload(review, FieldValue));

      await batch.commit();
      state.review = null;
      state.selectedEventId = "";
      elements.reviewSection.hidden = true;
      setStatus("データ調整を実行し、ログを保存しました。");
      await loadContext();
    } catch (error) {
      console.warn("Failed to execute data adjustment:", error);
      setStatus("データ調整の実行に失敗しました: " + formatError(error), true);
    } finally {
      state.executing = false;
      syncButtons();
    }
  }

  function buildDailyDayDeletePayload(day, FieldValue, now) {
    const dayKey = String(day);
    const payload = {
      updatedAt: now
    };
    [
      "checksByDay",
      "maintenanceRecordsByDay",
      "maintenanceNotesByDay",
      "maintenanceBottomByDay",
      "holidayFlagsByDay",
      "isHolidayByDay"
    ].forEach(function (fieldName) {
      payload[fieldName + "." + dayKey] = FieldValue.delete();
    });
    payload.holidayDays = FieldValue.arrayRemove(day, dayKey);
    payload.holidays = FieldValue.arrayRemove(dayKey, day);
    return payload;
  }

  function buildSummaryPayload(schema, review, breakdown) {
    const FieldValue = window.firebase.firestore.FieldValue;
    const payload = {
      kind: normalizeText(pointsSettings.summaryKindValue) || SUMMARY_KIND,
      driverKey: review.driverOption ? review.driverOption.key : "",
      driverName: review.driverOption ? review.driverOption.label : "",
      driverRaw: review.driverOption ? review.driverOption.value : "",
      vehicleKey: normalizeVehicleKey(review.vehicle),
      vehicleNumber: review.vehicle,
      totalPoints: breakdown.total,
      dailyInspectionPoints: breakdown.daily,
      monthlyTirePoints: breakdown.tire,
      manualAdjustmentPoints: breakdown.manual,
      otherPoints: breakdown.other,
      updatedAt: FieldValue.serverTimestamp(),
      lastSource: "adminDataAdjustment"
    };
    payload[schema.vehicleField || "vehicleNumber"] = schema.vehicleField === "vehicleKey"
      ? normalizeVehicleKey(review.vehicle)
      : review.vehicle;
    payload[schema.driverField || "driverKey"] = schema.driverField === "driverKey"
      ? (review.driverOption ? review.driverOption.key : "")
      : (review.driverOption ? review.driverOption.label : "");

    const pointsFieldName = resolvePointsFieldName(state.currentSummary ? state.currentSummary.data : null, schema);
    payload[pointsFieldName] = breakdown.total;

    if (!state.currentSummary) {
      payload.createdAt = FieldValue.serverTimestamp();
    }
    return payload;
  }

  function getSummaryRef(schema, review) {
    if (state.currentSummary && state.currentSummary.ref) {
      return state.currentSummary.ref;
    }
    const identity = buildSelectionIdentity(review.driverOption ? review.driverOption.label : "", review.vehicle);
    return state.pointsDb.collection(schema.collectionName).doc(buildSummaryDocId(identity));
  }

  function buildLogPayload(review, FieldValue) {
    const deletedDocs = [];
    review.deleteDailyDays.forEach(function (entry) {
      deletedDocs.push({
        collection: DAILY_COLLECTION,
        id: entry.record.id,
        operation: "deleteDay",
        day: entry.day
      });
    });
    review.deleteTireRecords.forEach(function (record) {
      deletedDocs.push({ collection: TIRE_COLLECTION, id: record.id, operation: "deleteDoc" });
    });
    review.deleteEventIds.forEach(function (eventId) {
      deletedDocs.push({
        collection: state.activeSchema ? state.activeSchema.collectionName : "driver-points",
        id: eventId,
        operation: "deleteDoc"
      });
    });

    return {
      action: review.logAction,
      target: {
        vehicleNumber: review.vehicle,
        driverName: review.driverOption ? review.driverOption.label : "",
        driverKey: review.driverOption ? review.driverOption.key : "",
        month: review.month,
        day: review.day || null,
        targetType: review.targetType
      },
      deletedDocs: deletedDocs,
      summaryBefore: review.summaryBefore,
      summaryAfter: review.summaryAfter,
      summaryDeleted: review.deleteSummaryAfter === true,
      eventTotalBefore: review.eventTotalBefore,
      eventTotalAfter: review.eventTotalAfter,
      warnings: review.warnings.slice(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "管理画面"
    };
  }

  function resetLoadedData() {
    state.currentSummary = null;
    state.allEvents = [];
    state.monthEvents = [];
    state.dailyRecords = [];
    state.tireRecords = [];
    state.monthsWithData = new Set();
    state.selectedEventId = "";
  }

  function resetReview() {
    state.review = null;
    elements.reviewSection.hidden = true;
    elements.executeButton.disabled = true;
  }

  function syncButtons() {
    const hasSelection = hasBaseSelection();
    elements.reviewButton.disabled = !hasSelection || state.loading || state.executing || !state.pointsDb;
    elements.executeButton.disabled = !state.review || !state.review.canExecute || state.executing;
  }

  function hasBaseSelection() {
    return Boolean(
      normalizeText(elements.vehicleSelect.value)
        && getSelectedDriverOption()
        && normalizeMonthKey(elements.monthSelect.value)
    );
  }

  function getSelectedDriverOption() {
    const selectedValue = normalizeText(elements.driverSelect.value);
    if (!selectedValue) {
      return null;
    }
    return state.driverOptions.find(function (option) {
      return option.value === selectedValue;
    }) || null;
  }

  function collectDailyDays(records) {
    const days = new Set();
    (records || []).forEach(function (record) {
      const data = record.data || {};
      collectDayKeys(data.checksByDay).forEach(days.add, days);
      collectDayKeys(data.maintenanceRecordsByDay).forEach(days.add, days);
      collectDayKeys(data.maintenanceNotesByDay).forEach(days.add, days);
      collectDayKeys(data.maintenanceBottomByDay).forEach(days.add, days);
      (data.holidayDays || data.holidays || []).forEach(function (day) {
        const normalizedDay = normalizeDayNumber(day);
        if (normalizedDay) {
          days.add(normalizedDay);
        }
      });
      collectTruthyDayFlags(data.holidayFlagsByDay).forEach(days.add, days);
      collectTruthyDayFlags(data.isHolidayByDay).forEach(days.add, days);
    });
    state.monthEvents.forEach(function (eventRecord) {
      if (normalizeText(eventRecord.data && eventRecord.data.source) === DAILY_SOURCE) {
        const day = normalizeDayNumber(getEventDay(eventRecord.data));
        if (day) {
          days.add(day);
        }
      }
    });
    return Array.from(days).sort(function (left, right) {
      return left - right;
    });
  }

  function collectDayKeys(source) {
    return Object.keys(source || {}).map(normalizeDayNumber).filter(Boolean);
  }

  function collectTruthyDayFlags(source) {
    return Object.entries(source || {}).filter(function (entry) {
      return Boolean(entry[1]);
    }).map(function (entry) {
      return normalizeDayNumber(entry[0]);
    }).filter(Boolean);
  }

  function dailyRecordHasDay(data, day) {
    const dayKey = String(day);
    return Boolean(
      data
        && (
          hasOwn(data.checksByDay, dayKey)
          || hasOwn(data.maintenanceRecordsByDay, dayKey)
          || hasOwn(data.maintenanceNotesByDay, dayKey)
          || hasOwn(data.maintenanceBottomByDay, dayKey)
          || hasOwn(data.holidayFlagsByDay, dayKey)
          || hasOwn(data.isHolidayByDay, dayKey)
          || (Array.isArray(data.holidayDays) && data.holidayDays.map(String).includes(dayKey))
          || (Array.isArray(data.holidays) && data.holidays.map(String).includes(dayKey))
        )
    );
  }

  function dailyRecordHasAnyContent(data) {
    if (!data || typeof data !== "object") {
      return false;
    }
    return Boolean(
      collectDayKeys(data.checksByDay).length
        || collectDayKeys(data.maintenanceRecordsByDay).length
        || collectDayKeys(data.maintenanceNotesByDay).length
        || collectDayKeys(data.maintenanceBottomByDay).length
        || collectTruthyDayFlags(data.holidayFlagsByDay).length
        || collectTruthyDayFlags(data.isHolidayByDay).length
        || (Array.isArray(data.holidayDays) && data.holidayDays.length)
        || (Array.isArray(data.holidays) && data.holidays.length)
    );
  }

  function describeDailyDayDetails(data, day) {
    const dayKey = String(day);
    const details = [];
    if (hasOwn(data.checksByDay, dayKey)) {
      details.push("点検チェック: あり");
    }
    if (hasOwn(data.maintenanceRecordsByDay, dayKey) || hasOwn(data.maintenanceNotesByDay, dayKey)) {
      details.push("整備記録: あり");
    }
    if (hasOwn(data.maintenanceBottomByDay, dayKey)) {
      details.push("下部の整備管理者印: あり");
    }
    if ((Array.isArray(data.holidayDays) && data.holidayDays.map(String).includes(dayKey))
      || (Array.isArray(data.holidays) && data.holidays.map(String).includes(dayKey))
      || hasOwn(data.holidayFlagsByDay, dayKey)
      || hasOwn(data.isHolidayByDay, dayKey)) {
      details.push("休日設定: あり");
    }
    return details.length ? details : ["対象日の詳細データ: あり"];
  }

  function sourceDailyDataExists(eventData) {
    const day = normalizeDayNumber(getEventDay(eventData));
    return state.dailyRecords.some(function (record) {
      return dailyRecordHasDay(record.data, day);
    });
  }

  function getTireRecordMonth(data) {
    return normalizeMonthKey(data && data.targetMonth)
      || normalizeMonthKey(normalizeText(data && data.inspectionDate).slice(0, 7));
  }

  function getEventMonth(data) {
    return normalizeMonthKey(data && data.month)
      || normalizeMonthKey(data && data.targetMonth)
      || normalizeMonthKey(normalizeText(data && data.targetDate).slice(0, 7))
      || normalizeMonthKey(normalizeText(data && data.inspectionDate).slice(0, 7))
      || normalizeMonthKey(normalizeText(data && data.sentDate).slice(0, 7))
      || buildMonthKeyFromTimestamp(data && data.createdAt);
  }

  function getEventDay(data) {
    const day = normalizeDayNumber(data && data.day);
    if (day) {
      return day;
    }
    const targetDate = normalizeText(data && (data.targetDate || data.sentDate || data.inspectionDate));
    const match = /^\d{4}-\d{2}-(\d{2})/.exec(targetDate);
    return match ? normalizeDayNumber(match[1]) : 0;
  }

  function getEventDateLabel(data) {
    const targetDate = normalizeText(data && (data.targetDate || data.sentDate || data.inspectionDate));
    if (targetDate) {
      return targetDate;
    }
    const month = getEventMonth(data);
    const day = getEventDay(data);
    return month ? month + (day ? "-" + String(day).padStart(2, "0") : "") : "-";
  }

  function getEventSourceLabel(source) {
    const value = normalizeText(source);
    if (value === DAILY_SOURCE) {
      return "日次点検";
    }
    if (value === TIRE_SOURCE) {
      return "月次タイヤ";
    }
    if (value === "manualAdjustment") {
      return "手動調整";
    }
    if (value === "migrationBaseline") {
      return "移行調整";
    }
    return value || "不明";
  }

  function compareEventRecords(left, right) {
    const leftDate = getEventDateLabel(left.data);
    const rightDate = getEventDateLabel(right.data);
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate, "ja", { numeric: true });
    }
    return left.id.localeCompare(right.id, "ja", { numeric: true });
  }

  function calculateEventBreakdown(events) {
    const breakdown = {
      total: 0,
      daily: 0,
      tire: 0,
      manual: 0,
      other: 0
    };
    (events || []).forEach(function (eventRecord) {
      const data = eventRecord.data || {};
      const points = getNumericValue(data.points);
      breakdown.total += points;
      if (normalizeText(data.source) === DAILY_SOURCE) {
        breakdown.daily += points;
      } else if (normalizeText(data.source) === TIRE_SOURCE) {
        breakdown.tire += points;
      } else if (normalizeText(data.source) === "manualAdjustment") {
        breakdown.manual += points;
      } else {
        breakdown.other += points;
      }
    });
    return breakdown;
  }

  function isSummaryRecord(record) {
    const kind = normalizeText(record && record.data && record.data.kind);
    const id = normalizeText(record && record.id);
    return kind === (normalizeText(pointsSettings.summaryKindValue) || SUMMARY_KIND)
      || id.startsWith("driver_points_summary_");
  }

  function isEventRecord(record) {
    const kind = normalizeText(record && record.data && record.data.kind);
    const id = normalizeText(record && record.id);
    return kind === EVENT_KIND || id.startsWith("driver_points_event_");
  }

  function pickLatestRecord(records, schema) {
    const sorted = (records || []).slice().sort(function (left, right) {
      return getRecordUpdatedAtTime(right.data, schema) - getRecordUpdatedAtTime(left.data, schema);
    });
    return sorted[0] || null;
  }

  function resolvePointsFieldName(source, schema) {
    const fieldNames = uniqueFieldNames((pointsSettings.pointsFieldCandidates || []).concat(schema && schema.pointsField || "totalPoints"));
    const safeSource = source && typeof source === "object" ? source : {};
    for (const fieldName of fieldNames) {
      const value = safeSource[fieldName];
      if (typeof value === "number") {
        return fieldName;
      }
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return fieldName;
      }
    }
    return fieldNames[0] || "totalPoints";
  }

  function getRecordPoints(record, schema) {
    const fieldName = resolvePointsFieldName(record && record.data ? record.data : null, schema);
    return getNumericValue(record && record.data ? record.data[fieldName] : undefined);
  }

  function getRecordUpdatedAtTime(source, schema) {
    const fieldNames = uniqueFieldNames([schema && schema.updatedAtField].concat(pointsSettings.updatedAtFieldCandidates || []));
    const safeSource = source && typeof source === "object" ? source : {};
    for (const fieldName of fieldNames) {
      const time = getTimeValue(safeSource[fieldName]);
      if (time > 0) {
        return time;
      }
    }
    return 0;
  }

  function collectNormalizedFieldValues(source, fieldNames, normalizer) {
    const values = [];
    const seen = new Set();
    const safeSource = source && typeof source === "object" ? source : {};
    const normalize = typeof normalizer === "function" ? normalizer : normalizeText;

    fieldNames.forEach(function (fieldName) {
      const rawValue = safeSource[fieldName];
      const entries = Array.isArray(rawValue) ? rawValue : [rawValue];
      entries.forEach(function (entry) {
        const normalizedValue = normalize(entry);
        if (!normalizedValue || seen.has(normalizedValue)) {
          return;
        }
        seen.add(normalizedValue);
        values.push(normalizedValue);
      });
    });

    return values;
  }

  function uniqueFieldNames(values) {
    const unique = [];
    const seen = new Set();
    (values || []).forEach(function (value) {
      const fieldName = normalizeText(value);
      if (!fieldName || seen.has(fieldName)) {
        return;
      }
      seen.add(fieldName);
      unique.push(fieldName);
    });
    return unique;
  }

  function getStringArray(source) {
    if (!source || !Array.isArray(source.values)) {
      return [];
    }
    return source.values.map(normalizeText).filter(Boolean);
  }

  function buildSelectionIdentity(driverName, vehicleNumber) {
    const normalizedDriverName = normalizeDriverName(driverName);
    const normalizedVehicleNumber = normalizeText(vehicleNumber);
    const driverKey = normalizeDriverKey(normalizedDriverName);
    const vehicleKey = normalizeVehicleKey(normalizedVehicleNumber);
    const summaryKey = vehicleKey + "|" + driverKey;
    return {
      driverName: normalizedDriverName,
      vehicleNumber: normalizedVehicleNumber,
      driverKey: driverKey,
      vehicleKey: vehicleKey,
      summaryKey: summaryKey,
      idSuffix: hashText(summaryKey || normalizedVehicleNumber + "|" + normalizedDriverName || "unknown")
    };
  }

  function buildSummaryDocId(identity) {
    return "driver_points_summary_" + identity.idSuffix;
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    const text = String(value == null ? "" : value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function normalizeMonthKey(value) {
    const match = /^(\d{4})-(\d{1,2})$/.exec(normalizeText(value));
    if (!match) {
      return "";
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return "";
    }
    return year + "-" + String(month).padStart(2, "0");
  }

  function normalizeDayNumber(value) {
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return 0;
    }
    return day;
  }

  function buildLocalMonthKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function buildMonthKeyFromTimestamp(value) {
    const time = getTimeValue(value);
    if (!time) {
      return "";
    }
    return buildLocalMonthKey(new Date(time));
  }

  function formatMonthLabel(value) {
    const month = normalizeMonthKey(value);
    if (!month) {
      return "-";
    }
    const parts = month.split("-");
    return parts[0] + "年" + String(Number(parts[1])) + "月";
  }

  function formatSignedPoints(value) {
    const points = getNumericValue(value);
    return (points > 0 ? "+" : "") + String(points) + "pt";
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeDriverName(value) {
    if (sharedSettings && typeof sharedSettings.normalizeDriverName === "function") {
      return normalizeText(sharedSettings.normalizeDriverName(value));
    }
    return normalizeText(value);
  }

  function normalizeDriverKey(value) {
    return normalizeDriverName(value)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function normalizeVehicleKey(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function getNumericValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function getTimeValue(value) {
    if (!value) {
      return 0;
    }
    if (typeof value.toDate === "function") {
      try {
        return value.toDate().getTime();
      } catch {
        return 0;
      }
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    }
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function hasOwn(source, key) {
    return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setStatus(message, isError) {
    if (!elements.statusText) {
      return;
    }
    elements.statusText.textContent = message || "";
    elements.statusText.style.color = isError ? "#b00020" : "";
  }

  function formatError(error) {
    if (!error) {
      return "unknown_error";
    }
    if (error.code) {
      return String(error.code);
    }
    if (error.message) {
      return String(error.message);
    }
    return String(error);
  }

  function getServerQuerySnapshot(query) {
    return query.get(SERVER_GET_OPTIONS);
  }

  function getServerDocumentSnapshot(docRef) {
    return docRef.get(SERVER_GET_OPTIONS);
  }
})();
