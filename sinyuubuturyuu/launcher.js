const APP_CONFIG = {
  app1Name: "月次タイヤ点検表",
  app1Path: "./getujitiretenkenhyou/index.html",
  app2Name: "月次日常点検表",
  app2Path: "./getujinitijyoutenkenhyou/index.html",
};

const MONTHLY_COMPLETE_IMAGE_SRC = "./getujitiretenkenhyou/icons/monthly-complete.png";
const REFERENCE_FIREBASE_CONFIG = Object.freeze(getRuntimeFirebaseConfig(window.APP_FIREBASE_DIRECTORY_CONFIG || {
  apiKey: "",
  authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
  projectId: "sinyuubuturyuu-86aeb",
  storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
  messagingSenderId: "213947378677",
  appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
  measurementId: "G-F9VYGCTHEV",
}));
const REFERENCE_SOURCE_KIND = Object.freeze({
  VEHICLES: "vehicles",
  DRIVERS: "drivers",
});
const REFERENCE_SOURCE_CONFIG = Object.freeze({
  [REFERENCE_SOURCE_KIND.VEHICLES]: Object.freeze({
    collection: "syainmeibo",
    docId: "monthly_tire_company_settings_backup_vehicles_slot1",
    fieldNames: Object.freeze(["車両番号", "車番", "vehicles", "vehicleNumbers", "values"]),
    primaryFieldName: "車両番号",
    metaFieldName: "vehiclesMeta",
  }),
  [REFERENCE_SOURCE_KIND.DRIVERS]: Object.freeze({
    collection: "syainmeibo",
    docId: "monthly_tire_company_settings_backup_drivers_slot1",
    fieldNames: Object.freeze(["乗務員名", "乗務員", "drivers", "driverNames", "values"]),
    primaryFieldName: "乗務員名",
    metaFieldName: "driversMeta",
  }),
});
const MONTHLY_COMPLETE_IMAGE_ALT = "Monthly inspection complete.";
const DAILY_INSPECTION_COMPLETE_IMAGE_SRC = "./getujinitijyoutenkenhyou/icons/monthly-complete.png";
const DAILY_INSPECTION_COMPLETE_IMAGE_ALT = "Daily inspection complete for this month.";
const LAUNCH_RETRY_MESSAGE = "通信状態を確認して、もう一度タップしてください。";
const DAILY_INSPECTION_FIREBASE_CONFIG = Object.freeze(getRuntimeFirebaseConfig({
  apiKey: "",
  authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
  projectId: "sinyuubuturyuu-86aeb",
  storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
  messagingSenderId: "213947378677",
  appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
  measurementId: "G-F9VYGCTHEV",
}));
const DAILY_INSPECTION_APP_SETTINGS = Object.freeze({
  collectionName: "getujinitijyoutenkenhyou",
  useLocalFallbackWhenFirebaseIsMissing: true,
});
const DAILY_INSPECTION_STORAGE_NAMESPACE = "monthly_inspection_app_v1";
const DAILY_INSPECTION_MIN_SELECTABLE_MONTH = "2025-10";
const DAILY_INSPECTION_MAX_SELECTABLE_MONTH_COUNT = 4;
const DAILY_INSPECTION_FIREBASE_REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"];
const DAILY_INSPECTION_CHECK_SEQUENCE = ["", "レ", "×", "▲"];
const DAILY_INSPECTION_HOLIDAY_CHECK = "休";
const DAILY_INSPECTION_ITEM_IDS = Object.freeze([
  "brake_pedal",
  "brake_fluid",
  "air_pressure",
  "exhaust_sound",
  "parking_brake",
  "tire_pressure",
  "tire_damage",
  "tire_tread",
  "wheel_nut",
  "battery_fluid",
  "coolant",
  "fan_belt",
  "engine_oil",
  "engine_start",
  "engine_response",
  "lights_status",
  "washer_fluid",
  "wiper_status",
  "air_tank_water",
  "documents",
  "emergency_tools",
  "report_changes",
]);
const sharedSettings = window.SharedLauncherSettings;

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
    ...(window.APP_FIREBASE_EMULATOR || {}),
  };
}

function connectAuthEmulatorIfNeeded(authModule, auth) {
  if (!shouldUseFirebaseEmulator() || !authModule || typeof authModule.connectAuthEmulator !== "function" || auth.__sinyuubuturyuuEmulatorConnected) {
    return;
  }

  authModule.connectAuthEmulator(auth, getFirebaseEmulatorRuntime().authUrl, { disableWarnings: true });
  auth.__sinyuubuturyuuEmulatorConnected = true;
}

function connectFirestoreEmulatorIfNeeded(firestoreModule, db) {
  if (!shouldUseFirebaseEmulator() || !firestoreModule || typeof firestoreModule.connectFirestoreEmulator !== "function" || db.__sinyuubuturyuuEmulatorConnected) {
    return;
  }

  const runtime = getFirebaseEmulatorRuntime();
  firestoreModule.connectFirestoreEmulator(db, runtime.firestoreHost, runtime.firestorePort);
  db.__sinyuubuturyuuEmulatorConnected = true;
}

