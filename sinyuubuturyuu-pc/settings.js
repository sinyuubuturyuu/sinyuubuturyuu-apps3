(function () {
  "use strict";

  const sharedSettings = window.SharedAppSettings;
  const VEHICLE_BACKUP = Object.freeze({
    kind: "vehicles",
    docId: "monthly_tire_company_settings_backup_vehicles_slot1",
    label: "車両番号"
  });
  const DRIVER_BACKUP = Object.freeze({
    kind: "drivers",
    docId: "monthly_tire_company_settings_backup_drivers_slot1",
    label: "運転者名"
  });
  const DEFAULT_COLLECTION = "syainmeibo";
  const BACKUP_VALUE_FIELDS = Object.freeze({
    vehicles: Object.freeze([
      "values",
      "vehicles",
      "vehicleNumbers",
      "\u8eca\u4e21\u756a\u53f7",
      "\u8eca\u756a"
    ]),
    drivers: Object.freeze([
      "values",
      "drivers",
      "driverNames",
      "\u904b\u8ee2\u8005",
      "\u904b\u8ee2\u8005\u540d",
      "\u4e57\u52d9\u54e1",
      "\u4e57\u52d9\u54e1\u540d",
      "\u4e57\u52d9\u54e1\u540d\u7c3f"
    ])
  });

  const elements = {
    vehicleInput: document.getElementById("vehicleInput"),
    addVehicleButton: document.getElementById("addVehicleButton"),
    saveVehiclesButton: document.getElementById("saveVehiclesButton"),
    restoreVehiclesButton: document.getElementById("restoreVehiclesButton"),
    deleteVehiclesButton: document.getElementById("deleteVehiclesButton"),
    vehicleLocalStatus: document.getElementById("vehicleLocalStatus"),
    vehicleBackupStatus: document.getElementById("vehicleBackupStatus"),
    driverNameInput: document.getElementById("driverNameInput"),
    driverReadingInput: document.getElementById("driverReadingInput"),
    addDriverButton: document.getElementById("addDriverButton"),
    saveDriversButton: document.getElementById("saveDriversButton"),
    restoreDriversButton: document.getElementById("restoreDriversButton"),
    deleteDriversButton: document.getElementById("deleteDriversButton"),
    vehicleList: document.getElementById("vehicleList"),
    driverList: document.getElementById("driverList"),
    driverLocalStatus: document.getElementById("driverLocalStatus"),
    driverBackupStatus: document.getElementById("driverBackupStatus"),
    globalStatus: document.getElementById("globalStatus")
  };

  const state = {
    shared: sharedSettings.ensureState(),
    backupMeta: {
      vehicles: null,
      drivers: null
    },
    cloudReady: false,
    directoryEnabled: false,
    db: null,
    directoryDb: null,
    directoryError: "",
    working: false
  };
  const emulatorConnectedAppNames = new Set();

  bindEvents();
  render();
  void initializeCloud();

  function bindEvents() {
    elements.addVehicleButton.addEventListener("click", addVehicle);
    elements.vehicleInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      addVehicle();
    });

    elements.addDriverButton.addEventListener("click", addDriver);
    elements.driverNameInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      addDriver();
    });
    elements.driverReadingInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      addDriver();
    });

    elements.saveVehiclesButton.addEventListener("click", function () {
      void saveBackup(VEHICLE_BACKUP);
    });
    elements.restoreVehiclesButton.addEventListener("click", function () {
      void restoreBackup(VEHICLE_BACKUP);
    });
    elements.deleteVehiclesButton.addEventListener("click", clearAllVehicles);

    elements.saveDriversButton.addEventListener("click", function () {
      void saveBackup(DRIVER_BACKUP);
    });
    elements.restoreDriversButton.addEventListener("click", function () {
      void restoreBackup(DRIVER_BACKUP);
    });
    elements.deleteDriversButton.addEventListener("click", clearAllDrivers);
  }

  function refreshSharedState() {
    state.shared = sharedSettings.ensureState();
  }

  function setGlobalStatus(message, isError) {
    elements.globalStatus.textContent = message || "";
    elements.globalStatus.style.color = isError ? "#b00020" : "";
    elements.globalStatus.dataset.state = message ? (isError ? "error" : "info") : "";
  }

  function render() {
    refreshSharedState();

    elements.vehicleLocalStatus.textContent = "ローカル登録数: " + state.shared.vehicles.length + "件";
    elements.driverLocalStatus.textContent = "ローカル登録数: " + state.shared.drivers.length + "件";

    renderValueList(elements.vehicleList, state.shared.vehicles, removeVehicle);
    renderValueList(elements.driverList, state.shared.drivers, removeDriver);
    renderBackupStatus(VEHICLE_BACKUP, elements.vehicleBackupStatus);
    renderBackupStatus(DRIVER_BACKUP, elements.driverBackupStatus);
    renderButtons();
  }

  function renderValueList(container, values, onDelete) {
    container.innerHTML = "";

    if (!values.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = "まだ登録されていません";
      container.appendChild(empty);
      return;
    }

    values.forEach(function (value) {
      const item = document.createElement("div");
      item.className = "value-item";

      const label = document.createElement("span");
      label.className = "value-item-label";
      label.textContent = value;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "mini-button danger value-delete-button";
      deleteButton.textContent = "削除";
      deleteButton.addEventListener("click", function () {
        onDelete(value);
      });

      item.appendChild(label);
      item.appendChild(deleteButton);
      container.appendChild(item);
    });
  }

  function renderBackupStatus(definition, node) {
    if (!state.cloudReady) {
      node.textContent = "バックアップ: 利用できません";
      return;
    }

    const meta = state.backupMeta[definition.kind];
    if (!meta) {
      node.textContent = "バックアップ: 未保存";
      return;
    }

    const updatedAt = meta.serverUpdatedAt || meta.clientUpdatedAt || "";
    const updatedLabel = updatedAt ? formatDateTime(updatedAt) : "日時不明";
    node.textContent = "バックアップ: " + updatedLabel + " / " + Number(meta.valueCount || 0) + "件";
  }

  function renderButtons() {
    const disabledCloud = state.working || !state.cloudReady;
    elements.saveVehiclesButton.disabled = disabledCloud || !state.shared.vehicles.length;
    elements.saveDriversButton.disabled = disabledCloud || !state.shared.drivers.length;
    elements.restoreVehiclesButton.disabled = disabledCloud || !state.backupMeta.vehicles;
    elements.restoreDriversButton.disabled = disabledCloud || !state.backupMeta.drivers;
    elements.deleteVehiclesButton.disabled = state.working || !state.shared.vehicles.length;
    elements.deleteDriversButton.disabled = state.working || !state.shared.drivers.length;
  }

  function addVehicle() {
    const value = sharedSettings.normalizeText(elements.vehicleInput.value);
    if (!value) {
      setGlobalStatus("車両番号を入力してください。", true);
      return;
    }

    if (state.shared.vehicles.includes(value)) {
      setGlobalStatus("その車両番号は既に登録されています。", true);
      return;
    }

    sharedSettings.addVehicle(value);
    elements.vehicleInput.value = "";
    render();
    setGlobalStatus("車両番号を追加しました。");
  }

  function addDriver() {
    const name = sharedSettings.normalizeText(elements.driverNameInput.value);
    const reading = sharedSettings.normalizeText(elements.driverReadingInput.value);
    if (!name) {
      setGlobalStatus("運転者名を入力してください。", true);
      return;
    }
    if (!reading) {
      setGlobalStatus("読み仮名を入力してください。", true);
      return;
    }

    sharedSettings.addDriver(name, reading);
    elements.driverNameInput.value = "";
    elements.driverReadingInput.value = "";
    render();
    setGlobalStatus("運転者名を追加しました。");
  }

  function removeVehicle(value) {
    if (!window.confirm("車両番号「" + value + "」を削除しますか？")) {
      return;
    }

    sharedSettings.saveVehicles(state.shared.vehicles.filter(function (entry) {
      return entry !== value;
    }));
    render();
    setGlobalStatus("車両番号を削除しました。");
  }

  function removeDriver(value) {
    if (!window.confirm("運転者名「" + value + "」を削除しますか？")) {
      return;
    }

    sharedSettings.saveDrivers(state.shared.drivers.filter(function (entry) {
      return entry !== value;
    }));
    render();
    setGlobalStatus("運転者名を削除しました。");
  }

  function clearAllVehicles() {
    if (!state.shared.vehicles.length) {
      return;
    }

    if (!window.confirm("登録済みの車両番号をすべて削除しますか？\nFirebase バックアップは削除されません。")) {
      return;
    }

    sharedSettings.saveVehicles([]);
    render();
    setGlobalStatus("登録済みの車両番号をすべて削除しました。Firebase バックアップは残っています。");
  }

  function clearAllDrivers() {
    if (!state.shared.drivers.length) {
      return;
    }

    if (!window.confirm("登録済みの運転者名をすべて削除しますか？\nFirebase バックアップは削除されません。")) {
      return;
    }

    sharedSettings.saveDrivers([]);
    render();
    setGlobalStatus("登録済みの運転者名をすべて削除しました。Firebase バックアップは残っています。");
  }

  async function initializeCloud() {
    state.directoryEnabled = hasDirectorySyncTarget();

    state.db = null;
    state.directoryDb = null;
    state.directoryError = "";

    try {
      state.db = await ensurePrimaryDb();
    } catch (error) {
      console.warn("Failed to initialize primary settings cloud:", error);
    }

    if (state.directoryEnabled) {
      try {
        state.directoryDb = await ensureDirectoryDb();
      } catch (error) {
        state.directoryDb = null;
        state.directoryError = formatErrorReason(error);
        console.warn("Failed to initialize employee directory cloud:", error);
      }
    }

    state.cloudReady = Boolean(state.directoryDb || state.db);
    if (!state.cloudReady) {
      render();
      setGlobalStatus("Firebase に接続できないため、バックアップ機能は使えません。", true);
      return;
    }

    await refreshBackups();

    if (state.directoryEnabled && !state.directoryDb && state.db) {
      setGlobalStatus("社員名簿 Firebase に接続できないため、既存バックアップを使います。", false);
    }
  }

  async function ensurePrimaryDb() {
    if (!window.firebase || !window.APP_FIREBASE_CONFIG) {
      throw new Error("firebase_config_missing");
    }

    return ensureDb(window.APP_FIREBASE_CONFIG, window.APP_FIREBASE_SYNC_OPTIONS || {}, null);
  }

  async function ensureDirectoryDb() {
    if (!hasDirectorySyncTarget()) {
      return null;
    }

    const syncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || {};
    return ensureDb(
      window.APP_FIREBASE_DIRECTORY_CONFIG,
      syncOptions,
      syncOptions.appName || "sinyuubuturyuu-directory"
    );
  }

  async function ensureDb(config, syncOptions, appName) {
    const app = getOrCreateFirebaseApp(config, appName);
    const auth = app.auth();
    const db = app.firestore();
    connectLocalFirebaseEmulators(app, auth, db);
    const authApi = window.DevFirebaseAuth;

    if (authApi && typeof authApi.ensureCompatUser === "function") {
      await authApi.ensureCompatUser(auth, { waitMs: 5000 });
    } else if (!auth.currentUser) {
      throw new Error("ログインしてください。");
    }

    return db;
  }

  function getCollectionName() {
    const syncOptions = window.APP_FIREBASE_SYNC_OPTIONS || {};
    return syncOptions.collection || DEFAULT_COLLECTION;
  }

  function getDirectoryCollectionName() {
    const syncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || {};
    return syncOptions.collection || DEFAULT_COLLECTION;
  }

  function hasDirectorySyncTarget() {
    const syncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || {};
    return Boolean(syncOptions.enabled && window.APP_FIREBASE_DIRECTORY_CONFIG);
  }

  function getOrCreateFirebaseApp(config, appName) {
    if (!appName) {
      if (!window.firebase.apps.length) {
        return window.firebase.initializeApp(config);
      }
      return window.firebase.app();
    }

    const existingApp = window.firebase.apps.find(function (app) {
      return app.name === appName;
    });
    if (existingApp) {
      return existingApp;
    }

    return window.firebase.initializeApp(config, appName);
  }

  function connectLocalFirebaseEmulators(app, auth, db) {
    if (
      (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") ||
      emulatorConnectedAppNames.has(app.name)
    ) {
      return;
    }

    auth.useEmulator("http://127.0.0.1:9099");
    db.useEmulator("127.0.0.1", 8080);
    emulatorConnectedAppNames.add(app.name);
  }

  function getDocId(definition, syncOptions) {
    const docIds = syncOptions.docIds || {};
    return docIds[definition.kind] || definition.docId;
  }

  function getBackupDocRef(definition) {
    return state.db.collection(getCollectionName()).doc(definition.docId);
  }

  function getDirectoryDocRef(definition) {
    if (!state.directoryDb) {
      return null;
    }

    const syncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || {};
    return state.directoryDb
      .collection(getDirectoryCollectionName())
      .doc(getDocId(definition, syncOptions));
  }

  function appendBackupRef(refEntries, ref) {
    if (!ref) {
      return;
    }

    const appName = ref.firestore && ref.firestore.app ? ref.firestore.app.name : "";
    const refPath = ref.path || ref.id || "";
    const key = appName + "::" + refPath;
    if (refEntries.some(function (entry) { return entry.key === key; })) {
      return;
    }

    refEntries.push({ key: key, ref: ref });
  }

  async function resolveBackupDocRef(definition) {
    if (state.directoryEnabled) {
      try {
        await ensureDirectoryReady();
        const directoryRef = getDirectoryDocRef(definition);
        if (directoryRef) {
          return directoryRef;
        }
      } catch (error) {
        state.directoryError = formatErrorReason(error);
      }

      throw new Error("firebase_unavailable");
    }

    if (state.db) {
      return getBackupDocRef(definition);
    }

    throw new Error("firebase_unavailable");
  }

  async function ensureDirectoryReady() {
    if (!state.directoryEnabled) {
      return null;
    }

    if (state.directoryDb) {
      return state.directoryDb;
    }

    try {
      state.directoryDb = await ensureDirectoryDb();
      state.directoryError = "";
      return state.directoryDb;
    } catch (error) {
      state.directoryDb = null;
      state.directoryError = formatErrorReason(error);
      throw error;
    }
  }

  async function refreshBackups() {
    if (!state.cloudReady) {
      render();
      return;
    }

    try {
      const backups = await Promise.all([
        readBackupRecord(VEHICLE_BACKUP),
        readBackupRecord(DRIVER_BACKUP)
      ]);

      state.backupMeta.vehicles = backups[0] && backups[0].values.length ? backups[0].meta : null;
      state.backupMeta.drivers = backups[1] && backups[1].values.length ? backups[1].meta : null;
    } catch (error) {
      state.directoryError = formatErrorReason(error);
      state.backupMeta.vehicles = null;
      state.backupMeta.drivers = null;
      console.warn("Failed to refresh backup metadata:", error);
    }

    render();
  }

  function normalizeBackupValues(definition, data) {
    const fieldNames = BACKUP_VALUE_FIELDS[definition.kind] || ["values"];

    for (let index = 0; index < fieldNames.length; index += 1) {
      const fieldName = fieldNames[index];
      const values = readArrayFromCandidate(data, fieldName);
      if (!values) {
        continue;
      }

      return values
        .map(function (value) {
          return sharedSettings.normalizeText ? sharedSettings.normalizeText(value) : String(value ?? "").trim();
        })
        .filter(Boolean);
    }

    return [];
  }

  function readArrayFromCandidate(source, fieldName) {
    if (!source || typeof source !== "object") {
      return null;
    }

    const directValues = Array.isArray(source[fieldName]) ? source[fieldName] : null;
    if (directValues) {
      return directValues;
    }

    const nestedSource = source[fieldName];
    if (!nestedSource || typeof nestedSource !== "object") {
      return null;
    }

    const nestedFieldNames = ["values", "items", "rows", "list", "data"];
    for (let index = 0; index < nestedFieldNames.length; index += 1) {
      const nestedFieldName = nestedFieldNames[index];
      const nestedValues = Array.isArray(nestedSource[nestedFieldName]) ? nestedSource[nestedFieldName] : null;
      if (nestedValues) {
        return nestedValues;
      }
    }

    const arrayValues = Object.keys(nestedSource).reduce(function (result, key) {
      if (result) {
        return result;
      }
      return Array.isArray(nestedSource[key]) ? nestedSource[key] : null;
    }, null);

    return arrayValues;
  }

  async function readBackupRecord(definition) {
    const refs = [];

    if (state.directoryEnabled) {
      try {
        await ensureDirectoryReady();
      } catch {
        return null;
      }
      appendBackupRef(refs, getDirectoryDocRef(definition));
    } else {
      appendBackupRef(refs, state.db ? getBackupDocRef(definition) : null);
    }

    if (!refs.length) {
      return null;
    }

    let fallbackSnapshot = null;
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index].ref;
      try {
        const snapshot = await ref.get();
        if (!snapshot || !snapshot.exists) {
          continue;
        }

        if (!fallbackSnapshot) {
          fallbackSnapshot = snapshot;
        }

        const values = normalizeBackupValues(definition, snapshot.data() || {});
        if (!values.length) {
          continue;
        }

        return {
          snapshot: snapshot,
          values: values,
          meta: buildBackupMeta(snapshot, definition, values)
        };
      } catch (error) {
        continue;
      }
    }

    if (!fallbackSnapshot) {
      return null;
    }

    const fallbackValues = normalizeBackupValues(definition, fallbackSnapshot.data() || {});
    return {
      snapshot: fallbackSnapshot,
      values: fallbackValues,
      meta: buildBackupMeta(fallbackSnapshot, definition, fallbackValues)
    };
  }

  function buildBackupMeta(snapshot, definition, normalizedValues) {
    const data = snapshot.data() || {};
    const values = Array.isArray(normalizedValues) ? normalizedValues : normalizeBackupValues(definition, data);
    return {
      valueCount: values.length || Number(data.valueCount || 0),
      clientUpdatedAt: data.clientUpdatedAt || "",
      serverUpdatedAt: formatFirestoreDate(data.updatedAt)
    };
  }

  async function saveBackup(definition) {
    const values = definition.kind === "vehicles" ? state.shared.vehicles : state.shared.drivers;
    if (!values.length) {
      setGlobalStatus(definition.label + "の登録データがありません。", true);
      return;
    }

    state.working = true;
    render();

    try {
      const backupRef = await resolveBackupDocRef(definition);
      const source = state.directoryEnabled ? "integrated-settings-directory" : "integrated-settings";
      await backupRef.set(buildBackupPayload(definition, values, source));
      state.directoryError = "";

      await refreshBackups();
      if (state.directoryEnabled) {
        setGlobalStatus(definition.label + "を Firebase に保存しました。");
      } else {
        setGlobalStatus(definition.label + "をバックアップしました。");
      }
    } catch (error) {
      state.directoryError = formatErrorReason(error);
      setGlobalStatus(definition.label + "のバックアップ保存に失敗しました。", true);
      console.warn("Failed to save backup:", error);
    } finally {
      state.working = false;
      render();
    }
  }

  function buildBackupPayload(definition, values, source) {
    return {
      kind: definition.kind,
      slot: 1,
      values: values,
      valueCount: values.length,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      source: source
    };
  }

  function formatErrorReason(error) {
    if (!error) {
      return "";
    }

    if (error.code) {
      return String(error.code);
    }

    if (error.message) {
      return String(error.message);
    }

    return "";
  }

  async function restoreBackup(definition) {
    state.working = true;
    render();

    try {
      const backup = await readBackupRecord(definition);
      if (!backup || !backup.snapshot || !backup.snapshot.exists || !backup.values.length) {
        setGlobalStatus(definition.label + "のバックアップはありません。", true);
        return;
      }

      if (definition.kind === "vehicles") {
        sharedSettings.saveVehicles(backup.values);
      } else {
        sharedSettings.saveDrivers(backup.values);
      }

      await refreshBackups();
      setGlobalStatus(definition.label + "をバックアップから復元しました。");
    } catch (error) {
      state.directoryError = formatErrorReason(error);
      setGlobalStatus(definition.label + "の復元に失敗しました。", true);
      console.warn("Failed to restore backup:", error);
    } finally {
      state.working = false;
      render();
    }
  }

  function formatFirestoreDate(value) {
    if (!value) {
      return "";
    }
    if (typeof value.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch {
        return "";
      }
    }
    return String(value);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "日時不明";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + ":" + minutes;
  }
})();

