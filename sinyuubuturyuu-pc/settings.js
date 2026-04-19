(function () {
  "use strict";

  const sharedSettings = window.SharedAppSettings;
  const VEHICLE_BACKUP = Object.freeze({
    kind: "vehicles",
    docId: "monthly_tire_company_settings_backup_vehicles_slot1",
    label: "車両番号",
    profilesFieldName: "vehicleProfiles"
  });
  const DRIVER_BACKUP = Object.freeze({
    kind: "drivers",
    docId: "monthly_tire_company_settings_backup_drivers_slot1",
    label: "運転者設定",
    profilesFieldName: "userProfiles"
  });
  const DEFAULT_COLLECTION = "syainmeibo";
  const BACKUP_VALUE_FIELDS = Object.freeze({
    vehicles: Object.freeze(["values", "vehicles", "vehicleNumbers", "車両番号", "車番"]),
    drivers: Object.freeze(["values", "drivers", "driverNames", "運転者", "運転者名", "乗務員", "乗務員名", "乗務員名簿"])
  });

  const elements = {
    vehicleInput: document.getElementById("vehicleInput"),
    vehicleTruckTypeInput: document.getElementById("vehicleTruckTypeInput"),
    addVehicleButton: document.getElementById("addVehicleButton"),
    cancelVehicleEditButton: document.getElementById("cancelVehicleEditButton"),
    saveVehiclesButton: document.getElementById("saveVehiclesButton"),
    restoreVehiclesButton: document.getElementById("restoreVehiclesButton"),
    deleteVehiclesButton: document.getElementById("deleteVehiclesButton"),
    vehicleLocalStatus: document.getElementById("vehicleLocalStatus"),
    vehicleBackupStatus: document.getElementById("vehicleBackupStatus"),
    driverLoginIdInput: document.getElementById("driverLoginIdInput"),
    driverNameInput: document.getElementById("driverNameInput"),
    driverReadingInput: document.getElementById("driverReadingInput"),
    driverVehicleSelect: document.getElementById("driverVehicleSelect"),
    addDriverButton: document.getElementById("addDriverButton"),
    cancelDriverEditButton: document.getElementById("cancelDriverEditButton"),
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
    backupMeta: { vehicles: null, drivers: null },
    cloudReady: false,
    directoryEnabled: false,
    db: null,
    directoryDb: null,
    directoryError: "",
    working: false,
    editing: {
      vehicleNumber: "",
      userKey: ""
    }
  };

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
      ? Object.assign({}, config || {}, window.APP_FIREBASE_EMULATOR_CONFIG || {})
      : (config || {});
  }

  function getFirebaseEmulatorRuntime() {
    return Object.assign({
      authUrl: "http://127.0.0.1:9099",
      firestoreHost: "127.0.0.1",
      firestorePort: 8080
    }, window.APP_FIREBASE_EMULATOR || {});
  }

  function connectCompatAuthEmulatorIfNeeded(auth) {
    if (!shouldUseFirebaseEmulator() || !auth || typeof auth.useEmulator !== "function" || auth.__sinyuubuturyuuEmulatorConnected) {
      return;
    }

    auth.useEmulator(getFirebaseEmulatorRuntime().authUrl, { disableWarnings: true });
    auth.__sinyuubuturyuuEmulatorConnected = true;
  }

  function connectCompatFirestoreEmulatorIfNeeded(db) {
    if (!shouldUseFirebaseEmulator() || !db || typeof db.useEmulator !== "function" || db.__sinyuubuturyuuEmulatorConnected) {
      return;
    }

    const runtime = getFirebaseEmulatorRuntime();
    db.useEmulator(runtime.firestoreHost, runtime.firestorePort);
    db.__sinyuubuturyuuEmulatorConnected = true;
  }

  bindEvents();
  render();
  void initializeCloud();

  function bindEvents() {
    elements.addVehicleButton.addEventListener("click", addOrUpdateVehicle);
    elements.cancelVehicleEditButton.addEventListener("click", cancelVehicleEdit);
    elements.vehicleInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addOrUpdateVehicle();
    });

    elements.addDriverButton.addEventListener("click", addOrUpdateDriver);
    elements.cancelDriverEditButton.addEventListener("click", cancelDriverEdit);
    elements.driverLoginIdInput.addEventListener("keydown", submitDriverOnEnter);
    elements.driverNameInput.addEventListener("keydown", submitDriverOnEnter);
    elements.driverReadingInput.addEventListener("keydown", submitDriverOnEnter);
    elements.driverVehicleSelect.addEventListener("keydown", submitDriverOnEnter);

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

  function submitDriverOnEnter(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addOrUpdateDriver();
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
    renderVehicleForm();
    renderDriverForm();
    renderVehicleList();
    renderDriverList();
    renderBackupStatus(VEHICLE_BACKUP, elements.vehicleBackupStatus);
    renderBackupStatus(DRIVER_BACKUP, elements.driverBackupStatus);
    elements.vehicleLocalStatus.textContent = "ローカル登録数: " + state.shared.vehicleProfiles.length + "件";
    elements.driverLocalStatus.textContent = "ローカル登録数: " + state.shared.userProfiles.length + "件";
    renderButtons();
  }

  function renderVehicleForm() {
    const editingProfile = getEditingVehicleProfile();
    elements.addVehicleButton.textContent = editingProfile ? "訂正を保存" : "追加";
    elements.cancelVehicleEditButton.hidden = !editingProfile;

    if (editingProfile) {
      elements.vehicleInput.value = editingProfile.vehicleNumber;
      elements.vehicleTruckTypeInput.value = editingProfile.truckType;
      return;
    }

    if (document.activeElement !== elements.vehicleInput) {
      elements.vehicleInput.value = "";
    }
    elements.vehicleTruckTypeInput.value = sharedSettings.TRUCK_TYPES.LOW12;
  }

  function renderDriverForm() {
    populateDriverVehicleSelect();
    const editingProfile = getEditingUserProfile();
    elements.addDriverButton.textContent = editingProfile ? "訂正を保存" : "追加";
    elements.cancelDriverEditButton.hidden = !editingProfile;

    if (editingProfile) {
      elements.driverLoginIdInput.value = editingProfile.loginId || "";
      elements.driverNameInput.value = editingProfile.driverName || "";
      elements.driverReadingInput.value = editingProfile.driverReading || "";
      elements.driverVehicleSelect.value = editingProfile.vehicleNumber || "";
      return;
    }

    if (document.activeElement !== elements.driverLoginIdInput) {
      elements.driverLoginIdInput.value = "";
    }
    if (document.activeElement !== elements.driverNameInput) {
      elements.driverNameInput.value = "";
    }
    if (document.activeElement !== elements.driverReadingInput) {
      elements.driverReadingInput.value = "";
    }
    if (document.activeElement !== elements.driverVehicleSelect) {
      elements.driverVehicleSelect.value = "";
    }
  }

  function populateDriverVehicleSelect() {
    const currentValue = String(elements.driverVehicleSelect.value || "");
    elements.driverVehicleSelect.innerHTML = "";
    elements.driverVehicleSelect.appendChild(new Option("既定車番を選択（任意）", ""));
    state.shared.vehicleProfiles.forEach(function (profile) {
      elements.driverVehicleSelect.appendChild(
        new Option(
          profile.vehicleNumber + " / " + sharedSettings.truckTypeLabel(profile.truckType),
          profile.vehicleNumber
        )
      );
    });

    if (currentValue && state.shared.vehicles.includes(currentValue)) {
      elements.driverVehicleSelect.value = currentValue;
    }
  }

  function renderVehicleList() {
    renderProfileList({
      container: elements.vehicleList,
      rows: state.shared.vehicleProfiles,
      getLabel: function (profile) {
        return profile.vehicleNumber;
      },
      getMeta: function (profile) {
        return sharedSettings.truckTypeLabel(profile.truckType);
      },
      onEdit: startVehicleEdit,
      onDelete: removeVehicle
    });
  }

  function renderDriverList() {
    renderProfileList({
      container: elements.driverList,
      rows: state.shared.userProfiles,
      getLabel: function (profile) {
        return profile.driverName;
      },
      getMeta: function (profile) {
        const truckType = sharedSettings.getTruckTypeForVehicle(profile.vehicleNumber, state.shared);
        const vehicleLabel = profile.vehicleNumber
          ? profile.vehicleNumber + " / " + sharedSettings.truckTypeLabel(truckType)
          : "既定車番なし";
        const readingLabel = profile.driverReading || "読み未設定";
        return "読み: " + readingLabel + " / ログインID: " + (profile.loginId || "未設定") + " / " + vehicleLabel;
      },
      onEdit: startDriverEdit,
      onDelete: removeDriver
    });
  }

  function renderProfileList(options) {
    const container = options.container;
    const rows = Array.isArray(options.rows) ? options.rows : [];
    container.innerHTML = "";

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      empty.textContent = "まだ登録されていません";
      container.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      const item = document.createElement("div");
      item.className = "value-item";

      const copy = document.createElement("div");
      copy.className = "value-item-copy";

      const label = document.createElement("span");
      label.className = "value-item-label";
      label.textContent = options.getLabel(row);
      copy.appendChild(label);

      const meta = document.createElement("span");
      meta.className = "value-item-meta";
      meta.textContent = options.getMeta(row);
      copy.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "value-item-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "mini-button";
      editButton.textContent = "訂正";
      editButton.addEventListener("click", function () {
        options.onEdit(row);
      });
      actions.appendChild(editButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "mini-button danger value-delete-button";
      deleteButton.textContent = "削除";
      deleteButton.addEventListener("click", function () {
        options.onDelete(row);
      });
      actions.appendChild(deleteButton);

      item.appendChild(copy);
      item.appendChild(actions);
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
    elements.saveVehiclesButton.disabled = disabledCloud || !state.shared.vehicleProfiles.length;
    elements.saveDriversButton.disabled = disabledCloud || !state.shared.userProfiles.length;
    elements.restoreVehiclesButton.disabled = disabledCloud || !state.backupMeta.vehicles;
    elements.restoreDriversButton.disabled = disabledCloud || !state.backupMeta.drivers;
    elements.deleteVehiclesButton.disabled = state.working || !state.shared.vehicleProfiles.length;
    elements.deleteDriversButton.disabled = state.working || !state.shared.userProfiles.length;
  }

  function getEditingVehicleProfile() {
    if (!state.editing.vehicleNumber) {
      return null;
    }
    return state.shared.vehicleProfiles.find(function (profile) {
      return profile.vehicleNumber === state.editing.vehicleNumber;
    }) || null;
  }

  function getEditingUserProfile() {
    if (!state.editing.userKey) {
      return null;
    }
    return state.shared.userProfiles.find(function (profile) {
      return sharedSettings.buildUserProfileKey(profile) === state.editing.userKey;
    }) || null;
  }

  function startVehicleEdit(profile) {
    state.editing.vehicleNumber = profile.vehicleNumber;
    render();
    setGlobalStatus("車両設定を訂正モードで開きました。");
  }

  function cancelVehicleEdit() {
    state.editing.vehicleNumber = "";
    render();
    setGlobalStatus("車両設定の訂正をキャンセルしました。");
  }

  function startDriverEdit(profile) {
    state.editing.userKey = sharedSettings.buildUserProfileKey(profile);
    render();
    setGlobalStatus("運転者設定を訂正モードで開きました。");
  }

  function cancelDriverEdit() {
    state.editing.userKey = "";
    render();
    setGlobalStatus("運転者設定の訂正をキャンセルしました。");
  }

  function addOrUpdateVehicle() {
    const vehicleNumber = sharedSettings.normalizeVehicleNumber(elements.vehicleInput.value);
    const truckType = sharedSettings.normalizeTruckType(elements.vehicleTruckTypeInput.value);
    const editingProfile = getEditingVehicleProfile();
    if (!vehicleNumber) {
      setGlobalStatus("車両番号を入力してください。", true);
      return;
    }

    const duplicate = state.shared.vehicleProfiles.find(function (profile) {
      return profile.vehicleNumber === vehicleNumber
        && (!editingProfile || profile.vehicleNumber !== editingProfile.vehicleNumber);
    });
    if (duplicate) {
      setGlobalStatus("その車両番号は既に登録されています。", true);
      return;
    }

    const nextProfiles = state.shared.vehicleProfiles.filter(function (profile) {
      return !editingProfile || profile.vehicleNumber !== editingProfile.vehicleNumber;
    });
    nextProfiles.push({ vehicleNumber: vehicleNumber, truckType: truckType });
    sharedSettings.saveVehicleProfiles(nextProfiles);
    state.editing.vehicleNumber = "";
    render();
    setGlobalStatus(editingProfile ? "車両設定を訂正しました。" : "車両設定を追加しました。");
  }

  function addOrUpdateDriver() {
    const loginId = sharedSettings.normalizeLoginId(elements.driverLoginIdInput.value);
    const driverName = sharedSettings.normalizeDriverName(elements.driverNameInput.value);
    const driverReading = sharedSettings.normalizeDriverReading(elements.driverReadingInput.value);
    const vehicleNumber = sharedSettings.normalizeVehicleNumber(elements.driverVehicleSelect.value);
    const editingProfile = getEditingUserProfile();

    if (!loginId) {
      setGlobalStatus("ログインIDを入力してください。", true);
      return;
    }
    if (!driverName) {
      setGlobalStatus("運転者名を入力してください。", true);
      return;
    }
    if (!driverReading) {
      setGlobalStatus("読みを入力してください。", true);
      return;
    }
    const duplicate = state.shared.userProfiles.find(function (profile) {
      return profile.loginId === loginId
        && (!editingProfile || sharedSettings.buildUserProfileKey(profile) !== sharedSettings.buildUserProfileKey(editingProfile));
    });
    if (duplicate) {
      setGlobalStatus("そのログインIDは既に登録されています。", true);
      return;
    }

    const nextProfiles = state.shared.userProfiles.filter(function (profile) {
      return !editingProfile || sharedSettings.buildUserProfileKey(profile) !== sharedSettings.buildUserProfileKey(editingProfile);
    });
    nextProfiles.push({
      loginId: loginId,
      driverName: driverName,
      driverReading: driverReading,
      vehicleNumber: vehicleNumber
    });
    sharedSettings.saveUserProfiles(nextProfiles);
    state.editing.userKey = "";
    render();
    setGlobalStatus(editingProfile ? "運転者設定を訂正しました。" : "運転者設定を追加しました。");
  }

  function removeVehicle(profile) {
    const referenceCount = state.shared.userProfiles.filter(function (userProfile) {
      return userProfile.vehicleNumber === profile.vehicleNumber;
    }).length;
    if (referenceCount > 0) {
      setGlobalStatus("この車両番号は運転者設定で使われているため削除できません。先に運転者設定を訂正してください。", true);
      return;
    }

    if (!window.confirm("車両番号「" + profile.vehicleNumber + "」を削除しますか？")) {
      return;
    }

    sharedSettings.saveVehicleProfiles(state.shared.vehicleProfiles.filter(function (entry) {
      return entry.vehicleNumber !== profile.vehicleNumber;
    }));
    if (state.editing.vehicleNumber === profile.vehicleNumber) {
      state.editing.vehicleNumber = "";
    }
    render();
    setGlobalStatus("車両設定を削除しました。");
  }

  function removeDriver(profile) {
    if (!window.confirm("運転者設定「" + profile.driverName + "」を削除しますか？")) {
      return;
    }

    sharedSettings.saveUserProfiles(state.shared.userProfiles.filter(function (entry) {
      return sharedSettings.buildUserProfileKey(entry) !== sharedSettings.buildUserProfileKey(profile);
    }));
    if (state.editing.userKey === sharedSettings.buildUserProfileKey(profile)) {
      state.editing.userKey = "";
    }
    render();
    setGlobalStatus("運転者設定を削除しました。");
  }

  function clearAllVehicles() {
    if (!state.shared.vehicleProfiles.length) {
      return;
    }

    if (state.shared.userProfiles.some(function (profile) { return Boolean(profile.vehicleNumber); })) {
      setGlobalStatus("既定車番に使われている車両設定があるため全件削除できません。先に運転者設定を訂正してください。", true);
      return;
    }

    if (!window.confirm("登録済みの車両設定をすべて削除しますか？\nFirebase バックアップは削除されません。")) {
      return;
    }

    sharedSettings.saveVehicleProfiles([]);
    state.editing.vehicleNumber = "";
    render();
    setGlobalStatus("登録済みの車両設定をすべて削除しました。Firebase バックアップは残っています。");
  }

  function clearAllDrivers() {
    if (!state.shared.userProfiles.length) {
      return;
    }

    if (!window.confirm("登録済みの運転者設定をすべて削除しますか？\nFirebase バックアップは削除されません。")) {
      return;
    }

    sharedSettings.saveUserProfiles([]);
    state.editing.userKey = "";
    render();
    setGlobalStatus("登録済みの運転者設定をすべて削除しました。Firebase バックアップは残っています。");
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

    return ensureDb(getRuntimeFirebaseConfig(window.APP_FIREBASE_CONFIG), window.APP_FIREBASE_SYNC_OPTIONS || {}, null);
  }

  async function ensureDirectoryDb() {
    if (!hasDirectorySyncTarget()) {
      return null;
    }

    const syncOptions = window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS || {};
    return ensureDb(
      getRuntimeFirebaseConfig(window.APP_FIREBASE_DIRECTORY_CONFIG),
      syncOptions,
      syncOptions.appName || "sinyuubuturyuu-directory"
    );
  }

  async function ensureDb(config, syncOptions, appName) {
    const app = getOrCreateFirebaseApp(config, appName);
    const auth = app.auth();
    connectCompatAuthEmulatorIfNeeded(auth);
    const authApi = window.DevFirebaseAuth;

    if (authApi && typeof authApi.ensureCompatUser === "function") {
      await authApi.ensureCompatUser(auth, { waitMs: 5000 });
    } else if (!auth.currentUser) {
      throw new Error("ログインしてください。");
    }

    const db = app.firestore();
    connectCompatFirestoreEmulatorIfNeeded(db);
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

  function normalizeBackupProfiles(definition, data, values) {
    const profileRows = Array.isArray(data && data[definition.profilesFieldName])
      ? data[definition.profilesFieldName]
      : values;

    if (definition.kind === "vehicles") {
      return sharedSettings.normalizeVehicleProfiles(profileRows);
    }

    return sharedSettings.normalizeUserProfiles(profileRows);
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

    return Object.keys(nestedSource).reduce(function (result, key) {
      if (result) {
        return result;
      }
      return Array.isArray(nestedSource[key]) ? nestedSource[key] : null;
    }, null);
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

        const data = snapshot.data() || {};
        const values = normalizeBackupValues(definition, data);
        const profiles = normalizeBackupProfiles(definition, data, values);
        if (!values.length && !profiles.length) {
          continue;
        }

        return {
          snapshot: snapshot,
          values: values,
          profiles: profiles,
          meta: buildBackupMeta(snapshot, definition, values, profiles)
        };
      } catch {
        continue;
      }
    }

    if (!fallbackSnapshot) {
      return null;
    }

    const fallbackData = fallbackSnapshot.data() || {};
    const fallbackValues = normalizeBackupValues(definition, fallbackData);
    const fallbackProfiles = normalizeBackupProfiles(definition, fallbackData, fallbackValues);
    return {
      snapshot: fallbackSnapshot,
      values: fallbackValues,
      profiles: fallbackProfiles,
      meta: buildBackupMeta(fallbackSnapshot, definition, fallbackValues, fallbackProfiles)
    };
  }

  function buildBackupMeta(snapshot, definition, normalizedValues, profiles) {
    const data = snapshot.data() || {};
    const values = Array.isArray(normalizedValues) ? normalizedValues : normalizeBackupValues(definition, data);
    const normalizedProfiles = Array.isArray(profiles) ? profiles : normalizeBackupProfiles(definition, data, values);
    return {
      valueCount: values.length || Number(data.valueCount || 0),
      profileCount: normalizedProfiles.length || Number(data.profileCount || 0),
      clientUpdatedAt: data.clientUpdatedAt || "",
      serverUpdatedAt: formatFirestoreDate(data.updatedAt)
    };
  }

  async function saveBackup(definition) {
    const values = definition.kind === "vehicles" ? state.shared.vehicles : state.shared.drivers;
    const profiles = definition.kind === "vehicles" ? state.shared.vehicleProfiles : state.shared.userProfiles;
    if (!profiles.length) {
      setGlobalStatus(definition.label + "の登録データがありません。", true);
      return;
    }

    state.working = true;
    render();

    try {
      const backupRef = await resolveBackupDocRef(definition);
      const source = state.directoryEnabled ? "integrated-settings-directory" : "integrated-settings";
      await backupRef.set(buildBackupPayload(definition, values, profiles, source));
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

  function buildBackupPayload(definition, values, profiles, source) {
    return {
      kind: definition.kind,
      slot: 1,
      values: values,
      valueCount: values.length,
      profileCount: profiles.length,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      source: source,
      [definition.profilesFieldName]: profiles
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
      if (!backup || !backup.snapshot || !backup.snapshot.exists || (!backup.values.length && !backup.profiles.length)) {
        setGlobalStatus(definition.label + "のバックアップはありません。", true);
        return;
      }

      if (definition.kind === "vehicles") {
        if (backup.profiles.length) {
          sharedSettings.saveVehicleProfiles(backup.profiles);
        } else {
          sharedSettings.saveVehicles(backup.values);
        }
      } else if (backup.profiles.length) {
        sharedSettings.saveUserProfiles(backup.profiles);
      } else {
        sharedSettings.saveDrivers(backup.values);
      }

      state.editing.vehicleNumber = "";
      state.editing.userKey = "";
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