const elements = {
  app1Button: document.getElementById("app1Button"),
  app2Button: document.getElementById("app2Button"),
  settingsButton: document.getElementById("settingsButton"),
  currentVehicleNumber: document.getElementById("currentVehicleNumber"),
  currentDriverName: document.getElementById("currentDriverName"),
  currentTruckType: document.getElementById("currentTruckType"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  confirmSettingsButton: document.getElementById("confirmSettingsButton"),
  themeMode: document.getElementById("themeMode"),
  vehicleSelect: document.getElementById("vehicleSelect"),
  driverAutoDisplay: document.getElementById("driverAutoDisplay"),
  truckTypeAutoDisplay: document.getElementById("truckTypeAutoDisplay"),
  truckTypeList: document.getElementById("truckTypeList"),
  settingsStatus: document.getElementById("settingsStatus"),
  launchStatus: document.getElementById("launchStatus"),
  sendFarewell: document.getElementById("sendFarewell"),
  sendFarewellImage: document.getElementById("sendFarewellImage"),
  authLoading: document.getElementById("authLoading"),
  loginPanel: document.getElementById("loginPanel"),
  launcherApp: document.getElementById("launcherApp"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  authStatus: document.getElementById("authStatus"),
  authUserEmail: document.getElementById("authUserEmail"),
  logoutButton: document.getElementById("logoutButton"),
};

function readSharedState() {
  if (!sharedSettings) {
    return null;
  }
  if (typeof sharedSettings.readState === "function") {
    return sharedSettings.readState();
  }
  if (typeof sharedSettings.ensureState === "function") {
    return sharedSettings.ensureState();
  }
  return null;
}

function waitFor(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

const state = {
  shared: readSharedState(),
  cloudReady: false,
  referenceOptions: {
    vehicles: [],
    vehicleProfiles: [],
    userProfiles: [],
    loading: false,
    loaded: false,
  },
  monthlyLaunchBusy: false,
  dailyLaunchBusy: false,
  auth: {
    ready: false,
    user: null,
    busy: false,
    returnTo: getRequestedReturnTo(),
    redirected: false,
  },
};
renderAll();
bindEvents();
registerServiceWorker();
void initializeAuth();

function refreshSharedState() {
  state.shared = readSharedState();
}

function renderAll() {
  refreshSharedState();
  applyTheme();
  renderAuth();
  renderLauncherButtons();
  renderCurrentSelection();
  renderSettings();
}

function renderAuth() {
  const user = state.auth.user;
  const ready = state.auth.ready;
  const busy = state.auth.busy;
  const pending = !ready && !user;

  document.body.classList.toggle("auth-pending", pending);
  elements.authLoading.hidden = true;
  elements.loginPanel.hidden = !ready || Boolean(user);
  elements.launcherApp.hidden = !ready || !user;
  elements.loginButton.disabled = busy || !ready;
  elements.loginEmail.disabled = busy || !ready;
  elements.loginPassword.disabled = busy || !ready;
  elements.logoutButton.disabled = busy || !user;
  elements.authUserEmail.textContent = user && user.email ? user.email : "";

  if (!ready) {
    setAuthStatus("");
  }
}

function setAuthStatus(message, isError = false) {
  elements.authStatus.textContent = message || "";
  elements.authStatus.classList.toggle("error", Boolean(isError));
}

function getRequestedReturnTo() {
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("returnTo") || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const resolved = new URL(raw, window.location.href);
    const launcherRoot = new URL("./", window.location.href);
    if (resolved.origin !== window.location.origin) {
      return "";
    }
    if (!resolved.pathname.startsWith(launcherRoot.pathname)) {
      return "";
    }
    return resolved.href;
  } catch {
    return "";
  }
}

async function redirectToReturnTarget() {
  if (!state.auth.user || !state.auth.returnTo || state.auth.redirected) {
    return;
  }

  state.auth.redirected = true;
  window.location.replace(state.auth.returnTo);
}

async function initializeAuth() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.onChange !== "function") {
    state.auth.ready = true;
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    renderAll();
    return;
  }

  try {
    if (typeof authApi.ensureRuntime === "function") {
      const runtime = await authApi.ensureRuntime();
      const immediateUser = runtime && runtime.auth ? (runtime.auth.currentUser || null) : null;
      if (immediateUser) {
        state.auth.ready = true;
        state.auth.user = immediateUser;
        state.auth.busy = false;
        setAuthStatus("");
        await applyLoginAssignmentForUser(immediateUser);
      }
    }

    await authApi.onChange(async (user) => {
      state.auth.ready = true;
      state.auth.user = user || null;
      state.auth.busy = false;

      if (!user && elements.settingsDialog.open) {
        closeSettingsDialog();
      }

      if (user) {
        setAuthStatus("");
        await applyLoginAssignmentForUser(user);
        if (!state.cloudReady) {
          await initializeCloudSync();
        }
        await redirectToReturnTarget();
        return;
      }

      state.cloudReady = false;
      renderAll();
    });
  } catch (error) {
    state.auth.ready = true;
    state.auth.busy = false;
    setAuthStatus(`認証の初期化に失敗しました: ${error.message}`, true);
    renderAll();
  }
}

async function handleLoginSubmit() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.signIn !== "function") {
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    return;
  }

  const email = String(elements.loginEmail.value || "").trim();
  const password = String(elements.loginPassword.value || "");
  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。", true);
    return;
  }

  state.auth.busy = true;
  setAuthStatus("ログインしています。", false);
  renderAll();

  try {
    await authApi.signIn(email, password);
    elements.loginPassword.value = "";
  } catch (error) {
    state.auth.busy = false;
    setAuthStatus(`ログインに失敗しました: ${error.message}`, true);
    renderAll();
  }
}

async function handleLogout() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.signOut !== "function") {
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    return;
  }

  state.auth.busy = true;
  setAuthStatus("ログアウトしています。", false);
  renderAll();

  try {
    await authApi.signOut();
  } catch (error) {
    state.auth.busy = false;
    setAuthStatus(`ログアウトに失敗しました: ${error.message}`, true);
    renderAll();
  }
}

async function requireSignedInUser() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.getCurrentUser !== "function") {
    throw new Error("認証モジュールを読み込めませんでした。");
  }

  const user = await authApi.getCurrentUser();
  if (!user) {
    throw new Error("ログインしてください。");
  }
  return user;
}

