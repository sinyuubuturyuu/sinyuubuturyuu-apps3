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
  const MANUAL_SOURCE = "manualAdjustment";
  const MANUAL_EVENT_PREFIX = "driver_points_event_manual_";

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
    pointGrantPoints: document.getElementById("pointGrantPoints"),
    pointGrantReason: document.getElementById("pointGrantReason"),
    pointGrantReviewButton: document.getElementById("pointGrantReviewButton"),
    pointGrantReview: document.getElementById("pointGrantReview"),
    pointGrantReviewDetails: document.getElementById("pointGrantReviewDetails"),
    pointGrantExecuteButton: document.getElementById("pointGrantExecuteButton"),
    pointGrantCancelButton: document.getElementById("pointGrantCancelButton"),
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
    granting: false,
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
    selectedDayKeys: new Set(),
    selectedManualEventIds: new Set(),
    pointGrantReview: null,
    review: null
  };

  bindEvents();
  void initialize();

  function bindEvents() {
    elements.driverSelect.addEventListener("change", handleSelectionChanged);
    elements.vehicleSelect.addEventListener("change", handleSelectionChanged);
    elements.monthSelect.addEventListener("change", handleSelectionChanged);
    elements.pointGrantPoints.addEventListener("input", resetPointGrantReview);
    elements.pointGrantReason.addEventListener("input", resetPointGrantReview);
    elements.pointGrantReviewButton.addEventListener("click", buildAndRenderPointGrantReview);
    elements.pointGrantExecuteButton.addEventListener("click", function () {
      void executePointGrant();
    });
    elements.pointGrantCancelButton.addEventListener("click", resetPointGrantReview);
    elements.reviewButton.addEventListener("click", function () {
      buildAndRenderReview();
    });
    elements.executeButton.addEventListener("click", function () {
      void executeReview();
    });
    elements.eventHistoryBody.addEventListener("change", function (event) {
      const target = event.target;
      if (!target) {
        return;
      }
      const value = normalizeText(target.value);
      if (!value) {
        return;
      }
      if (target.name === "dayChoice") {
        if (target.checked) {
          state.selectedDayKeys.add(value);
        } else {
          state.selectedDayKeys.delete(value);
        }
      } else if (target.name === "manualChoice") {
        if (target.checked) {
          state.selectedManualEventIds.add(value);
        } else {
          state.selectedManualEventIds.delete(value);
        }
      } else {
        return;
      }
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
    state.selectedDayKeys.clear();
    state.selectedManualEventIds.clear();
    resetPointGrantReview();
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

  function buildAndRenderPointGrantReview() {
    if (!hasBaseSelection()) {
      setStatus("乗務員、車番、対象月を選択してください。", true);
      return;
    }
    if (state.loading || state.executing || state.granting) {
      setStatus("処理中です。完了してからもう一度お試しください。", true);
      return;
    }

    const points = Number(elements.pointGrantPoints.value);
    const reason = normalizeText(elements.pointGrantReason.value);
    if (!Number.isSafeInteger(points) || points < 1) {
      setStatus("加算ポイントは1以上の整数で入力してください。", true);
      return;
    }
    if (!reason) {
      setStatus("加算理由を入力してください。", true);
      return;
    }
    if (reason.length > 200) {
      setStatus("加算理由は200文字以内で入力してください。", true);
      return;
    }

    const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
    const eventBreakdown = calculateEventBreakdown(state.allEvents);
    const summaryBefore = state.currentSummary
      ? getRecordPoints(state.currentSummary, schema)
      : eventBreakdown.total;
    const driverOption = getSelectedDriverOption();
    const adjustmentDate = buildLocalDateKey(new Date());
    const operationId = buildManualAdjustmentOperationId();
    state.pointGrantReview = {
      operationId: operationId,
      eventId: MANUAL_EVENT_PREFIX + operationId,
      driverOption: driverOption,
      vehicle: normalizeText(elements.vehicleSelect.value),
      month: normalizeMonthKey(elements.monthSelect.value),
      points: points,
      reason: reason,
      adjustmentDate: adjustmentDate,
      summaryBefore: summaryBefore,
      summaryAfter: summaryBefore + points,
      manualBefore: eventBreakdown.manual,
      operatorUid: getCurrentOperatorUid()
    };

    elements.pointGrantReviewDetails.innerHTML = [
      renderPointGrantReviewRow("対象社員", driverOption ? driverOption.label : "-"),
      renderPointGrantReviewRow("車番", state.pointGrantReview.vehicle),
      renderPointGrantReviewRow("対象月", formatMonthLabel(state.pointGrantReview.month)),
      renderPointGrantReviewRow("登録日", adjustmentDate),
      renderPointGrantReviewRow("現在ポイント", String(summaryBefore) + "pt"),
      renderPointGrantReviewRow("加算ポイント", formatSignedPoints(points)),
      renderPointGrantReviewRow("加算後ポイント", String(summaryBefore + points) + "pt"),
      renderPointGrantReviewRow("理由", reason)
    ].join("");
    elements.pointGrantReview.hidden = false;
    setStatus("ポイント加算前の内容を確認してください。");
    syncButtons();
  }

  function renderPointGrantReviewRow(label, value) {
    return "<dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd>";
  }

  async function executePointGrant() {
    const review = state.pointGrantReview;
    if (!review || state.granting || state.executing || state.loading || !state.pointsDb) {
      return;
    }

    state.granting = true;
    syncButtons();
    setStatus("ポイントを加算しています...");

    try {
      const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
      const collectionRef = state.pointsDb.collection(schema.collectionName);
      const identity = buildSelectionIdentity(review.driverOption ? review.driverOption.label : "", review.vehicle);
      const summaryRef = state.currentSummary && state.currentSummary.ref
        ? state.currentSummary.ref
        : collectionRef.doc(buildSummaryDocId(identity));
      const eventRef = collectionRef.doc(review.eventId);
      const logRef = state.pointsDb.collection(LOG_COLLECTION).doc();
      const FieldValue = window.firebase.firestore.FieldValue;

      await state.pointsDb.runTransaction(async function (transaction) {
        const eventSnapshot = await transaction.get(eventRef);
        if (eventSnapshot.exists) {
          throw new Error("manual_adjustment_already_exists");
        }

        const summarySnapshot = await transaction.get(summaryRef);
        const summaryData = summarySnapshot.exists ? (summarySnapshot.data() || {}) : {};
        const pointsFieldName = resolvePointsFieldName(summaryData, schema);
        const currentPoints = summarySnapshot.exists
          ? getNumericValue(summaryData[pointsFieldName])
          : review.summaryBefore;
        if (currentPoints !== review.summaryBefore) {
          throw new Error("point_summary_changed");
        }

        const currentManualPoints = review.manualBefore;
        const summaryPayload = {
          kind: normalizeText(pointsSettings.summaryKindValue) || SUMMARY_KIND,
          driverKey: identity.driverKey,
          driverName: identity.driverName,
          driverRaw: review.driverOption ? review.driverOption.value : identity.driverName,
          vehicleKey: identity.vehicleKey,
          vehicleNumber: identity.vehicleNumber,
          totalPoints: currentPoints + review.points,
          manualAdjustmentPoints: currentManualPoints + review.points,
          updatedAt: FieldValue.serverTimestamp(),
          lastAwardAt: FieldValue.serverTimestamp(),
          lastSource: MANUAL_SOURCE
        };
        summaryPayload[schema.vehicleField || "vehicleNumber"] = schema.vehicleField === "vehicleKey"
          ? identity.vehicleKey
          : identity.vehicleNumber;
        summaryPayload[schema.driverField || "driverKey"] = schema.driverField === "driverKey"
          ? identity.driverKey
          : identity.driverName;
        summaryPayload[pointsFieldName] = currentPoints + review.points;
        if (!summarySnapshot.exists) {
          summaryPayload.createdAt = FieldValue.serverTimestamp();
        }

        transaction.set(summaryRef, summaryPayload, { merge: true });
        transaction.set(eventRef, {
          kind: EVENT_KIND,
          driverKey: identity.driverKey,
          driverName: identity.driverName,
          driverRaw: review.driverOption ? review.driverOption.value : identity.driverName,
          vehicleKey: identity.vehicleKey,
          vehicleNumber: identity.vehicleNumber,
          source: MANUAL_SOURCE,
          adjustmentType: "pointGrant",
          operationId: review.operationId,
          points: review.points,
          month: review.month,
          adjustmentDate: review.adjustmentDate,
          reason: review.reason,
          operatorUid: review.operatorUid,
          createdAt: FieldValue.serverTimestamp()
        });
        transaction.set(logRef, {
          action: "addManualPoints",
          target: {
            vehicleNumber: identity.vehicleNumber,
            driverName: identity.driverName,
            driverKey: identity.driverKey,
            month: review.month,
            targetType: "manualPointGrant"
          },
          operationId: review.operationId,
          eventDoc: {
            collection: schema.collectionName,
            id: review.eventId,
            operation: "createDoc"
          },
          pointsAdded: review.points,
          reason: review.reason,
          summaryBefore: currentPoints,
          summaryAfter: currentPoints + review.points,
          operatorUid: review.operatorUid,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: review.operatorUid || "管理画面"
        });
      });

      elements.pointGrantPoints.value = "";
      elements.pointGrantReason.value = "";
      resetPointGrantReview();
      state.selectedManualEventIds.clear();
      setStatus(String(review.points) + "ポイントを加算し、記録を保存しました。");
      await loadContext();
    } catch (error) {
      console.warn("Failed to add manual points:", error);
      if (normalizeText(error && error.message) === "point_summary_changed") {
        setStatus("確認後にポイントが変更されました。最新データを読み込み直してから、もう一度確認してください。", true);
        await loadContext();
        resetPointGrantReview();
      } else if (normalizeText(error && error.message) === "manual_adjustment_already_exists") {
        setStatus("このポイント加算はすでに登録されています。再読み込みして確認してください。", true);
        await loadContext();
        resetPointGrantReview();
      } else {
        setStatus("ポイント加算に失敗しました: " + formatError(error), true);
      }
    } finally {
      state.granting = false;
      syncButtons();
    }
  }

  function buildManualAdjustmentOperationId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replaceAll("-", "");
    }
    return [
      Date.now().toString(36),
      Math.random().toString(36).slice(2),
      Math.random().toString(36).slice(2)
    ].join("_");
  }

  function getCurrentOperatorUid() {
    try {
      const user = state.pointsDb && state.pointsDb.app
        ? state.pointsDb.app.auth().currentUser
        : null;
      return normalizeText(user && user.uid);
    } catch {
      return "";
    }
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
      const [pointRecords, allDailyRecords, allTireRecords] = await Promise.all([
        loadPointRecords(schema, vehicle, driverOption),
        loadDailyRecords(vehicle, driverOption),
        loadTireRecords(vehicle, driverOption)
      ]);
      const summary = await findPointSummaryRecord(schema, vehicle, driverOption, pointRecords);
      const allEvents = pointRecords.filter(isEventRecord);
      const dailyRecords = allDailyRecords.filter(function (record) {
        return normalizeMonthKey(record.data && record.data.month) === month;
      });
      const tireRecords = allTireRecords.filter(function (record) {
        return getTireRecordMonth(record.data) === month;
      });
      const monthsWithData = loadMonthsWithData(allEvents, allDailyRecords, allTireRecords);

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
      const collectionRef = state.pointsDb.collection(collectionName);
      const summaryKindValue = normalizeText(pointsSettings.summaryKindValue) || SUMMARY_KIND;
      let snapshot = await getServerQuerySnapshot(
        collectionRef.where("kind", "==", summaryKindValue).limit(1)
      );
      if (snapshot.empty) {
        snapshot = await getServerQuerySnapshot(collectionRef.limit(20));
      }
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

  async function findPointSummaryRecord(schema, vehicle, driverOption, pointRecords) {
    const candidates = (pointRecords || []).filter(function (record) {
      return isSummaryRecord(record) && recordMatchesSelection(record, schema, vehicle, driverOption);
    });
    const summary = pickLatestRecord(candidates, schema);
    if (summary) {
      return summary;
    }

    const collectionRef = state.pointsDb.collection(schema.collectionName);
    const identity = buildSelectionIdentity(driverOption.label, vehicle);
    const directDoc = await getServerDocumentSnapshot(collectionRef.doc(buildSummaryDocId(identity)));
    if (!directDoc.exists) {
      return null;
    }
    const record = toRecord(directDoc);
    return recordMatchesSelection(record, schema, vehicle, driverOption) ? record : null;
  }

  async function loadPointRecords(schema, vehicle, driverOption) {
    const collectionRef = state.pointsDb.collection(schema.collectionName);
    const identity = buildSelectionIdentity(driverOption.label, vehicle);
    let snapshot = await getServerQuerySnapshot(
      collectionRef.where("driverKey", "==", identity.driverKey).limit(1000)
    );
    if (snapshot.empty && identity.driverName) {
      snapshot = await getServerQuerySnapshot(
        collectionRef.where("driverName", "==", identity.driverName).limit(1000)
      );
    }
    return snapshot.docs.map(toRecord).filter(function (record) {
      return recordMatchesSelection(record, schema, vehicle, driverOption);
    });
  }

  async function loadDailyRecords(vehicle, driverOption) {
    const collectionRef = state.pointsDb.collection(DAILY_COLLECTION);
    const snapshots = await Promise.all([
      getServerQuerySnapshot(collectionRef.where("vehicleNormalized", "==", normalizeVehicleKey(vehicle)).limit(300)),
      getServerQuerySnapshot(collectionRef.where("vehicle", "==", vehicle).limit(300))
    ]);
    return mergeSnapshotDocuments(snapshots).map(toRecord).filter(function (record) {
      return dailyRecordMatchesSelection(record.data, vehicle, driverOption);
    });
  }

  async function loadTireRecords(vehicle, driverOption) {
    const collectionRef = state.pointsDb.collection(TIRE_COLLECTION);
    const snapshots = await Promise.all([
      getServerQuerySnapshot(collectionRef.where("basicInfo.vehicleNumber", "==", vehicle).limit(300)),
      getServerQuerySnapshot(collectionRef.where("vehicleNumber", "==", vehicle).limit(300))
    ]);
    return mergeSnapshotDocuments(snapshots).map(toRecord).filter(function (record) {
      return tireRecordMatchesSelection(record.data, vehicle, driverOption);
    });
  }

  function loadMonthsWithData(events, dailyRecords, tireRecords) {
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

    return months;
  }

  function mergeSnapshotDocuments(snapshots) {
    const docsById = new Map();
    (snapshots || []).forEach(function (snapshot) {
      (snapshot.docs || []).forEach(function (docSnapshot) {
        docsById.set(docSnapshot.id, docSnapshot);
      });
    });
    return Array.from(docsById.values());
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
    const current = getTireCurrentData(data);
    const searchableData = Object.assign({}, data || {}, data && data.basicInfo ? data.basicInfo : {}, current);
    return dataVehicleMatches(searchableData, vehicle, ["vehicleNumber", "vehicle", "vehicleKey", "vehicleNo"])
      && dataDriverMatches(searchableData, driverOption, ["driverName", "driver", "driverKey", "driverRaw", "driverDisplay"]);
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
      elements.eventHistoryBody.innerHTML = '<tr><td colspan="7">対象を選択してください。</td></tr>';
      return;
    }

    const dateCandidates = buildDateDeleteCandidates();
    const manualEvents = getManualAdjustmentEventsForMonth();
    if (!dateCandidates.length && !manualEvents.length) {
      elements.eventHistoryBody.innerHTML = '<tr><td colspan="7">対象月の削除候補はありません。</td></tr>';
      return;
    }

    const dateRows = dateCandidates.map(function (candidate) {
      const dayKey = String(candidate.day);
      const checked = state.selectedDayKeys.has(dayKey) ? " checked" : "";
      const targetLabels = buildCandidateTargetLabels(candidate);
      const dailyPointLabels = buildInspectionPointLabels(candidate.dailyEvents, DAILY_SOURCE);
      const tirePointLabels = buildInspectionPointLabels(candidate.tireEvents, TIRE_SOURCE);
      const otherPointLabels = candidate.otherEvents.length
        ? ["削除対象外 " + String(candidate.otherEvents.length) + "件"]
        : ["なし"];
      return [
        "<tr>",
        '<td><input type="checkbox" name="dayChoice" value="' + escapeHtml(dayKey) + '"' + checked + "></td>",
        "<td>" + escapeHtml(formatMonthLabel(elements.monthSelect.value) + " " + candidate.day + "日") + "</td>",
        '<td><div class="event-meta">' + targetLabels.map(function (label) {
          return "<span>" + escapeHtml(label) + "</span>";
        }).join("") + "</div></td>",
        '<td><div class="event-meta">' + renderMetaSpans(dailyPointLabels) + "</div></td>",
        '<td><div class="event-meta">' + renderMetaSpans(tirePointLabels) + "</div></td>",
        '<td><div class="event-meta">' + renderMetaSpans(otherPointLabels) + "</div></td>",
        '<td><div class="event-meta">'
          + renderMetaSpans(candidate.details)
          + "</div></td>",
        "</tr>"
      ].join("");
    });

    const manualRows = manualEvents.map(function (eventRecord) {
      const data = eventRecord.data || {};
      const checked = state.selectedManualEventIds.has(eventRecord.id) ? " checked" : "";
      const reason = normalizeText(data.reason) || "理由未登録";
      const operatorUid = normalizeText(data.operatorUid);
      return [
        '<tr class="manual-adjustment-row">',
        '<td><input type="checkbox" name="manualChoice" value="' + escapeHtml(eventRecord.id) + '"' + checked + "></td>",
        "<td>" + escapeHtml(formatManualAdjustmentDate(data)) + "</td>",
        '<td><span class="event-source">手動加算</span></td>',
        '<td><div class="event-meta"><span>なし</span></div></td>',
        '<td><div class="event-meta"><span>なし</span></div></td>',
        '<td><div class="event-meta"><strong>' + escapeHtml(formatSignedPoints(data.points)) + '</strong><span>手動加算</span></div></td>',
        '<td><div class="event-meta"><span>理由: ' + escapeHtml(reason) + '</span>'
          + (operatorUid ? '<span>操作者UID: ' + escapeHtml(operatorUid) + '</span>' : "")
          + '<span>記録ID: ' + escapeHtml(eventRecord.id) + '</span>'
          + '<span>点検記録は削除されません</span></div></td>',
        "</tr>"
      ].join("");
    });

    elements.eventHistoryBody.innerHTML = dateRows.concat(manualRows).join("");
  }

  function getManualAdjustmentEventsForMonth() {
    return state.monthEvents.filter(function (eventRecord) {
      return normalizeText(eventRecord.data && eventRecord.data.source) === MANUAL_SOURCE;
    }).slice().sort(function (left, right) {
      return getRecordCreatedAtTime(right.data) - getRecordCreatedAtTime(left.data);
    });
  }

  function formatManualAdjustmentDate(data) {
    const time = getRecordCreatedAtTime(data);
    if (time) {
      return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(time));
    }
    return normalizeText(data && data.adjustmentDate) || "-";
  }

  function getRecordCreatedAtTime(data) {
    return getTimeValue(data && data.createdAt)
      || getTimeValue(data && data.updatedAt)
      || getTimeValue(data && data.adjustmentDate);
  }

  function buildDateDeleteCandidates() {
    const candidatesByDay = new Map();

    state.dailyRecords.forEach(function (record) {
      collectDailyRecordDays([record]).forEach(function (day) {
        const candidate = ensureDateDeleteCandidate(candidatesByDay, day);
        candidate.dailyDays.push({ record: record, day: day });
        candidate.details.push("日次: " + record.id);
      });
    });

    state.tireRecords.forEach(function (record) {
      const day = getTireRecordDay(record.data);
      if (!day) {
        return;
      }
      const candidate = ensureDateDeleteCandidate(candidatesByDay, day);
      candidate.tireRecords.push(record);
      candidate.details.push("月次タイヤ: " + record.id);
    });

    state.monthEvents.forEach(function (eventRecord) {
      const data = eventRecord.data || {};
      const source = normalizeText(data.source);
      if (source !== DAILY_SOURCE && source !== TIRE_SOURCE) {
        return;
      }
      const day = getInspectionEventDay(data);
      if (!day) {
        return;
      }
      const candidate = ensureDateDeleteCandidate(candidatesByDay, day);
      candidate.inspectionEvents.push(eventRecord);
      if (source === DAILY_SOURCE) {
        candidate.dailyEvents.push(eventRecord);
      } else {
        candidate.tireEvents.push(eventRecord);
      }
      candidate.pointTotal += getNumericValue(data.points);
      candidate.details.push(describeInspectionPointEvent(eventRecord));
    });

    state.monthEvents.forEach(function (eventRecord) {
      const data = eventRecord.data || {};
      const source = normalizeText(data.source);
      if (source === DAILY_SOURCE || source === TIRE_SOURCE) {
        return;
      }
      const day = normalizeDayNumber(getEventDay(data));
      if (day && candidatesByDay.has(String(day))) {
        candidatesByDay.get(String(day)).otherEvents.push(eventRecord);
      }
    });

    return Array.from(candidatesByDay.values()).sort(function (left, right) {
      return left.day - right.day;
    });
  }

  function buildCandidateTargetLabels(candidate) {
    const labels = [];
    if (candidate.dailyDays.length) {
      labels.push("日常点検データ " + String(candidate.dailyDays.length) + "件");
    }
    if (candidate.tireRecords.length) {
      labels.push("タイヤ点検データ " + String(candidate.tireRecords.length) + "件");
    }
    if (candidate.dailyEvents.length) {
      labels.push("日常点検ポイント " + String(candidate.dailyEvents.length) + "件");
    }
    if (candidate.tireEvents.length) {
      labels.push("タイヤ点検ポイント " + String(candidate.tireEvents.length) + "件");
    }
    return labels.length ? labels : ["削除対象なし"];
  }

  function buildInspectionPointLabels(events, source) {
    if (!events.length) {
      return ["なし"];
    }
    const buckets = {
      same: { count: 0, points: 0 },
      late: { count: 0, points: 0 },
      unknown: { count: 0, points: 0 }
    };
    events.forEach(function (eventRecord) {
      const data = eventRecord.data || {};
      const timing = getInspectionPointTiming(data, source);
      const bucket = buckets[timing] || buckets.unknown;
      bucket.count += 1;
      bucket.points += getNumericValue(data.points);
    });
    return ["same", "late", "unknown"].filter(function (key) {
      return buckets[key].count > 0;
    }).map(function (key) {
      const label = getInspectionPointTimingLabel(key, source);
      return label + " " + String(buckets[key].count) + "件 " + formatSignedPoints(buckets[key].points);
    });
  }

  function renderMetaSpans(items) {
    return (items || []).map(function (item) {
      return "<span>" + escapeHtml(item) + "</span>";
    }).join("");
  }

  function describeInspectionPointEvent(eventRecord) {
    const data = eventRecord.data || {};
    const source = normalizeText(data.source);
    const sourceLabel = source === DAILY_SOURCE ? "日常点検ポイント" : "タイヤ点検ポイント";
    const timing = getInspectionPointTiming(data, source);
    return sourceLabel + ": " + eventRecord.id + " (" + getInspectionPointTimingLabel(timing, source) + " " + formatSignedPoints(getNumericValue(data.points)) + ")";
  }

  function getInspectionPointTiming(data, source) {
    const points = getNumericValue(data && data.points);
    if (source === DAILY_SOURCE) {
      const targetDate = getDateKey(data && (data.targetDate || data.inspectionDate));
      const sentDate = getDateKey(data && data.sentDate);
      if (targetDate && sentDate) {
        return targetDate === sentDate ? "same" : "late";
      }
      return points >= 2 ? "same" : (points > 0 ? "late" : "unknown");
    }
    if (source === TIRE_SOURCE) {
      const targetMonth = normalizeMonthKey(data && data.targetMonth)
        || normalizeMonthKey(normalizeText(data && data.inspectionDate).slice(0, 7));
      const sentMonth = normalizeMonthKey(normalizeText(data && data.sentDate).slice(0, 7));
      if (targetMonth && sentMonth) {
        return targetMonth === sentMonth ? "same" : "late";
      }
      return points >= 2 ? "same" : (points > 0 ? "late" : "unknown");
    }
    return "unknown";
  }

  function getInspectionPointTimingLabel(timing, source) {
    if (source === DAILY_SOURCE) {
      if (timing === "same") {
        return "当日";
      }
      if (timing === "late") {
        return "後日";
      }
      return "日付不明";
    }
    if (source === TIRE_SOURCE) {
      if (timing === "same") {
        return "当月";
      }
      if (timing === "late") {
        return "翌月以降";
      }
      return "月不明";
    }
    return "不明";
  }

  function getDateKey(value) {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(normalizeText(value));
    return match ? match[1] : "";
  }
  function getInspectionEventDay(data) {
    const source = normalizeText(data && data.source);
    if (source === TIRE_SOURCE) {
      let tireDay = getTireRecordDay(data);
      if (!tireDay && state.tireRecords.length === 1) {
        tireDay = getTireRecordDay(state.tireRecords[0].data);
      }
      return tireDay || normalizeDayNumber(getEventDay(data));
    }
    return normalizeDayNumber(getEventDay(data));
  }
  function ensureDateDeleteCandidate(candidatesByDay, day) {
    const dayKey = String(day);
    if (!candidatesByDay.has(dayKey)) {
      candidatesByDay.set(dayKey, {
        day: day,
        dailyDays: [],
        tireRecords: [],
        inspectionEvents: [],
        dailyEvents: [],
        tireEvents: [],
        otherEvents: [],
        pointTotal: 0,
        details: []
      });
    }
    return candidatesByDay.get(dayKey);
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

    state.review = buildBulkDateReview();
    renderReview();
    syncButtons();
  }

  function buildBulkDateReview() {
    const vehicle = normalizeText(elements.vehicleSelect.value);
    const driverOption = getSelectedDriverOption();
    const month = normalizeMonthKey(elements.monthSelect.value);
    const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
    const summaryBefore = state.currentSummary ? getRecordPoints(state.currentSummary, schema) : 0;
    const beforeBreakdown = calculateEventBreakdown(state.allEvents);
    const selectedDayKeys = Array.from(state.selectedDayKeys).map(normalizeDayNumber).filter(Boolean).sort(function (left, right) {
      return left - right;
    });
    const selectedManualEventIds = uniqueValues(Array.from(state.selectedManualEventIds));
    const candidatesByDay = new Map(buildDateDeleteCandidates().map(function (candidate) {
      return [String(candidate.day), candidate];
    }));
    const review = {
      targetType: selectedManualEventIds.length ? "manualPoints" : "inspectionDates",
      vehicle: vehicle,
      driverOption: driverOption,
      month: month,
      day: null,
      days: selectedDayKeys.slice(),
      summaryBefore: summaryBefore,
      summaryAfter: summaryBefore,
      manualBefore: beforeBreakdown.manual,
      manualDeletePoints: 0,
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
      logAction: "deleteInspectionDatesWithRelatedPoints",
      ignoreIntegrityErrors: true,
      canExecute: false,
      executeLabel: "選択したデータを削除"
    };

    if (!selectedDayKeys.length && !selectedManualEventIds.length) {
      review.errors.push("削除する点検日または手動加算を1件以上選択してください。");
    }
    if (selectedDayKeys.length && selectedManualEventIds.length) {
      review.errors.push("点検日と手動加算は同時に削除できません。どちらか一方だけを選択してください。");
    }
    if (summaryBefore !== beforeBreakdown.total) {
      review.warnings.push("削除前のポイントサマリーとイベント合計は一致していません。削除後に残イベント合計でサマリーを再計算します。");
    }

    selectedDayKeys.forEach(function (day) {
      const candidate = candidatesByDay.get(String(day));
      if (!candidate) {
        review.warnings.push(String(day) + "日の削除候補が見つかりません。再読み込みしてください。");
        return;
      }
      review.relatedItems.push(formatMonthLabel(month) + " " + day + "日");
      candidate.details.forEach(function (detail) {
        review.relatedItems.push("  " + detail);
      });
      const excludedOtherEvents = candidate.otherEvents.filter(function (eventRecord) {
        return !selectedManualEventIds.includes(eventRecord.id);
      });
      if (excludedOtherEvents.length) {
        review.warnings.push(String(day) + "日に点検以外のポイントイベントが " + String(excludedOtherEvents.length) + "件あります。削除対象外です。");
      }
      candidate.dailyDays.forEach(function (entry) {
        review.deleteDailyDays.push(entry);
        review.deleteItems.push("日次点検データ: " + entry.record.id + " の " + entry.day + "日分");
      });
      candidate.tireRecords.forEach(function (record) {
        review.deleteTireRecords.push(record);
        review.deleteItems.push("月次タイヤ点検データ: " + record.id);
      });
      candidate.inspectionEvents.forEach(function (eventRecord) {
        review.deleteEventIds.push(eventRecord.id);
        review.deleteItems.push(describeInspectionPointEvent(eventRecord));
      });
    });

    selectedManualEventIds.forEach(function (eventId) {
      const eventRecord = state.allEvents.find(function (record) {
        return record.id === eventId;
      });
      if (!eventRecord || normalizeText(eventRecord.data && eventRecord.data.source) !== MANUAL_SOURCE) {
        review.warnings.push("手動加算記録 " + eventId + " が見つかりません。再読み込みしてください。");
        return;
      }
      const data = eventRecord.data || {};
      review.relatedItems.push(
        "手動加算: " + formatManualAdjustmentDate(data)
          + " / " + formatSignedPoints(data.points)
          + " / " + (normalizeText(data.reason) || "理由未登録")
      );
      review.deleteEventIds.push(eventRecord.id);
      review.manualDeletePoints += getNumericValue(data.points);
      review.deleteItems.push(
        "手動加算記録: " + eventRecord.id
          + " (" + formatSignedPoints(data.points)
          + "、点検記録は削除しません)"
      );
    });

    review.deleteEventIds = uniqueValues(review.deleteEventIds);
    review.deleteTireRecords = uniqueRecords(review.deleteTireRecords);
    review.deleteDailyDays = uniqueDailyDayEntries(review.deleteDailyDays);

    const remainingEvents = state.allEvents.filter(function (eventRecord) {
      return !review.deleteEventIds.includes(eventRecord.id);
    });
    const afterBreakdown = calculateEventBreakdown(remainingEvents);
    review.eventTotalAfter = afterBreakdown.total;
    if (review.targetType === "manualPoints") {
      review.summaryAfter = review.summaryBefore - review.manualDeletePoints;
      review.deleteSummaryAfter = false;
    } else {
      review.summaryAfter = afterBreakdown.total;
      review.deleteSummaryAfter = remainingEvents.length === 0;
    }
    review.summaryPayload = buildSummaryPayload(schema, review, afterBreakdown);
    review.integrityItems = buildIntegrityMessages(review);
    review.canExecute = review.errors.length === 0
      && (review.deleteEventIds.length > 0 || review.deleteTireRecords.length > 0 || review.deleteDailyDays.length > 0);

    if (selectedManualEventIds.length && !selectedDayKeys.length) {
      review.logAction = "deleteManualPointAdjustments";
      review.executeLabel = "選択した手動加算を削除";
    }
    return review;
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
      messages.push({
        type: review.warnings.length ? "warning" : "ok",
        text: review.warnings.length ? "整合性: 警告あり（内容を確認して実行可）" : "整合性: OK"
      });
    } else {
      messages.push({ type: "error", text: "整合性: NG" });
    }

    if (review.summaryBefore !== review.eventTotalBefore) {
      messages.push({
        type: review.ignoreIntegrityErrors ? "warning" : "error",
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
    elements.summaryChangeText.textContent = review.skipSummaryUpdate && !review.deleteSummaryAfter
      ? "ポイントサマリー: 変更しません"
      : "ポイントサマリー: " + String(review.summaryBefore) + "pt → " + String(review.summaryAfter) + "pt";
    elements.executeButton.textContent = review.executeLabel || "削除を実行";
    elements.executeButton.disabled = !review.canExecute || state.executing;
    setStatus(review.canExecute ? "削除実行前に内容を確認してください。" : "削除対象の選択または確認が不足しているため、実行できません。", !review.canExecute);
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
      review.skipSummaryUpdate && !review.deleteSummaryAfter
        ? "ポイントサマリー: 変更しません"
        : "ポイント: " + review.summaryBefore + "pt → " + review.summaryAfter + "pt",
      "確認内容:",
      review.relatedItems.map(function (item) { return "・" + item; }).join("\n") || "・なし",
      "",
      "削除予定:",
      review.deleteItems.map(function (item) { return "・" + item; }).join("\n") || "・なし",
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
      const FieldValue = window.firebase.firestore.FieldValue;
      const schema = state.activeSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driver-points");
      const summaryRef = getSummaryRef(schema, review);

      if (review.targetType === "manualPoints") {
        await executeManualPointDeletion(review, schema, summaryRef, FieldValue);
      } else {
        const batch = state.pointsDb.batch();
        const now = FieldValue.serverTimestamp();

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
        } else if (!review.skipSummaryUpdate) {
          batch.set(summaryRef, review.summaryPayload, { merge: true });
        }
        batch.set(state.pointsDb.collection(LOG_COLLECTION).doc(), buildLogPayload(review, FieldValue));

        await batch.commit();
      }

      state.review = null;
      state.selectedDayKeys.clear();
      state.selectedManualEventIds.clear();
      elements.reviewSection.hidden = true;
      setStatus("データ調整を実行し、ログを保存しました。");
      await loadContext();
    } catch (error) {
      console.warn("Failed to execute data adjustment:", error);
      const errorCode = normalizeText(error && error.message);
      if (
        errorCode === "manual_point_event_changed" ||
        errorCode === "point_summary_changed"
      ) {
        state.review = null;
        elements.reviewSection.hidden = true;
        setStatus("確認後にポイントデータが変更されました。最新データを読み込み直してから、もう一度確認してください。", true);
        await loadContext();
      } else {
        setStatus("データ調整の実行に失敗しました: " + formatError(error), true);
      }
    } finally {
      state.executing = false;
      syncButtons();
    }
  }

  async function executeManualPointDeletion(review, schema, summaryRef, FieldValue) {
    const eventRecords = review.deleteEventIds.map(function (eventId) {
      return state.allEvents.find(function (record) {
        return record.id === eventId;
      });
    });
    if (eventRecords.some(function (record) { return !record || !record.ref; })) {
      throw new Error("manual_point_event_changed");
    }

    const logRef = state.pointsDb.collection(LOG_COLLECTION).doc();
    await state.pointsDb.runTransaction(async function (transaction) {
      const eventSnapshots = [];
      for (const eventRecord of eventRecords) {
        eventSnapshots.push(await transaction.get(eventRecord.ref));
      }
      const summarySnapshot = await transaction.get(summaryRef);

      let deletedPoints = 0;
      eventSnapshots.forEach(function (snapshot) {
        const data = snapshot.exists ? (snapshot.data() || {}) : {};
        const points = getNumericValue(data.points);
        if (!snapshot.exists || normalizeText(data.source) !== MANUAL_SOURCE || points <= 0) {
          throw new Error("manual_point_event_changed");
        }
        deletedPoints += points;
      });

      if (!summarySnapshot.exists) {
        throw new Error("point_summary_changed");
      }
      const summaryData = summarySnapshot.data() || {};
      const pointsFieldName = resolvePointsFieldName(summaryData, schema);
      const currentPoints = getNumericValue(summaryData[pointsFieldName]);
      if (currentPoints !== review.summaryBefore) {
        throw new Error("point_summary_changed");
      }
      const nextPoints = currentPoints - deletedPoints;
      const nextManualPoints = review.manualBefore - deletedPoints;
      if (deletedPoints !== review.manualDeletePoints) {
        throw new Error("manual_point_event_changed");
      }
      if (nextPoints < 0 || nextManualPoints < 0) {
        throw new Error("point_summary_changed");
      }

      eventRecords.forEach(function (eventRecord) {
        transaction.delete(eventRecord.ref);
      });

      const summaryPayload = {
        totalPoints: nextPoints,
        manualAdjustmentPoints: nextManualPoints,
        updatedAt: FieldValue.serverTimestamp(),
        lastSource: "adminDataAdjustment"
      };
      summaryPayload[pointsFieldName] = nextPoints;
      transaction.set(summaryRef, summaryPayload, { merge: true });

      const logPayload = buildLogPayload(review, FieldValue);
      logPayload.summaryBefore = currentPoints;
      logPayload.summaryAfter = nextPoints;
      logPayload.deletedManualPoints = deletedPoints;
      transaction.set(logRef, logPayload);
    });
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

    if (review.deleteSummaryAfter && state.currentSummary) {
      deletedDocs.push({
        collection: state.activeSchema ? state.activeSchema.collectionName : "driver-points",
        id: state.currentSummary.id,
        operation: "deleteDoc"
      });
    }

    return {
      action: review.logAction,
      target: {
        vehicleNumber: review.vehicle,
        driverName: review.driverOption ? review.driverOption.label : "",
        driverKey: review.driverOption ? review.driverOption.key : "",
        month: review.month,
        day: review.day || null,
        days: Array.isArray(review.days) ? review.days.slice() : [],
        targetType: review.targetType
      },
      deletedDocs: deletedDocs,
      summaryBefore: review.summaryBefore,
      summaryAfter: review.summaryAfter,
      summaryDeleted: review.deleteSummaryAfter === true,
      eventTotalBefore: review.eventTotalBefore,
      eventTotalAfter: review.eventTotalAfter,
      warnings: review.warnings.slice(),
      operatorUid: getCurrentOperatorUid(),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: getCurrentOperatorUid() || "管理画面"
    };
  }

  function resetLoadedData() {
    state.currentSummary = null;
    state.allEvents = [];
    state.monthEvents = [];
    state.dailyRecords = [];
    state.tireRecords = [];
    state.monthsWithData = new Set();
    state.selectedDayKeys.clear();
    state.selectedManualEventIds.clear();
  }

  function resetPointGrantReview() {
    state.pointGrantReview = null;
    elements.pointGrantReview.hidden = true;
    elements.pointGrantReviewDetails.innerHTML = "";
  }

  function resetReview() {
    state.review = null;
    elements.reviewSection.hidden = true;
    elements.executeButton.disabled = true;
  }

  function syncButtons() {
    const hasSelection = hasBaseSelection();
    const busy = state.loading || state.executing || state.granting;
    elements.pointGrantPoints.disabled = busy;
    elements.pointGrantReason.disabled = busy;
    elements.pointGrantReviewButton.disabled = !hasSelection || busy || !state.pointsDb;
    elements.pointGrantExecuteButton.disabled = !state.pointGrantReview || busy;
    elements.pointGrantCancelButton.disabled = state.granting;
    elements.reviewButton.disabled = !hasSelection || busy || !state.pointsDb;
    elements.executeButton.disabled = !state.review || !state.review.canExecute || busy;
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

  function uniqueValues(values) {
    return Array.from(new Set((values || []).map(normalizeText).filter(Boolean)));
  }

  function uniqueRecords(records) {
    const unique = [];
    const seen = new Set();
    (records || []).forEach(function (record) {
      if (!record || seen.has(record.id)) {
        return;
      }
      seen.add(record.id);
      unique.push(record);
    });
    return unique;
  }

  function uniqueDailyDayEntries(entries) {
    const unique = [];
    const seen = new Set();
    (entries || []).forEach(function (entry) {
      if (!entry || !entry.record || !entry.day) {
        return;
      }
      const key = entry.record.id + "|" + String(entry.day);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(entry);
    });
    return unique;
  }
  function collectDailyRecordDays(records) {
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
    return Array.from(days).sort(function (left, right) {
      return left - right;
    });
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

  function getTireCurrentData(data) {
    if (data && data.current && typeof data.current === "object") {
      return data.current;
    }
    if (data && data.state && data.state.current && typeof data.state.current === "object") {
      return data.state.current;
    }
    return data && data.basicInfo && typeof data.basicInfo === "object" ? data.basicInfo : {};
  }

  function getTireRecordDay(data) {
    const current = getTireCurrentData(data);
    const inspectionDate = normalizeText(current.inspectionDate || (data && data.inspectionDate));
    const match = /^\d{4}-\d{2}-(\d{1,2})/.exec(inspectionDate);
    return match ? normalizeDayNumber(match[1]) : 0;
  }
  function getTireRecordMonth(data) {
    const current = getTireCurrentData(data);
    return normalizeMonthKey(data && data.inspectionMonth)
      || normalizeMonthKey(current.targetMonth)
      || normalizeMonthKey(normalizeText(current.inspectionDate || (data && data.inspectionDate)).slice(0, 7));
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
      } else if (normalizeText(data.source) === MANUAL_SOURCE) {
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

  function buildLocalDateKey(date) {
    return buildLocalMonthKey(date) + "-" + String(date.getDate()).padStart(2, "0");
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
    const code = normalizeText(error.code);
    const message = normalizeText(error.message);
    if (code && message && code !== message) {
      return code + ": " + message;
    }
    if (code || message) {
      return code || message;
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
