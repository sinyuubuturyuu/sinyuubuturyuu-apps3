(function () {
  "use strict";

  const sharedSettings = window.SharedAppSettings || null;
  const referenceConfig = window.APP_FIREBASE_DIRECTORY_CONFIG || window.APP_FIREBASE_CONFIG || null;
  const referenceSyncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || window.APP_FIREBASE_SYNC_OPTIONS || {};
  const pointsConfig = window.DRIVER_POINTS_FIREBASE_CONFIG || null;
  const pointsSettings = window.DRIVER_POINTS_FIREBASE_SETTINGS || {};
  const SERVER_GET_OPTIONS = Object.freeze({
    source: "server"
  });
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
    leaderboardStatus: document.getElementById("leaderboardStatus"),
    leaderboardBody: document.getElementById("leaderboardBody"),
    statusText: document.getElementById("statusText")
  };

  const state = {
    optionSourceReady: false,
    pointsDb: null,
    activeSchema: null,
    currentRecord: null,
    vehicleOptions: [],
    driverOptions: [],
    leaderboardRows: [],
    loadingPoints: false,
    loadingLeaderboard: false
  };

  void initialize();

  async function initialize() {
    setStatus("候補を読み込んでいます...");
    syncButtons();

    try {
      await Promise.all([
        loadSelectableOptions(),
        initializePointsDb()
      ]);

      state.optionSourceReady = true;

      if (state.vehicleOptions.length && state.driverOptions.length) {
        setStatus("");
        await loadLeaderboard();
      } else {
        setStatus("車番または乗務員の候補がまだありません。設定画面で登録してください。", true);
      }
    } catch (error) {
      console.warn("Failed to initialize driver points page:", error);
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
        const referenceDb = await ensureDb(referenceConfig, {
          useAnonymousAuth: referenceSyncOptions.useAnonymousAuth !== false
        }, "shared-settings-reference");
        const snapshots = await Promise.all([
          referenceDb.collection(optionsDocRefs.vehicles.collection).doc(optionsDocRefs.vehicles.id).get(),
          referenceDb.collection(optionsDocRefs.drivers.collection).doc(optionsDocRefs.drivers.id).get()
        ]);

        cloudVehicles = getStringArray(snapshots[0].exists ? snapshots[0].data() : null);
        cloudDrivers = getStringArray(snapshots[1].exists ? snapshots[1].data() : null);
      } catch (error) {
        console.warn("Failed to load shared options from Firebase:", error);
      }
    }

    state.vehicleOptions = buildVehicleOptions(localOptions.vehicles, cloudVehicles);
    state.driverOptions = buildDriverOptions(localOptions.drivers, cloudDrivers);
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
    if (existingApp) {
      return existingApp;
    }
    return window.firebase.initializeApp(config, appName);
  }

  function getLocalOptions() {
    if (!sharedSettings || typeof sharedSettings.ensureState !== "function") {
      return {
        vehicles: [],
        drivers: []
      };
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
        const normalizedValue = normalizeText(value);
        if (!normalizedValue || seen.has(normalizedValue)) {
          return;
        }
        seen.add(normalizedValue);
        unique.push({
          value: normalizedValue,
          label: normalizedValue,
          key: normalizedValue
        });
      });
    });

    return unique.sort(function (left, right) {
      return left.label.localeCompare(right.label, "ja", { numeric: true });
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
      options.push({
        value: rawValue || label,
        label: label,
        key: key
      });
    });

    return options;
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

    state.activeSchema = firstUsableSchema || buildFallbackSchema(pointsSettings.preferredCollection || "driverPoints");
    return state.activeSchema;
  }

  function buildCollectionCandidates() {
    const preferredCollection = normalizeText(pointsSettings.preferredCollection);
    if (preferredCollection) {
      return [preferredCollection];
    }

    const candidates = [];
    const seen = new Set();

    (pointsSettings.collectionCandidates || []).forEach(function (value) {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue || seen.has(normalizedValue)) {
        return;
      }
      seen.add(normalizedValue);
      candidates.push(normalizedValue);
    });

    return candidates;
  }

  async function inspectCollection(collectionName) {
    if (!collectionName) {
      return null;
    }

    try {
      const snapshot = await getServerQuerySnapshot(
        state.pointsDb.collection(collectionName).limit(100)
      );
      if (snapshot.empty) {
        return buildFallbackSchema(collectionName);
      }

      const docs = snapshot.docs.map(function (docSnapshot) {
        return {
          id: docSnapshot.id,
          data: docSnapshot.data() || {}
        };
      });

      return inferSchema(collectionName, docs);
    } catch (error) {
      console.warn("Failed to inspect collection:", collectionName, error);
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

    const schema = {
      collectionName: collectionName,
      vehicleField: inferFieldName(sampleFields, pointsSettings.vehicleFieldCandidates, /vehicle|car|truck/i),
      driverField: inferFieldName(sampleFields, pointsSettings.driverFieldCandidates, /driver|name|staff|employee/i),
      pointsField: inferFieldName(sampleFields, pointsSettings.pointsFieldCandidates, /point|score/i),
      updatedAtField: inferFieldName(sampleFields, pointsSettings.updatedAtFieldCandidates, /updated|created|modified/i),
      docIdPatterns: Array.isArray(pointsSettings.docIdPatterns) ? pointsSettings.docIdPatterns.slice() : [],
      detectedFromDocuments: true
    };

    if (!schema.pointsField) {
      schema.pointsField = "points";
      schema.detectedFromDocuments = false;
    }
    if (!schema.vehicleField) {
      schema.vehicleField = "vehicle";
      schema.detectedFromDocuments = false;
    }
    if (!schema.driverField) {
      schema.driverField = "driver";
      schema.detectedFromDocuments = false;
    }
    if (!schema.updatedAtField) {
      schema.updatedAtField = "updatedAt";
    }

    return schema;
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

  async function loadLeaderboard() {
    if (!state.pointsDb) {
      elements.leaderboardStatus.textContent = "Firebase に接続できていません。";
      elements.leaderboardBody.innerHTML = '<tr><td colspan="3">読み込みに失敗しました。</td></tr>';
      return;
    }

    state.loadingLeaderboard = true;
    elements.leaderboardStatus.textContent = "一覧を読み込んでいます...";
    elements.leaderboardBody.innerHTML = '<tr><td colspan="3">読み込み中...</td></tr>';
    syncButtons();

    try {
      const schema = await resolveSchema(true);
      const summaryKindValue = normalizeText(pointsSettings.summaryKindValue);
      const collectionRef = state.pointsDb.collection(schema.collectionName);
      let records = [];

      if (summaryKindValue) {
        const snapshot = await getServerQuerySnapshot(
          collectionRef.where("kind", "==", summaryKindValue)
        );
        records = snapshot.docs.map(function (docSnapshot) {
          return {
            id: docSnapshot.id,
            ref: docSnapshot.ref,
            data: docSnapshot.data() || {}
          };
        });
      } else {
        const snapshot = await getServerQuerySnapshot(collectionRef);
        records = snapshot.docs.map(function (docSnapshot) {
          return {
            id: docSnapshot.id,
            ref: docSnapshot.ref,
            data: docSnapshot.data() || {}
          };
        }).filter(isSummaryPointRecord);
      }

      state.leaderboardRows = buildLeaderboardRows(records, schema);
      renderLeaderboard();
    } catch (error) {
      console.warn("Failed to load leaderboard:", error);
      elements.leaderboardStatus.textContent = "一覧の読み込みに失敗しました: " + formatError(error);
      elements.leaderboardBody.innerHTML = '<tr><td colspan="3">一覧の読み込みに失敗しました。</td></tr>';
    } finally {
      state.loadingLeaderboard = false;
      syncButtons();
    }
  }

  function buildLeaderboardRows(records, schema) {
    const latestByDriverVehicle = new Map();
    const driverMetaByKey = new Map();
    const driverOrderByKey = new Map();

    state.driverOptions.forEach(function (option, index) {
      if (!driverOrderByKey.has(option.key)) {
        driverOrderByKey.set(option.key, index);
      }
      if (!driverMetaByKey.has(option.key)) {
        driverMetaByKey.set(option.key, {
          key: option.key,
          name: option.label,
          order: index
        });
      }
    });

    (records || []).forEach(function (record) {
      if (!isSummaryPointRecord(record)) {
        return;
      }

      const driverKey = resolveRecordDriverKey(record.data);
      if (!driverKey) {
        return;
      }

      const vehicleKey = resolveRecordVehicleKey(record.data);
      const pairKey = vehicleKey + "::" + driverKey;
      const currentTime = getRecordUpdatedAtTime(record.data, schema);
      const existingRecord = latestByDriverVehicle.get(pairKey);

      if (!existingRecord || currentTime >= getRecordUpdatedAtTime(existingRecord.data, schema)) {
        latestByDriverVehicle.set(pairKey, record);
      }

      if (!driverMetaByKey.has(driverKey)) {
        driverMetaByKey.set(driverKey, {
          key: driverKey,
          name: resolveRecordDriverLabel(record.data),
          order: Number.MAX_SAFE_INTEGER
        });
      }
    });

    const totalsByDriver = new Map();

    latestByDriverVehicle.forEach(function (record) {
      const driverKey = resolveRecordDriverKey(record.data);
      if (!driverKey) {
        return;
      }

      const points = getRecordPoints(record, schema);
      if (points === 0) {
        return;
      }
      const existing = totalsByDriver.get(driverKey);
      if (existing) {
        existing.points += points;
        existing.breakdowns.push({
          vehicleKey: resolveRecordVehicleKey(record.data),
          vehicleLabel: resolveRecordVehicleLabel(record.data),
          points: points
        });
        return;
      }

      const meta = driverMetaByKey.get(driverKey) || {
        key: driverKey,
        name: resolveRecordDriverLabel(record.data),
        order: Number.MAX_SAFE_INTEGER
      };
      totalsByDriver.set(driverKey, {
        key: driverKey,
        name: meta.name,
        order: meta.order,
        points: points,
        breakdowns: [{
          vehicleKey: resolveRecordVehicleKey(record.data),
          vehicleLabel: resolveRecordVehicleLabel(record.data),
          points: points
        }]
      });
    });

    return Array.from(totalsByDriver.values()).sort(function (left, right) {
      if (right.points !== left.points) {
        return right.points - left.points;
      }
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.name.localeCompare(right.name, "ja", { numeric: true, sensitivity: "base" });
    });
  }

  function renderLeaderboard() {
    const rows = state.leaderboardRows || [];

    if (!rows.length) {
      elements.leaderboardStatus.textContent = "表示できる社員データがありません。";
      elements.leaderboardBody.innerHTML = '<tr><td colspan="3">表示できる社員データがありません。</td></tr>';
      return;
    }

    elements.leaderboardStatus.textContent = rows.length + "名のポイントを表示しています。";
    elements.leaderboardBody.innerHTML = rows.map(function (row, index) {
      const breakdownMarkup = (Array.isArray(row.breakdowns) && row.breakdowns.length
        ? row.breakdowns.slice().sort(function (left, right) {
            if (right.points !== left.points) {
              return right.points - left.points;
            }
            return (left.vehicleLabel || left.vehicleKey || "").localeCompare(
              right.vehicleLabel || right.vehicleKey || "",
              "ja",
              { numeric: true, sensitivity: "base" }
            );
          })
        : []
      ).map(function (breakdown) {
        return [
          '<span class="leaderboard-breakdown-item">',
          '<span class="leaderboard-breakdown-vehicle">' + escapeHtml(breakdown.vehicleLabel || breakdown.vehicleKey || "") + "</span>",
          '<span class="leaderboard-breakdown-points">' + String(breakdown.points) + "</span>",
          "</span>"
        ].join("");
      }).join("");

      return [
        "<tr>",
        '<td class="leaderboard-rank">' + String(index + 1) + "</td>",
        '<td class="leaderboard-name"><div class="leaderboard-name-line">'
          + '<span class="leaderboard-name-text">' + escapeHtml(row.name) + "</span>"
          + (breakdownMarkup ? '<span class="leaderboard-breakdown-list">' + breakdownMarkup + "</span>" : "")
          + "</div></td>",
        '<td class="leaderboard-points">' + String(row.points) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function resolveRecordDriverKey(source) {
    const values = collectNormalizedFieldValues(
      source,
      uniqueFieldNames(["driverKey", "driverRaw", "driverName", "driver", "driverDisplay", "driverAliases"]),
      normalizeDriverKey
    );
    return values[0] || "";
  }

  function resolveRecordVehicleKey(source) {
    const values = collectNormalizedFieldValues(
      source,
      uniqueFieldNames(["vehicleKey", "vehicleNumber", "vehicle", "vehicleNo"]),
      normalizeText
    );
    return values[0] || "";
  }

  function resolveRecordVehicleLabel(source) {
    const safeSource = source && typeof source === "object" ? source : {};
    return normalizeText(safeSource.vehicleNumber)
      || normalizeText(safeSource.vehicle)
      || normalizeText(safeSource.vehicleKey)
      || normalizeText(safeSource.vehicleNo);
  }

  function resolveRecordDriverLabel(source) {
    const safeSource = source && typeof source === "object" ? source : {};
    return normalizeText(safeSource.driverName)
      || normalizeDriverName(safeSource.driverRaw)
      || normalizeDriverName(safeSource.driver)
      || normalizeDriverName(safeSource.driverDisplay)
      || "名称未設定";
  }

  function getStringArray(source) {
    if (!source || !Array.isArray(source.values)) {
      return [];
    }
    return source.values.map(function (value) {
      return normalizeText(value);
    }).filter(Boolean);
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isSummaryPointRecord(record) {
    const summaryKindValue = normalizeText(pointsSettings.summaryKindValue);
    const recordId = normalizeText(record && record.id);
    const recordKind = normalizeText(record && record.data ? record.data.kind : "");

    if (summaryKindValue && recordKind === summaryKindValue) {
      return true;
    }

    return recordId.startsWith("driver_points_summary_");
  }

  function resolvePointsFieldName(source, schema) {
    const fieldNames = uniqueFieldNames((pointsSettings.pointsFieldCandidates || []).concat(schema.pointsField));
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

  function collectNormalizedFieldValues(source, fieldNames, normalizer) {
    const normalize = typeof normalizer === "function" ? normalizer : normalizeText;
    const values = [];
    const seen = new Set();
    const safeSource = source && typeof source === "object" ? source : {};

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

  function getRecordUpdatedAtTime(source, schema) {
    const fieldNames = uniqueFieldNames([schema.updatedAtField].concat(pointsSettings.updatedAtFieldCandidates || []));
    const safeSource = source && typeof source === "object" ? source : {};

    for (const fieldName of fieldNames) {
      const value = safeSource[fieldName];
      const time = getTimeValue(value);
      if (time > 0) {
        return time;
      }
    }

    return 0;
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

  function formatDateTime(value) {
    if (!value) {
      return "";
    }

    let date = null;
    if (typeof value.toDate === "function") {
      try {
        date = value.toDate();
      } catch {
        date = null;
      }
    } else if (value instanceof Date) {
      date = value;
    } else {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!date) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes;
  }

  function syncButtons() {
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