async function applyLoginAssignmentForUser(user, options = {}) {
  const loginId = sharedSettings.normalizeLoginId(user && user.email);
  if (!loginId) {
    return readSharedState();
  }

  if (options.refresh !== false || !state.referenceOptions.loaded) {
    await refreshReferenceOptions();
  }

  const nextState = sharedSettings.applyLoginAssignment(loginId, {
    preserveVehicleSelection: true
  });
  state.referenceOptions.vehicles = nextState.vehicles;
  state.referenceOptions.vehicleProfiles = nextState.vehicleProfiles;
  state.referenceOptions.userProfiles = nextState.userProfiles;
  state.referenceOptions.loaded = true;
  renderAll();

  const userProfile = sharedSettings.getUserProfileByLoginId(loginId, nextState);
  if (!userProfile) {
    setStatus("このログインIDに紐づく乗務員設定がありません。パソコン用の設定で登録してください。");
  }

  return nextState;
}

async function stabilizeLauncherSelection(user, options = {}) {
  const attemptCount = options.attemptCount || 4;
  const waitMs = options.waitMs || 250;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const nextState = await applyLoginAssignmentForUser(user, {
      refresh: attempt === 0 || options.refresh !== false
    });
    state.shared = nextState || readSharedState();
    if (hasMonthlySelectionTarget()) {
      return state.shared;
    }
    if (attempt < attemptCount - 1) {
      await waitFor(waitMs);
    }
  }

  return state.shared;
}

function renderLauncherButtons() {
  elements.app1Button.textContent = APP_CONFIG.app1Name;
  elements.app2Button.textContent = APP_CONFIG.app2Name;
}

function renderCurrentSelection() {
  const current = state.shared.current || {};
  elements.currentVehicleNumber.textContent = String(current.vehicleNumber || "").trim() || "未選択";
  elements.currentDriverName.textContent = String(current.driverName || "").trim() || "未選択";
  elements.currentTruckType.textContent = current.truckType
    ? sharedSettings.truckTypeLabel(current.truckType)
    : "未選択";
}

function renderSettings() {
  elements.themeMode.value = state.shared.theme;
  renderVehicleSelect();
  renderAssignedProfile();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.shared.theme === "dark" ? "dark" : "light");
}

function renderVehicleSelect() {
  renderChoiceSelect({
    select: elements.vehicleSelect,
    rows: getDisplayedVehicleRows(),
    currentValue: state.shared.current.vehicleNumber,
    labelFor: (value) => value,
    placeholderText: "車番を選択",
    loadingText: "読み込み中です。",
    emptyText: "登録された車両番号はありません。",
  });

}

function renderAssignedProfile() {
  if (elements.driverAutoDisplay) {
    elements.driverAutoDisplay.textContent = String(state.shared.current.driverName || "").trim() || "未選択";
  }
  if (elements.truckTypeAutoDisplay) {
    elements.truckTypeAutoDisplay.textContent = state.shared.current.truckType
      ? sharedSettings.truckTypeLabel(state.shared.current.truckType)
      : "未選択";
  }
}

function getDisplayedVehicleRows() {
  const rows = [...state.referenceOptions.vehicles];
  const currentValue = String(state.shared.current.vehicleNumber || "").trim();
  if (currentValue && !rows.includes(currentValue)) {
    rows.unshift(currentValue);
  }
  return rows;
}

function renderChoiceSelect({
  select,
  rows,
  currentValue,
  labelFor,
  placeholderText = "",
  loadingText = "読み込み中です。",
  emptyText = "項目はありません。",
  currentKeyFor = (value) => value,
}) {
  select.innerHTML = "";

  if (state.referenceOptions.loading) {
    select.appendChild(new Option(loadingText, ""));
    select.value = "";
    select.disabled = true;
    return;
  }

  const uniqueRows = [];
  const seenKeys = new Set();
  rows.forEach((value) => {
    const key = String(currentKeyFor(value) ?? "");
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    uniqueRows.push(value);
  });

  if (!uniqueRows.length) {
    select.appendChild(new Option(emptyText, ""));
    select.value = "";
    select.disabled = true;
    return;
  }

  if (placeholderText) {
    select.appendChild(new Option(placeholderText, ""));
  }

  uniqueRows.forEach((value) => {
    select.appendChild(new Option(labelFor(value), value));
  });

  const selectedRow = uniqueRows.find((value) => currentKeyFor(value) === currentValue);
  select.value = selectedRow || "";
  select.disabled = false;
}

function renderValueList({
  container,
  rows,
  currentValue,
  labelFor,
  onSelect,
  emptyText = "項目はありません。",
  currentKeyFor = (value) => value,
}) {
  container.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  [...new Set(rows)].forEach((value) => {
    const row = document.createElement("div");
    const isCurrent = currentKeyFor(value) === currentValue;
    row.className = `value-item${isCurrent ? " current" : ""}`;

    const label = document.createElement("span");
    label.className = "value-label";
    label.textContent = labelFor(value);

    const actions = document.createElement("div");
    actions.className = "value-actions";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "mini-button primary";
    selectButton.textContent = isCurrent ? "選択中" : "表示";
    selectButton.disabled = isCurrent;
    selectButton.addEventListener("click", () => onSelect(value));
    actions.appendChild(selectButton);
    row.appendChild(label);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function getStringArray(source, fieldName = "values") {
  if (!source || typeof source !== "object" || !Array.isArray(source[fieldName])) {
    return [];
  }
  return source[fieldName].map((value) => String(value ?? "").trim()).filter(Boolean);
}

function getStringArrayFromFieldNames(source, fieldNames = ["values"]) {
  for (const fieldName of fieldNames) {
    const values = getStringArray(source, fieldName);
    if (values.length) {
      return values;
    }
  }
  return [];
}

function getVehicleProfilesFromSource(source) {
  if (Array.isArray(source?.vehicleProfiles)) {
    return sharedSettings.normalizeVehicleProfiles(source.vehicleProfiles);
  }
  return sharedSettings.normalizeVehicleProfiles(getStringArrayFromFieldNames(source, ["values", "vehicles", "vehicleNumbers", "車両番号", "車番"]));
}

function getUserProfilesFromSource(source) {
  if (Array.isArray(source?.userProfiles)) {
    return sharedSettings.normalizeUserProfiles(source.userProfiles);
  }
  return sharedSettings.normalizeUserProfiles(getStringArrayFromFieldNames(source, ["values", "drivers", "driverNames", "乗務員名", "乗務員"]));
}

function getReferenceDocTarget(referenceKind) {
  const referenceConfig = REFERENCE_SOURCE_CONFIG[referenceKind];
  if (!referenceConfig) {
    return null;
  }

  return {
    collection: referenceConfig.collection,
    id: referenceConfig.docId,
  };
}

function sortReferenceRows(rows, labelFor = (value) => String(value || "")) {
  return [...rows].sort((left, right) => labelFor(left).localeCompare(labelFor(right), "ja"));
}

let referenceSettingsRuntimePromise = null;

async function getReferenceSettingsRuntime() {
  if (referenceSettingsRuntimePromise) {
    return referenceSettingsRuntimePromise;
  }

  referenceSettingsRuntimePromise = (async () => {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js"),
    ]);

    const app = typeof appModule.getApps === "function" && appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp(REFERENCE_FIREBASE_CONFIG);

    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);
    connectAuthEmulatorIfNeeded(authModule, auth);
    connectFirestoreEmulatorIfNeeded(firestoreModule, db);

    return {
      auth,
      authModule,
      db,
      firestoreModule,
    };
  })().catch((error) => {
    referenceSettingsRuntimePromise = null;
    throw error;
  });

  return referenceSettingsRuntimePromise;
}

async function ensureReferenceSettingsAuth(runtime) {
  await requireSignedInUser();
  if (runtime.auth.currentUser) {
    return runtime.auth.currentUser;
  }
  if (typeof runtime.auth.authStateReady === "function") {
    await runtime.auth.authStateReady();
  }
  if (runtime.auth.currentUser) {
    return runtime.auth.currentUser;
  }
  throw new Error("ログイン状態を確認できませんでした。");
}

async function loadSyainmeiboReferenceOptions(runtime) {
  const { db, firestoreModule } = runtime;
  const vehicleConfig = REFERENCE_SOURCE_CONFIG[REFERENCE_SOURCE_KIND.VEHICLES];
  const driverConfig = REFERENCE_SOURCE_CONFIG[REFERENCE_SOURCE_KIND.DRIVERS];
  const [vehicleSnapshot, driverSnapshot] = await Promise.all([
    firestoreModule.getDoc(
      firestoreModule.doc(db, vehicleConfig.collection, vehicleConfig.docId)
    ),
    firestoreModule.getDoc(
      firestoreModule.doc(db, driverConfig.collection, driverConfig.docId)
    ),
  ]);

  return {
    vehicleProfiles: vehicleSnapshot.exists()
      ? getVehicleProfilesFromSource(vehicleSnapshot.data() || {})
      : [],
    userProfiles: driverSnapshot.exists()
      ? getUserProfilesFromSource(driverSnapshot.data() || {})
      : [],
  };
}

async function saveReferenceValuesToDoc(runtime, targetDoc, referenceKind, values) {
  const referenceConfig = REFERENCE_SOURCE_CONFIG[referenceKind];
  if (!referenceConfig) {
    throw new Error(`Unknown reference kind: ${referenceKind}`);
  }

  const normalizedValues = referenceKind === REFERENCE_SOURCE_KIND.DRIVERS
    ? sharedSettings.normalizeDrivers(values)
    : [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
  const { db, firestoreModule } = runtime;
  const nowIso = new Date().toISOString();
  await firestoreModule.setDoc(
    firestoreModule.doc(db, targetDoc.collection, targetDoc.id),
    {
      values: normalizedValues,
      [referenceConfig.primaryFieldName]: normalizedValues,
      [referenceConfig.metaFieldName]: {
        valueCount: normalizedValues.length,
        clientUpdatedAt: nowIso,
        updatedAt: firestoreModule.serverTimestamp(),
        source: "launcher-settings",
      },
      updatedAt: firestoreModule.serverTimestamp(),
    },
    { merge: true }
  );
  return normalizedValues;
}

async function saveSyainmeiboReferenceValues(runtime, referenceKind, values) {
  const targetDoc = getReferenceDocTarget(referenceKind);
  if (!targetDoc) {
    throw new Error(`Unknown reference kind: ${referenceKind}`);
  }
  return saveReferenceValuesToDoc(runtime, targetDoc, referenceKind, values);
}

async function loadReferenceOptionsFromFirebase() {
  const runtime = await getReferenceSettingsRuntime();
  await ensureReferenceSettingsAuth(runtime);
  const syainmeiboOptions = await loadSyainmeiboReferenceOptions(runtime);

  return {
    vehicleProfiles: syainmeiboOptions.vehicleProfiles,
    userProfiles: syainmeiboOptions.userProfiles,
  };
}

async function saveReferenceValues(referenceKind, values) {
  const runtime = await getReferenceSettingsRuntime();
  await ensureReferenceSettingsAuth(runtime);
  const referenceConfig = REFERENCE_SOURCE_CONFIG[referenceKind];
  if (!referenceConfig) {
    throw new Error(`Unknown reference kind: ${referenceKind}`);
  }
  const normalizedValues = referenceKind === REFERENCE_SOURCE_KIND.DRIVERS
    ? sharedSettings.normalizeDrivers(values)
    : [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];

  await saveSyainmeiboReferenceValues(runtime, referenceKind, normalizedValues);

  return normalizedValues;
}

async function refreshReferenceOptions() {
  state.referenceOptions.loading = true;
  renderSettings();

  try {
    const referenceOptions = await loadReferenceOptionsFromFirebase();
    const currentState = readSharedState();
    const nextVehicleProfiles = referenceOptions.vehicleProfiles.length ? referenceOptions.vehicleProfiles : currentState.vehicleProfiles;
    const nextUserProfiles = referenceOptions.userProfiles.length ? referenceOptions.userProfiles : currentState.userProfiles;
    const nextState = sharedSettings.saveReferenceProfiles({
      vehicleProfiles: nextVehicleProfiles,
      userProfiles: nextUserProfiles,
    });

    state.referenceOptions = {
      vehicles: nextState.vehicles,
      vehicleProfiles: nextState.vehicleProfiles,
      userProfiles: nextState.userProfiles,
      loading: false,
      loaded: true,
    };
    renderSettings();
  } catch (error) {
    const currentState = readSharedState();
    state.referenceOptions.loading = false;
    state.referenceOptions.vehicles = currentState.vehicles;
    state.referenceOptions.vehicleProfiles = currentState.vehicleProfiles;
    state.referenceOptions.userProfiles = currentState.userProfiles;
    renderSettings();
    console.warn("Failed to load vehicle/user profiles:", error);
    setStatus(`車両番号とログイン設定の読み込みに失敗しました: ${error.message}`);
  }
}
function bindEvents() {
  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLoginSubmit();
  });
  elements.logoutButton.addEventListener("click", () => {
    void handleLogout();
  });
  elements.app1Button.addEventListener("click", () => {
    void openMonthlyApp();
  });
  elements.app2Button.addEventListener("click", () => {
    void openDailyInspectionApp();
  });

  elements.settingsButton.addEventListener("click", () => {
    clearStatus();
    renderAll();
    elements.settingsDialog.showModal();
    void refreshReferenceOptions();
  });

  elements.closeSettingsButton.addEventListener("click", closeSettingsDialog);
  elements.confirmSettingsButton.addEventListener("click", closeSettingsDialog);
  elements.settingsForm.addEventListener("submit", (event) => event.preventDefault());

  elements.settingsDialog.addEventListener("click", (event) => {
    const rect = elements.settingsDialog.getBoundingClientRect();
    const isInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;

    if (!isInDialog) {
      closeSettingsDialog();
    }
  });

  elements.themeMode.addEventListener("change", (event) => {
    sharedSettings.saveTheme(event.target.value);
    renderAll();
    setStatus("表示モードを更新しました。");
  });
  if (elements.vehicleSelect) {
    elements.vehicleSelect.addEventListener("change", (event) => {
      const value = String(event.target.value || "").trim();
      if (!value) return;
      setCurrentVehicleNumber(value);
    });
  }
}
function resetSelectionInputsToPlaceholder() {
  if (elements.vehicleSelect && elements.vehicleSelect.options.length && elements.vehicleSelect.options[0].value === "") {
    elements.vehicleSelect.value = "";
  }
}

function closeSettingsDialog() {
  elements.settingsDialog.close();
}

function clearStatus() {
  elements.settingsStatus.textContent = "";
}

function setStatus(message) {
  elements.settingsStatus.textContent = message;
}

function clearLaunchStatus() {
  if (!elements.launchStatus) {
    return;
  }

  elements.launchStatus.textContent = "";
  elements.launchStatus.hidden = true;
}

function showLaunchStatus(message) {
  if (!elements.launchStatus) {
    return;
  }

  elements.launchStatus.textContent = message;
  elements.launchStatus.hidden = false;
}

function setCurrentVehicleNumber(value) {
  sharedSettings.updateCurrent({ vehicleNumber: value });
  renderAll();
  setStatus("車両番号を更新しました。車種は車番に合わせて自動更新しました。");
}

async function initializeCloudSync() {
  if (!window.FirebaseCloudSync || typeof window.FirebaseCloudSync.init !== "function") {
    return;
  }

  try {
    await requireSignedInUser();
    await window.FirebaseCloudSync.init({
      getPayload: buildCloudPayload,
    });
    state.cloudReady = typeof window.FirebaseCloudSync.isEnabled === "function"
      ? window.FirebaseCloudSync.isEnabled()
      : true;
  } catch (error) {
    console.warn("Failed to initialize Firebase cloud sync:", error);
    state.cloudReady = false;
  }

  renderAll();
}
function buildCloudPayload() {
  const current = state.shared.current;
  return {
    current: {
      inspectionDate: todayText(),
      driverName: current.driverName || "",
      vehicleNumber: current.vehicleNumber || "",
      truckType: current.truckType || sharedSettings.TRUCK_TYPES.LOW12,
    },
  };
}

function buildSelectableMonthKeys(date = new Date()) {
  const keys = [];
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  for (let currentMonth = month; currentMonth >= 1; currentMonth -= 1) {
    keys.push(`${year}-${String(currentMonth).padStart(2, "0")}`);
  }

  const previousYearMonthCount = Math.max(0, 4 - month);
  for (let offset = 0; offset < previousYearMonthCount; offset += 1) {
    keys.push(`${year - 1}-${String(12 - offset).padStart(2, "0")}`);
  }

  return keys;
}

function hasMonthlySelectionTarget() {
  const current = state.shared.current || {};
  return Boolean(
    String(current.driverName || "").trim()
    && String(current.vehicleNumber || "").trim()
    && String(current.truckType || "").trim()
    && state.shared.truckTypes.includes(current.truckType)
  );
}

function hideSendFarewell() {
  if (!elements.sendFarewell) {
    return;
  }

  elements.sendFarewell.classList.remove("show");
  elements.sendFarewell.setAttribute("aria-hidden", "true");
}

async function showSendFarewell(options = {}) {
  if (!elements.sendFarewell) {
    return;
  }

  const image = elements.sendFarewellImage;
  if (image) {
    if (options.src) image.src = options.src;
    if (options.alt) image.alt = options.alt;
  }

  elements.sendFarewell.classList.add("show");
  elements.sendFarewell.setAttribute("aria-hidden", "false");

  if (image && !image.complete) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      };

      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, 1200);
    });
  }

  await new Promise((resolve) => window.setTimeout(resolve, Number(options.durationMs) || 1800));
  hideSendFarewell();
}

function completeStatus(completed, reason) {
  return {
    ok: true,
    completed: Boolean(completed),
    reason,
  };
}

function completeStatusError(reason) {
  return {
    ok: false,
    completed: false,
    reason,
  };
}

async function checkMonthlyCompleteStatus() {
  refreshSharedState();

  if (!state.cloudReady) {
    return completeStatusError("firebase_unready");
  }

  if (!hasMonthlySelectionTarget()) {
    return completeStatusError("missing_selection");
  }

  if (!window.FirebaseCloudSync || typeof window.FirebaseCloudSync.listSubmittedMonthsForPayload !== "function") {
    return completeStatusError("firebase_unready");
  }

  const lookupMonths = buildSelectableMonthKeys();
  if (!lookupMonths.length) {
    return completeStatusError("missing_selection");
  }

  let timeoutId = 0;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error("month_lookup_timeout"));
      }, 5000);
    });
    const result = await Promise.race([
      window.FirebaseCloudSync.listSubmittedMonthsForPayload(
        buildCloudPayload(),
        { monthKeys: lookupMonths }
      ),
      timeoutPromise,
    ]);

    if (!result || !result.ok) {
      return completeStatusError((result && result.reason) || "lookup_failed");
    }

    const submittedSet = new Set(Array.isArray(result.months) ? result.months : []);
    const completed = lookupMonths.every((monthKey) => submittedSet.has(monthKey));
    return completeStatus(completed, completed ? "complete" : "incomplete");
  } catch (error) {
    console.warn("Failed to check monthly inspection availability:", error);
    return completeStatusError(error && error.message === "month_lookup_timeout" ? "timeout" : "lookup_failed");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function openMonthlyApp() {
  if (state.monthlyLaunchBusy) {
    return;
  }

  state.monthlyLaunchBusy = true;
  elements.app1Button.disabled = true;

  try {
    clearLaunchStatus();
    const user = await requireSignedInUser();
    await stabilizeLauncherSelection(user, { refresh: true });
    const result = await checkMonthlyCompleteStatus();
    if (!result.ok) {
      showLaunchStatus(LAUNCH_RETRY_MESSAGE);
      return;
    }

    if (result.completed) {
      clearLaunchStatus();
      await showSendFarewell({
        src: MONTHLY_COMPLETE_IMAGE_SRC,
        alt: MONTHLY_COMPLETE_IMAGE_ALT,
      });
      return;
    }

    clearLaunchStatus();
    openApp(APP_CONFIG.app1Path);
  } catch (error) {
    console.warn("Failed to launch monthly inspection app:", error);
    showLaunchStatus(LAUNCH_RETRY_MESSAGE);
  } finally {
    state.monthlyLaunchBusy = false;
    elements.app1Button.disabled = false;
  }
}

function getCurrentYearMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compareYearMonth(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function parseYearMonth(yearMonth) {
  const [yearText, monthText] = String(yearMonth || "").split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
  };
}

function getDaysInMonth(yearMonth) {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(year, month, 0).getDate();
}

function addMonths(yearMonth, delta) {
  const { year, month } = parseYearMonth(yearMonth);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function getDailyInspectionLookupMonths() {
  const currentMonth = getCurrentYearMonth();
  if (compareYearMonth(currentMonth, DAILY_INSPECTION_MIN_SELECTABLE_MONTH) < 0) {
    return [currentMonth];
  }

  const lookupMonths = [];
  let cursor = getDailyInspectionSelectableMonthStart(currentMonth);

  while (compareYearMonth(cursor, currentMonth) <= 0) {
    lookupMonths.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return lookupMonths;
}

function getDailyInspectionSelectableMonthStart(currentMonth) {
  const rollingStart = addMonths(currentMonth, -(DAILY_INSPECTION_MAX_SELECTABLE_MONTH_COUNT - 1));
  return compareYearMonth(rollingStart, DAILY_INSPECTION_MIN_SELECTABLE_MONTH) < 0
    ? DAILY_INSPECTION_MIN_SELECTABLE_MONTH
    : rollingStart;
}

function normalizeDailyInspectionChecksByDay(checksByDay) {
  return Object.entries(checksByDay || {}).reduce((result, [day, values]) => {
    result[String(day)] = normalizeDailyInspectionDayChecks(values || {});
    return result;
  }, {});
}

function normalizeDailyInspectionDayChecks(values) {
  const normalized = {};
  DAILY_INSPECTION_ITEM_IDS.forEach((itemId) => {
    const rawValue = values[itemId];
    const value = rawValue === "☓" ? "×" : rawValue;
    normalized[itemId] = DAILY_INSPECTION_CHECK_SEQUENCE.includes(value) ? value : "";
  });
  return normalized;
}

function collectDailyInspectionLegacyHolidayDays(checksByDay) {
  return Object.entries(checksByDay || {})
    .filter(([, values]) => {
      const rows = DAILY_INSPECTION_ITEM_IDS.map((itemId) => values?.[itemId] || "");
      return rows.length > 0 && rows.every((value) => value === DAILY_INSPECTION_HOLIDAY_CHECK);
    })
    .map(([day]) => Number(day));
}

function normalizeDailyInspectionHolidayDays(holidayDays, month) {
  const lastDay = getDaysInMonth(month);
  return [...new Set((holidayDays || [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= lastDay))]
    .sort((left, right) => left - right);
}

function normalizeDailyInspectionRecord(record) {
  const month = record.month || getCurrentYearMonth();
  const legacyHolidayDays = collectDailyInspectionLegacyHolidayDays(record.checksByDay || {});
  const holidayDays = normalizeDailyInspectionHolidayDays([...(record.holidayDays || []), ...legacyHolidayDays], month);
  const checksByDay = normalizeDailyInspectionChecksByDay(record.checksByDay || {});

  holidayDays.forEach((day) => {
    delete checksByDay[String(day)];
  });

  return {
    month,
    vehicle: record.vehicle || "",
    driver: record.driver || "",
    checksByDay,
    holidayDays,
    _meta: record._meta || {},
  };
}

function isDailyInspectionDayComplete(values) {
  return Object.values(normalizeDailyInspectionDayChecks(values || {})).every((value) => value !== "");
}

function toEpochMillis(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  if (typeof value.toMillis === "function") {
    try {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    } catch {
      return 0;
    }
  }
  if (typeof value.toDate === "function") {
    try {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function shouldReplaceDailyInspectionMonthRecord(currentRecord, nextRecord) {
  const currentUpdatedAt = Number(currentRecord?._meta?.updatedAtMs || 0);
  const nextUpdatedAt = Number(nextRecord?._meta?.updatedAtMs || 0);
  if (nextUpdatedAt !== currentUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt;
  }

  const currentDocId = String(currentRecord?._meta?.docId || "");
  const nextDocId = String(nextRecord?._meta?.docId || "");
  return nextDocId.localeCompare(currentDocId) > 0;
}

function normalizeDriverWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeVehicleKey(value) {
  if (sharedSettings && typeof sharedSettings.normalizeVehicleNumber === "function") {
    return sharedSettings.normalizeVehicleNumber(value);
  }
  return String(value ?? "").trim().normalize("NFKC").replace(/\s+/g, "");
}

function stripDriverReading(value) {
  return normalizeDriverWhitespace(value)
    .replace(/\s*[（(][^）)]*[）)]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDriverLookupKey(value) {
  return stripDriverReading(value)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function matchesVehicleRecord(record, vehicle) {
  const targetKey = normalizeVehicleKey(vehicle);
  if (!targetKey) {
    return false;
  }

  const candidateKeys = new Set(
    [
      record?.vehicle,
      record?.vehicleRaw,
      record?.vehicleDisplay,
      ...(Array.isArray(record?.vehicleAliases) ? record.vehicleAliases : []),
    ]
      .map((value) => normalizeVehicleKey(value))
      .filter(Boolean)
  );

  const normalizedVehicle = String(record?.vehicleNormalized || "").trim();
  if (normalizedVehicle) {
    candidateKeys.add(normalizedVehicle);
  }

  return candidateKeys.has(targetKey);
}

function matchesDriverRecord(record, driver) {
  const targetKey = normalizeDriverLookupKey(driver);
  if (!targetKey) {
    return false;
  }

  const candidateKeys = new Set(
    [
      record?.driver,
      record?.driverRaw,
      record?.driverDisplay,
      ...(Array.isArray(record?.driverAliases) ? record.driverAliases : []),
    ]
      .map((value) => normalizeDriverLookupKey(value))
      .filter(Boolean)
  );

  const normalizedDriver = String(record?.driverNormalized || "").trim();
  if (normalizedDriver) {
    candidateKeys.add(normalizedDriver);
  }

  return candidateKeys.has(targetKey);
}

function readDailyInspectionLocalStoreRecords(vehicle, driver) {
  try {
    const store = JSON.parse(localStorage.getItem(DAILY_INSPECTION_STORAGE_NAMESPACE) || "{\"records\":{}}");
    return Object.values(store.records || {})
      .filter((record) => matchesVehicleRecord(record, vehicle))
      .filter((record) => matchesDriverRecord(record, driver))
      .map((record) => normalizeDailyInspectionRecord(record));
  } catch {
    return [];
  }
}

function hasDailyInspectionFirebaseConfig(firebaseConfig) {
  return DAILY_INSPECTION_FIREBASE_REQUIRED_KEYS.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.trim() && !value.includes("YOUR_");
  });
}

async function listDailyInspectionRecords(vehicle, driver) {
  const runtime = {
    firebaseConfig: DAILY_INSPECTION_FIREBASE_CONFIG,
    appSettings: DAILY_INSPECTION_APP_SETTINGS,
  };

  if (!hasDailyInspectionFirebaseConfig(runtime.firebaseConfig)) {
    return readDailyInspectionLocalStoreRecords(vehicle, driver);
  }

  await requireSignedInUser();

  const [{ getApp, getApps, initializeApp }, authModule, firestoreModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js"),
  ]);

  const app = typeof getApps === "function" && getApps().length
    ? getApp()
    : initializeApp(runtime.firebaseConfig);
  const auth = authModule.getAuth(app);
  connectAuthEmulatorIfNeeded(authModule, auth);
  if (!auth.currentUser && typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  if (!auth.currentUser) {
    throw new Error("ログインしてください。");
  }
  const db = firestoreModule.getFirestore(app);
  connectFirestoreEmulatorIfNeeded(firestoreModule, db);
  const collectionName = String(runtime.appSettings.collectionName || "getujinitijyoutenkenhyou");
  const ref = firestoreModule.collection(db, collectionName);
  const queries = [
    firestoreModule.query(ref, firestoreModule.where("vehicleNormalized", "==", normalizeVehicleKey(vehicle))),
    firestoreModule.query(ref, firestoreModule.where("vehicle", "==", vehicle)),
  ];
  const snapshots = await Promise.all(queries.map((currentQuery) => firestoreModule.getDocs(currentQuery)));
  const docs = [];
  const seenDocIds = new Set();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((snapshotDoc) => {
      if (seenDocIds.has(snapshotDoc.id)) return;
      seenDocIds.add(snapshotDoc.id);
      docs.push(snapshotDoc);
    });
  });

  return docs
    .filter((snapshotDoc) => matchesVehicleRecord(snapshotDoc.data(), vehicle))
    .filter((snapshotDoc) => matchesDriverRecord(snapshotDoc.data(), driver))
    .map((snapshotDoc) => normalizeDailyInspectionRecord({
      ...snapshotDoc.data(),
      _meta: {
        docId: snapshotDoc.id,
        updatedAtMs: toEpochMillis(snapshotDoc.data().updatedAt),
      },
    }));
}

function getDailyInspectionPendingDays(month, record) {
  const currentMonth = getCurrentYearMonth();
  if (compareYearMonth(month, DAILY_INSPECTION_MIN_SELECTABLE_MONTH) < 0) {
    return [];
  }
  const comparison = compareYearMonth(month, currentMonth);
  if (comparison > 0) {
    return [];
  }

  const safeRecord = normalizeDailyInspectionRecord(record || {
    month,
    vehicle: "",
    driver: "",
    checksByDay: {},
    holidayDays: [],
  });
  const holidayDays = new Set((safeRecord.holidayDays || []).map((day) => String(day)));
  const recordedDays = new Set(
    Object.entries(safeRecord.checksByDay || {})
      .filter(([, values]) => isDailyInspectionDayComplete(values))
      .map(([day]) => String(day))
  );
  const lastDay = comparison === 0 ? new Date().getDate() : getDaysInMonth(month);
  const days = [];

  for (let day = 1; day <= lastDay; day += 1) {
    if (!recordedDays.has(String(day)) && !holidayDays.has(String(day))) {
      days.push(day);
    }
  }

  return days;
}

function isDailyInspectionCurrentDayComplete(record) {
  const currentMonth = getCurrentYearMonth();
  const today = String(new Date().getDate());
  const safeRecord = normalizeDailyInspectionRecord(record || {
    month: currentMonth,
    vehicle: "",
    driver: "",
    checksByDay: {},
    holidayDays: [],
  });

  if (String(safeRecord.month || "") !== currentMonth) {
    return false;
  }

  if ((safeRecord.holidayDays || []).some((day) => String(day) === today)) {
    return true;
  }

  return isDailyInspectionDayComplete((safeRecord.checksByDay || {})[today]);
}

async function checkDailyInspectionCompleteStatus() {
  refreshSharedState();

  const current = state.shared.current || {};
  const vehicle = String(current.vehicleNumber || "").trim();
  const driver = String(current.driverName || "").trim();
  if (!vehicle || !driver) {
    return completeStatusError("missing_selection");
  }

  const lookupMonths = getDailyInspectionLookupMonths();
  if (!lookupMonths.length) {
    return completeStatusError("missing_selection");
  }

  let timeoutId = 0;
  let records;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error("daily_inspection_lookup_timeout"));
      }, 5000);
    });
    records = await Promise.race([
      listDailyInspectionRecords(vehicle, driver),
      timeoutPromise,
    ]);
  } catch (error) {
    console.warn("Failed to check daily inspection availability:", error);
    return completeStatusError(error && error.message === "daily_inspection_lookup_timeout" ? "timeout" : "lookup_failed");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const recordsByMonth = (records || []).reduce((result, record) => {
    const monthKey = String(record.month || "");
    const existing = result[monthKey];
    if (!existing || shouldReplaceDailyInspectionMonthRecord(existing, record)) {
      result[monthKey] = record;
    }
    return result;
  }, {});

  const completed = lookupMonths.every((monthKey) => getDailyInspectionPendingDays(monthKey, recordsByMonth[monthKey]).length === 0);
  return completeStatus(completed, completed ? "complete" : "incomplete");
}

async function openDailyInspectionApp() {
  if (state.dailyLaunchBusy) {
    return;
  }

  state.dailyLaunchBusy = true;
  elements.app2Button.disabled = true;

  try {
    clearLaunchStatus();
    const user = await requireSignedInUser();
    await stabilizeLauncherSelection(user, { refresh: true });
    const result = await checkDailyInspectionCompleteStatus();
    if (!result.ok) {
      showLaunchStatus(LAUNCH_RETRY_MESSAGE);
      return;
    }

    if (result.completed) {
      clearLaunchStatus();
      await showSendFarewell({
        src: DAILY_INSPECTION_COMPLETE_IMAGE_SRC,
        alt: DAILY_INSPECTION_COMPLETE_IMAGE_ALT,
      });
      return;
    }

    clearLaunchStatus();
    openApp(APP_CONFIG.app2Path);
  } catch (error) {
    console.warn("Failed to launch daily inspection app:", error);
    showLaunchStatus(LAUNCH_RETRY_MESSAGE);
  } finally {
    state.dailyLaunchBusy = false;
    elements.app2Button.disabled = false;
  }
}

function todayText() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeMinute(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function openApp(path) {
  if (!path) {
    return;
  }
  window.location.href = path;
}

function canRegisterServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  if (!window.isSecureContext) {
    return false;
  }

  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function registerServiceWorker() {
  if (!canRegisterServiceWorker()) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        console.warn("Service worker registration failed.");
      });
  });
}




















