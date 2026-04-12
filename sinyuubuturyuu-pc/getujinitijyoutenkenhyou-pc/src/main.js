import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, updateCurrentUser } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const CHECK_STATES = ["", "レ", "☓", "▲"];
const HOLIDAY_MARK = "休";
const EXCEL_TEMPLATE_FILE_NAME = "月次日常点検 2026.xlsx";
const EXCEL_TEMPLATE_ASSET_FILE_NAME = "monthly-inspection-template.xlsx";
const EXCEL_TEMPLATE_API_PATH = "/api/excel-template";
const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_TEMPLATE_SHEET_NAME = "日常点検記録表原本";
const EXCEL_MONTH_SHEET_NAMES = {
  1: "日常点検記録表1月",
  2: "日常点検記録表2月",
  3: "日常点検記録表3月"
};
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const EXCEL_SHEET_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const EXCEL_RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const EXCEL_CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const EXCEL_DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const EXCEL_DRAWING_MAIN_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const EXCEL_DAY_COLUMNS = Array.from({ length: 31 }, (_, index) => columnNumberToLabel(index + 10));
const EXCEL_WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const EXCEL_HOLIDAY_FILL_RGB = "FFF7DDD5";
const EXCEL_CHECK_START_ROW = 7;
const EXCEL_BOTTOM_STAMP_ROW = 29;
const EXCEL_IMAGE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const EXCEL_DRAWING_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const EXCEL_PNG_CONTENT_TYPE = "image/png";
const EXCEL_EMUS_PER_PIXEL = 9525;
const EXCEL_BOTTOM_STAMP_ROW_SPAN = 2;
const EXCEL_STAMP_IMAGE_SIZES = {
  large: { width: 54, height: 54 },
  small: { width: 20, height: 20 }
};
const EXCEL_CUSTOM_STAMP_ASSETS = {
  "若本:small": new URL("./assets/wakamoto-stamp.svg", import.meta.url).href
};
let jsZipModulePromise = null;
const stampSvgMarkupPromiseCache = new Map();

const firebaseConfig = window.APP_FIREBASE_CONFIG || {
  apiKey: "AIzaSyBBvJndQmecQfaetdjs9Pb6Z1TDmoQMOGc",
  authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
  projectId: "sinyuubuturyuu-dev",
  storageBucket: "sinyuubuturyuu-dev.firebasestorage.app",
  messagingSenderId: "997788842966",
  appId: "1:997788842966:web:e011e7340e2af863c40277"
};

const referenceFirebaseConfig = {
  apiKey: "AIzaSyBBvJndQmecQfaetdjs9Pb6Z1TDmoQMOGc",
  authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
  projectId: "sinyuubuturyuu-dev",
  storageBucket: "sinyuubuturyuu-dev.firebasestorage.app",
  messagingSenderId: "997788842966",
  appId: "1:997788842966:web:e011e7340e2af863c40277"
};

const FIRESTORE_COLLECTION = "getujinitijyoutenkenhyou";
const VEHICLE_SETTINGS_DOC = {
  collection: "syainmeibo",
  id: "monthly_tire_company_settings_backup_vehicles_slot1"
};
const DRIVER_SETTINGS_DOC = {
  collection: "syainmeibo",
  id: "monthly_tire_company_settings_backup_drivers_slot1"
};
const sharedSettings = window.SharedAppSettings || null;
const CHECK_FIELD_ORDER = [
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
  "report_changes"
];
const CHECK_FIELD_INDEX = Object.fromEntries(CHECK_FIELD_ORDER.map((fieldKey, index) => [fieldKey, index]));
const CSV_HEADER = ["recordType", "dayOrKey", "fieldKey", "value"];

const GROUPS = [
  {
    category: "1. ブレーキ",
    contents: ["踏みしろ、きき", "液量", "空気圧力の上り具合", "バルブからの排気音", "レバーの引きしろ"]
  },
  {
    category: "2. タイヤ",
    contents: ["空気圧", "亀裂・損傷・異常磨耗", "※溝の深さ", "ホイールナット・ボルト・スペア"]
  },
  { category: "3. バッテリー", contents: ["※液量"] },
  {
    category: "4. エンジン",
    contents: ["※冷却水の量", "※ファンベルトの張り具合・損傷", "※エンジンオイルの量", "※かかり具合、異音", "※低速、加速の状態"]
  },
  { category: "5. 燈火装置", contents: ["点灯・点滅具合、汚れ及び損傷"] },
  { category: "6. ワイパー", contents: ["※液量、噴射状態", "※ワイパー払拭状態"] },
  { category: "7. エアタンク", contents: ["エアタンクに凝水がない"] },
  {
    category: "8. その他",
    contents: ["検査証・保険証・記録簿の備付", "非常用信号具・工具類・停止表示板", "報告事項・変更事項"]
  }
];
const INSPECTION_ITEM_LABELS = GROUPS.flatMap((group) => group.contents);

const monthEl = document.getElementById("month");
const vehicleEl = document.getElementById("vehicle");
const driverEl = document.getElementById("driver");
const monthTextEl = document.getElementById("monthText");
const vehicleTextEl = document.getElementById("vehicleText");
const driverTextEl = document.getElementById("driverText");
const statusEl = document.getElementById("status");
const toolbarEl = document.getElementById("toolbar");
const monthTabsEl = document.getElementById("monthTabs");
const inspectionTableEl = document.getElementById("inspectionTable");
const datesRowEl = document.getElementById("datesRow");
const daysRowEl = document.getElementById("daysRow");
const bodyEl = document.getElementById("inspectionBody");
const maintenanceFooterRowEl = document.getElementById("maintenanceFooterRow");
const titleHeadEl = document.getElementById("titleHead");
const operationHeadEl = document.getElementById("operationHead");
const maintenanceHeadEl = document.getElementById("maintenanceHead");
const driverHeadEl = document.getElementById("driverHead");
const exportExcelBtnEl = document.getElementById("exportExcelBtn");
const exportCsvBtnEl = document.getElementById("exportCsvBtn");
const importCsvBtnEl = document.getElementById("importCsvBtn");
const helpBtnEl = document.getElementById("helpBtn");
const csvImportInputEl = document.getElementById("csvImportInput");
const maintenanceNoteModalEl = document.getElementById("maintenanceNoteModal");
const maintenanceNoteModalDayEl = document.getElementById("maintenanceNoteModalDay");
const maintenanceNoteModalItemsEl = document.getElementById("maintenanceNoteModalItems");
const maintenanceNoteInputEl = document.getElementById("maintenanceNoteInput");
const maintenanceNoteSaveBtnEl = document.getElementById("maintenanceNoteSaveBtn");
const maintenanceNoteCancelBtnEl = document.getElementById("maintenanceNoteCancelBtn");

const state = {
  checks: {},
  operationManager: "",
  maintenanceManager: "",
  maintenanceBottomByDay: {},
  maintenanceRecordsByDay: {},
  holidayDays: [],
  loadedDocId: null,
  activeMonthKey: formatMonthKey(Number(monthEl.value) || 2026, 4),
  activeFiscalYearStart: null,
  recordsByMonth: {},
  suppressMonthInputSync: false,
  vehicleOptions: [],
  driverOptions: [],
  driverStorageMap: {}
};
let maintenanceNoteDialogResolve = null;

function getSelectedFiscalYearStart() {
  const year = Number(monthEl.value);
  return Number.isInteger(year) && year > 2000 ? year : 2026;
}

function columnNumberToLabel(columnNumber) {
  let value = columnNumber;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function getReiwaYear(year) {
  return year >= 2019 ? year - 2018 : year;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const referenceApp = firebaseConfig.projectId === referenceFirebaseConfig.projectId ? app : initializeApp(referenceFirebaseConfig, "reference-app");
const referenceDb = getFirestore(referenceApp);
const referenceAuth = getAuth(referenceApp);

function normalizeOptionValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value) {
  return normalizeOptionValue(value).replace(/\s+/g, " ");
}

function normalizeVehicleValue(value) {
  if (sharedSettings && typeof sharedSettings.normalizeVehicleNumber === "function") {
    return sharedSettings.normalizeVehicleNumber(value);
  }
  return normalizeOptionValue(value).normalize("NFKC").replace(/\s+/g, "");
}

function normalizeDriverDisplayName(value) {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDriverDisplayName(value) {
  const raw = normalizeOptionValue(value);
  if (!raw) {
    return "";
  }

  const parenMatch = raw.match(/^(.*?)[\s　]*[（(]([^（）()]*)[）)][\s　]*$/);
  if (parenMatch) {
    return normalizeDriverDisplayName(parenMatch[1]);
  }

  const legacyMatch = raw.match(/^(.*?)\s*[・・]([^・・]+)[・・]\s*$/);
  if (legacyMatch) {
    return normalizeDriverDisplayName(legacyMatch[1]);
  }

  return normalizeDriverDisplayName(raw);
}

function extractDriverReading(value) {
  const raw = normalizeOptionValue(value);
  if (!raw) {
    return "";
  }

  const parenMatch = raw.match(/^(.*?)[\s　]*[（(]([^（）()]*)[）)][\s　]*$/);
  if (parenMatch) {
    return normalizeWhitespace(parenMatch[2]);
  }

  const legacyMatch = raw.match(/^(.*?)\s*[・・]([^・・]+)[・・]\s*$/);
  if (legacyMatch) {
    return normalizeWhitespace(legacyMatch[2]);
  }

  return "";
}

function stripDriverReading(value) {
  return normalizeWhitespace(value).replace(/\s*[（(].*?[）)]\s*/g, "").trim();
}

function parseDriverEntry(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return { name: "", reading: "" };
  }

  const match = raw.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (!match) {
    return { name: raw, reading: "" };
  }

  return {
    name: normalizeWhitespace(match[1]),
    reading: normalizeWhitespace(match[2])
  };
}

function toHiragana(value) {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .replace(/[\u30A1-\u30F6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .trim();
}

function normalizeDriverLookupKey(value) {
  return extractDriverDisplayName(value)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function rememberDriverStorageValue(value) {
  const rawValue = normalizeOptionValue(value);
  const normalizedKey = normalizeDriverLookupKey(rawValue);
  if (!normalizedKey) {
    return;
  }

  const existingValue = state.driverStorageMap[normalizedKey];
  const existingReading = extractDriverReading(existingValue);
  const nextReading = extractDriverReading(rawValue);
  const existingName = extractDriverDisplayName(existingValue);
  const nextName = extractDriverDisplayName(rawValue);
  if (!existingValue) {
    state.driverStorageMap[normalizedKey] = rawValue || nextName;
    return;
  }
  if (!existingReading && nextReading) {
    state.driverStorageMap[normalizedKey] = rawValue;
    return;
  }
  if (!/\s/.test(existingName) && /\s/.test(nextName)) {
    state.driverStorageMap[normalizedKey] = rawValue;
  }
}

function getSelectedDriverStorageValue(value = driverEl.value) {
  const normalizedKey = normalizeDriverLookupKey(value);
  if (!normalizedKey) {
    return "";
  }
  return state.driverStorageMap[normalizedKey] || extractDriverDisplayName(value);
}

function getDriverIdentity(value = driverEl.value) {
  const storageValue = getSelectedDriverStorageValue(value);
  const displayValue = extractDriverDisplayName(value || storageValue);
  const aliases = [...new Set([storageValue, displayValue].map((item) => normalizeOptionValue(item)).filter(Boolean))];
  return {
    storageValue,
    displayValue,
    aliases,
    normalizedKey: normalizeDriverLookupKey(storageValue || displayValue)
  };
}

function sortOptions(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "ja"));
}

function getDriverSortKey(value) {
  const lookupKey = normalizeDriverLookupKey(value);
  const rawValue = state.driverStorageMap[lookupKey] || value;
  return toHiragana(extractDriverReading(rawValue) || extractDriverDisplayName(rawValue));
}

function sortDriverOptions(values) {
  return [...values].sort((left, right) => {
    const leftKey = getDriverSortKey(left);
    const rightKey = getDriverSortKey(right);
    const keyCompare = leftKey.localeCompare(rightKey, "ja");
    if (keyCompare !== 0) {
      return keyCompare;
    }
    return extractDriverDisplayName(left).localeCompare(extractDriverDisplayName(right), "ja");
  });
}

function getStringArray(source, fieldName = "values") {
  if (!source || typeof source !== "object" || !Array.isArray(source[fieldName])) {
    return [];
  }
  return source[fieldName].map((value) => normalizeOptionValue(value)).filter(Boolean);
}

function getDriverEntriesFromProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    return [];
  }

  if (
    sharedSettings
    && typeof sharedSettings.normalizeUserProfiles === "function"
    && typeof sharedSettings.formatDriverProfileEntry === "function"
  ) {
    return sharedSettings
      .normalizeUserProfiles(profiles)
      .map((profile) => sharedSettings.formatDriverProfileEntry(profile))
      .map((value) => normalizeOptionValue(value))
      .filter(Boolean);
  }

  return profiles
    .map((profile) => normalizeOptionValue(profile?.driverName || profile?.name || profile?.driver || profile?.value))
    .filter(Boolean);
}

function getDriverSourceEntries(source) {
  if (!source || typeof source !== "object") {
    return [];
  }

  const profileEntries = getDriverEntriesFromProfiles(source.userProfiles);
  if (profileEntries.length) {
    return profileEntries;
  }

  return getStringArray(source);
}

function getLocalSharedOptions() {
  if (!sharedSettings || typeof sharedSettings.ensureState !== "function") {
    return {
      vehicles: [],
      rawDrivers: []
    };
  }

  const sharedState = sharedSettings.ensureState();
  return {
    vehicles: Array.isArray(sharedState.vehicles)
      ? sharedState.vehicles.map((value) => normalizeVehicleValue(value)).filter(Boolean)
      : [],
    rawDrivers: Array.isArray(sharedState.userProfiles) && sharedState.userProfiles.length
      ? getDriverEntriesFromProfiles(sharedState.userProfiles)
      : (Array.isArray(sharedState.drivers)
        ? sharedState.drivers.map((value) => normalizeOptionValue(value)).filter(Boolean)
        : [])
  };
}

function mergeUniqueOptions() {
  const merged = [];
  const seen = new Set();

  Array.from(arguments).forEach((values) => {
    (values || []).forEach((value) => {
      const normalizedValue = normalizeOptionValue(value);
      if (!normalizedValue || seen.has(normalizedValue)) {
        return;
      }
      seen.add(normalizedValue);
      merged.push(normalizedValue);
    });
  });

  return merged;
}

function mergeUniqueDriverOptions() {
  const merged = [];
  const seen = new Set();

  Array.from(arguments).forEach((values) => {
    (values || []).forEach((value) => {
      const displayValue = extractDriverDisplayName(value);
      const lookupKey = normalizeDriverLookupKey(value);
      if (!displayValue || !lookupKey) {
        return;
      }

      const existingIndex = seen.has(lookupKey)
        ? merged.findIndex((item) => normalizeDriverLookupKey(item) === lookupKey)
        : -1;
      if (existingIndex < 0) {
        seen.add(lookupKey);
        merged.push(displayValue);
        return;
      }

      const existingValue = merged[existingIndex];
      if (!/\s/.test(existingValue) && /\s/.test(displayValue)) {
        merged.splice(existingIndex, 1, displayValue);
      }
    });
  });

  return merged;
}

function buildReferenceDocPath(referenceDoc) {
  return `${referenceDoc.collection}/${referenceDoc.id}`;
}

async function ensureSignedInUser(targetAuth) {
  if (targetAuth.currentUser) {
    return targetAuth.currentUser;
  }
  if (typeof targetAuth.authStateReady === "function") {
    await targetAuth.authStateReady();
  }
  if (targetAuth.currentUser) {
    return targetAuth.currentUser;
  }

  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.getCurrentUser !== "function") {
    throw new Error("ログインしてください。");
  }

  const user = await authApi.getCurrentUser();
  if (!user) {
    throw new Error("ログインしてください。");
  }

  if (typeof updateCurrentUser === "function") {
    try {
      await updateCurrentUser(targetAuth, user);
    } catch (error) {
      console.warn("Failed to sync signed-in user to target auth:", error);
    }
  }

  return targetAuth.currentUser || user;
}

async function ensureReferenceAuth() {
  return ensureSignedInUser(referenceAuth);
}

async function ensureAppAuth() {
  return ensureSignedInUser(auth);
}

function setSelectOptions(selectEl, options, placeholder, selectedValue = "", normalizeValue = normalizeOptionValue) {
  const normalizedSelectedValue = normalizeValue(selectedValue);
  const optionMap = new Map();

  (options || []).forEach((option) => {
    const optionKey = normalizeValue(option);
    if (!optionKey) {
      return;
    }
    optionMap.set(optionKey, optionKey);
  });

  if (normalizedSelectedValue && !optionMap.has(normalizedSelectedValue)) {
    optionMap.set(normalizedSelectedValue, normalizedSelectedValue);
  }

  selectEl.innerHTML = "";
  const selectedOptionValue = normalizedSelectedValue ? optionMap.get(normalizedSelectedValue) || "" : "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  selectEl.append(placeholderOption);

  Array.from(optionMap.values()).forEach((optionValue) => {
    const optionEl = document.createElement("option");
    optionEl.value = optionValue;
    optionEl.textContent = optionValue;
    selectEl.append(optionEl);
  });

  selectEl.value = selectedOptionValue;
}

function ensureSelectValue(selectEl, value, normalizeValue = normalizeOptionValue) {
  const normalizedValue = normalizeValue(value);
  if (!normalizedValue) {
    selectEl.value = "";
    return;
  }

  const hasOption = Array.from(selectEl.options).some((option) => normalizeValue(option.value) === normalizedValue);
  if (!hasOption) {
    const optionEl = document.createElement("option");
    optionEl.value = normalizedValue;
    optionEl.textContent = normalizedValue;
    selectEl.append(optionEl);
  }

  selectEl.value = normalizedValue;
}

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function serializeCsv(rows) {
  return rows.map((row) => row.map((value) => escapeCsvValue(value)).join(",")).join("\r\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          value += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\r" || char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    value += char;
  }

  if (inQuotes) {
    throw new Error("CSVの引用符が閉じられていません");
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((cell) => cell !== ""));
}

async function loadReferenceOptions() {
  const selectedVehicle = normalizeVehicleValue(vehicleEl.value);
  const selectedDriver = normalizeDriverDisplayName(driverEl.value);
  const localOptions = getLocalSharedOptions();
  const localDrivers = localOptions.rawDrivers.map((value) => {
    rememberDriverStorageValue(value);
    return extractDriverDisplayName(value);
  });

  vehicleEl.disabled = true;
  driverEl.disabled = true;

  try {
    await ensureReferenceAuth();

    const [vehicleSnapshot, driverSnapshot] = await Promise.all([
      getDoc(doc(referenceDb, VEHICLE_SETTINGS_DOC.collection, VEHICLE_SETTINGS_DOC.id)),
      getDoc(doc(referenceDb, DRIVER_SETTINGS_DOC.collection, DRIVER_SETTINGS_DOC.id))
    ]);

    const vehicleDocExists = vehicleSnapshot.exists();
    const driverDocExists = driverSnapshot.exists();
    const vehicles = mergeUniqueOptions(
      localOptions.vehicles,
      vehicleDocExists ? getStringArray(vehicleSnapshot.data()).map((value) => normalizeVehicleValue(value)) : []
    );
    const rawDrivers = mergeUniqueOptions(
      localOptions.rawDrivers,
      driverDocExists ? getDriverSourceEntries(driverSnapshot.data()) : []
    );
    rawDrivers.forEach((value) => rememberDriverStorageValue(value));
    const drivers = mergeUniqueDriverOptions(
      localDrivers,
      rawDrivers
    );

    state.vehicleOptions = sortOptions(vehicles);
    state.driverOptions = sortDriverOptions(drivers);

    setSelectOptions(vehicleEl, state.vehicleOptions, "車番を選択", selectedVehicle, normalizeVehicleValue);
    setSelectOptions(driverEl, state.driverOptions, "運転者を選択", selectedDriver, normalizeDriverDisplayName);

    vehicleEl.disabled = false;
    driverEl.disabled = false;
    syncHeaderInfo();

    if ((!vehicleDocExists || !driverDocExists) && !localOptions.vehicles.length && !localOptions.rawDrivers.length) {
      setStatus(
        `候補設定ドキュメント未検出: project=${referenceFirebaseConfig.projectId} vehicle=${buildReferenceDocPath(VEHICLE_SETTINGS_DOC)} exists=${vehicleDocExists} driver=${buildReferenceDocPath(DRIVER_SETTINGS_DOC)} exists=${driverDocExists}`,
        true
      );
      return;
    }

    if (!state.vehicleOptions.length && !state.driverOptions.length) {
      setStatus(
        `候補設定は取得できましたが values が空です: vehicleCount=${vehicles.length} driverCount=${drivers.length}`,
        true
      );
      return;
    }

    if (!vehicleDocExists || !driverDocExists) {
      setStatus(`ローカル設定を読み込みました: 車番 ${state.vehicleOptions.length}件 / 運転者 ${state.driverOptions.length}件`);
      return;
    }

    setStatus(`候補一覧を読み込みました: 車番 ${state.vehicleOptions.length}件 / 運転者 ${state.driverOptions.length}件`);
  } catch (error) {
    state.vehicleOptions = sortOptions(localOptions.vehicles);
    state.driverOptions = sortDriverOptions(localDrivers);
    setSelectOptions(vehicleEl, state.vehicleOptions, "車番を選択", selectedVehicle, normalizeVehicleValue);
    setSelectOptions(driverEl, state.driverOptions, "運転者を選択", selectedDriver, normalizeDriverDisplayName);
    vehicleEl.disabled = false;
    driverEl.disabled = false;
    syncHeaderInfo();

    if (state.vehicleOptions.length || state.driverOptions.length) {
      setStatus(`ローカル設定を読み込みました。クラウド候補の取得には失敗しました: ${error.message}`, true);
      return;
    }

    setStatus(`候補一覧の取得に失敗しました: ${error.message}`, true);
  }
}

function getSelectedYearMonth() {
  if (state.activeMonthKey) {
    return parseYearMonthKey(state.activeMonthKey);
  }
  return {
    year: getSelectedFiscalYearStart(),
    month: 4
  };
}

function getDaysInSelectedMonth() {
  const { year, month } = getSelectedYearMonth();
  return new Date(year, month, 0).getDate();
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formatMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getFiscalYearStartYear(year, month) {
  return month >= 4 ? year : year - 1;
}

function buildFiscalYearMonthEntries(year, month) {
  const fiscalYearStart = getFiscalYearStartYear(year, month);
  return Array.from({ length: 12 }, (_, index) => {
    const offsetMonth = 4 + index;
    const entryYear = fiscalYearStart + Math.floor((offsetMonth - 1) / 12);
    const entryMonth = ((offsetMonth - 1) % 12) + 1;
    return {
      fiscalYearStart,
      year: entryYear,
      month: entryMonth,
      monthKey: formatMonthKey(entryYear, entryMonth),
      sheetName: `${entryMonth}月`
    };
  });
}

function cloneRecordState(recordState = {}, monthKey = "") {
  return {
    month: monthKey || recordState.month || "",
    checks: { ...(recordState.checks || {}) },
    operationManager: recordState.operationManager || "",
    maintenanceManager: recordState.maintenanceManager || "",
    maintenanceBottomByDay: { ...(recordState.maintenanceBottomByDay || {}) },
    maintenanceRecordsByDay: { ...(recordState.maintenanceRecordsByDay || {}) },
    holidayDays: Array.isArray(recordState.holidayDays) ? [...recordState.holidayDays] : [],
    loadedDocId: recordState.loadedDocId || null
  };
}

function createEmptyMonthRecordState(monthKey) {
  return cloneRecordState({ month: monthKey }, monthKey);
}

function getCurrentFiscalEntries() {
  return getMonthEntriesForFiscalYearStart(getSelectedFiscalYearStart());
}

function getMonthEntriesForFiscalYearStart(fiscalYearStart) {
  return buildFiscalYearMonthEntries(fiscalYearStart, 4);
}

function getCurrentFiscalYearStart() {
  const selected = getSelectedYearMonth();
  const activeMonthKey = state.activeMonthKey || formatMonthKey(selected.year, selected.month);
  const { year, month } = parseYearMonthKey(activeMonthKey);
  return getFiscalYearStartYear(year, month);
}

function parseYearMonthKey(monthKey) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  return {
    year: Number(yearText) || 2026,
    month: Number(monthText) || 1
  };
}

function snapshotCurrentMonthState() {
  const monthKey = state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4);
  return cloneRecordState({
    month: monthKey,
    checks: state.checks,
    operationManager: state.operationManager,
    maintenanceManager: state.maintenanceManager,
    maintenanceBottomByDay: state.maintenanceBottomByDay,
    maintenanceRecordsByDay: state.maintenanceRecordsByDay,
    holidayDays: state.holidayDays,
    loadedDocId: state.loadedDocId
  }, monthKey);
}

function syncCurrentMonthStateToAnnualMap() {
  const monthKey = state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4);
  if (!monthKey) {
    return;
  }
  state.recordsByMonth[monthKey] = snapshotCurrentMonthState();
}

function applyMonthRecordState(monthKey, recordState = createEmptyMonthRecordState(monthKey)) {
  const nextRecord = cloneRecordState(recordState, monthKey);
  state.activeMonthKey = monthKey;
  state.checks = nextRecord.checks;
  state.operationManager = nextRecord.operationManager;
  state.maintenanceManager = nextRecord.maintenanceManager;
  state.maintenanceBottomByDay = nextRecord.maintenanceBottomByDay;
  state.maintenanceRecordsByDay = nextRecord.maintenanceRecordsByDay;
  state.holidayDays = nextRecord.holidayDays;
  state.loadedDocId = nextRecord.loadedDocId;
}

function getRecordStateForMonth(monthKey) {
  return cloneRecordState(state.recordsByMonth[monthKey] || createEmptyMonthRecordState(monthKey), monthKey);
}

function setMonthInputValue(monthKey) {
  state.suppressMonthInputSync = true;
  const { year, month } = parseYearMonthKey(monthKey);
  monthEl.value = String(getFiscalYearStartYear(year, month));
  state.suppressMonthInputSync = false;
}

function monthRecordHasContent(recordState = {}) {
  return Boolean(
    Object.keys(recordState.checks || {}).length
    || (recordState.operationManager || "").trim()
    || (recordState.maintenanceManager || "").trim()
    || Object.keys(recordState.maintenanceBottomByDay || {}).length
    || Object.keys(recordState.maintenanceRecordsByDay || {}).length
    || (recordState.holidayDays || []).length
  );
}

function renderMonthTabs() {
  if (!monthTabsEl) {
    return;
  }

  monthTabsEl.replaceChildren();
  const fiscalEntries = getCurrentFiscalEntries();
  state.activeFiscalYearStart = fiscalEntries[0]?.fiscalYearStart ?? null;

  fiscalEntries.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `month-tab-button${entry.monthKey === state.activeMonthKey ? " is-active" : ""}`;
    const monthRecord = entry.monthKey === state.activeMonthKey
      ? snapshotCurrentMonthState()
      : state.recordsByMonth[entry.monthKey];
    if (monthRecordHasContent(monthRecord)) {
      button.classList.add("is-loaded");
    }
    button.textContent = `${entry.month}月`;
    button.addEventListener("click", () => {
      switchActiveMonth(entry.monthKey);
    });
    monthTabsEl.append(button);
  });
}

function switchActiveMonth(monthKey, options = {}) {
  const { preserveCurrent = true, keepStatus = true } = options;
  if (!monthKey) {
    return;
  }

  if (preserveCurrent) {
    syncCurrentMonthStateToAnnualMap();
  }

  applyMonthRecordState(monthKey, getRecordStateForMonth(monthKey));
  setMonthInputValue(monthKey);
  syncHeaderInfo();
  renderMonthTabs();
  renderDays();
  renderBody();
  renderBottomStampRow();
  setStamp("operationManager", state.operationManager);
  setStamp("maintenanceManager", state.maintenanceManager);
  syncToolbarWidth();

  if (!keepStatus) {
    setStatus("");
  }
}

function checkKey(itemIndex, day) {
  return `${itemIndex}_${day}`;
}

function getInspectionItemCount() {
  return INSPECTION_ITEM_LABELS.length;
}

function normalizeMaintenanceRecordValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeMaintenanceRecordsByDay(recordsByDay = {}) {
  return Object.fromEntries(
    Object.entries(recordsByDay).filter(([, value]) => normalizeMaintenanceRecordValue(value))
  );
}

function getMaintenanceRecordsByDayFromSource(source = {}) {
  return sanitizeMaintenanceRecordsByDay({
    ...(source.maintenanceRecordsByDay || {}),
    ...(source.maintenanceNotesByDay || {})
  });
}

function getTriangleItemsForDay(day) {
  return INSPECTION_ITEM_LABELS.filter((label, rowIndex) => state.checks[checkKey(rowIndex, day)] === "▲");
}

function syncMaintenanceRecordsByDay() {
  state.maintenanceRecordsByDay = Object.fromEntries(
    Object.entries(state.maintenanceRecordsByDay).filter(([dayText, value]) => {
      const day = Number(dayText);
      return day >= 1 && day <= getDaysInSelectedMonth() && getTriangleItemsForDay(day).length && normalizeMaintenanceRecordValue(value);
    })
  );
}

function closeMaintenanceNoteDialog(result = null) {
  maintenanceNoteModalEl.hidden = true;
  const resolve = maintenanceNoteDialogResolve;
  maintenanceNoteDialogResolve = null;
  if (resolve) {
    resolve(result);
  }
}

function openMaintenanceNoteDialog(day, triangleItems) {
  if (maintenanceNoteDialogResolve) {
    closeMaintenanceNoteDialog(null);
  }

  maintenanceNoteModalDayEl.textContent = `${day}日の整備記録`;
  maintenanceNoteModalItemsEl.textContent = `点検内容: ${triangleItems.join("、")}`;
  maintenanceNoteInputEl.value = state.maintenanceRecordsByDay[String(day)] || "";
  maintenanceNoteModalEl.hidden = false;

  requestAnimationFrame(() => {
    maintenanceNoteInputEl.focus();
    maintenanceNoteInputEl.select();
  });

  return new Promise((resolve) => {
    maintenanceNoteDialogResolve = resolve;
  });
}

async function promptMaintenanceRecordForDay(day) {
  const triangleItems = getTriangleItemsForDay(day);
  if (!triangleItems.length) {
    return false;
  }

  const nextValue = await openMaintenanceNoteDialog(day, triangleItems);

  if (nextValue === null) {
    return false;
  }

  const normalizedValue = normalizeMaintenanceRecordValue(nextValue);
  if (normalizedValue) {
    state.maintenanceRecordsByDay[String(day)] = normalizedValue;
  } else {
    delete state.maintenanceRecordsByDay[String(day)];
  }

  return true;
}

function getMaintenanceRecordEntries() {
  syncMaintenanceRecordsByDay();
  const entries = [];
  const daysInMonth = getDaysInSelectedMonth();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const triangleItems = getTriangleItemsForDay(day);
    if (!triangleItems.length) {
      continue;
    }

    const savedRecord = normalizeMaintenanceRecordValue(state.maintenanceRecordsByDay[String(day)] || "");
    const inspectionText = triangleItems.join("、");
    entries.push({
      day,
      text: savedRecord ? `${inspectionText} ${savedRecord}` : inspectionText,
      hasSavedRecord: Boolean(savedRecord)
    });
  }

  return entries;
}

function renderMaintenanceRecordCell() {
  const recordCell = document.getElementById("maintenanceRecordCell");
  if (!recordCell) {
    return;
  }

  recordCell.replaceChildren();
  const entries = getMaintenanceRecordEntries();
  if (!entries.length) {
    return;
  }

  const list = document.createElement("div");
  list.className = "maintenance-record-list";

  entries.forEach(({ day, text, hasSavedRecord }) => {
    const entry = document.createElement("div");
    entry.className = "maintenance-record-entry";
    if (!hasSavedRecord) {
      entry.classList.add("is-fallback");
    }
    entry.textContent = `${day}日 ${text}`;
    entry.title = `${day}日の整備記録を入力・訂正`;
    entry.addEventListener("click", async () => {
      const updated = await promptMaintenanceRecordForDay(day);
      if (!updated) {
        return;
      }
      renderMaintenanceRecordCell();
      setStatus(`${day}日の整備記録を更新しました。保存すると Firebase に反映されます。`);
    });
    list.append(entry);
  });

  recordCell.append(list);
}

function isHolidayDay(day) {
  return state.holidayDays.includes(day);
}

function setHolidayHeaderState(day, isHoliday) {
  document.querySelectorAll(`[data-day="${day}"]`).forEach((cell) => {
    cell.classList.toggle("is-holiday", isHoliday);
  });
}

function setCheckCellState(cell, value, isHoliday) {
  if (!cell) {
    return;
  }
  cell.textContent = value;
  cell.classList.toggle("is-holiday", isHoliday);
}

function applyHolidayChecks(day) {
  for (let itemIndex = 0; itemIndex < getInspectionItemCount(); itemIndex += 1) {
    const key = checkKey(itemIndex, day);
    state.checks[key] = HOLIDAY_MARK;
    const cell = bodyEl.querySelector(`[data-check-key="${key}"]`);
    setCheckCellState(cell, "", true);
  }
}

function clearHolidayChecks(day) {
  for (let itemIndex = 0; itemIndex < getInspectionItemCount(); itemIndex += 1) {
    const key = checkKey(itemIndex, day);
    delete state.checks[key];
    const cell = bodyEl.querySelector(`[data-check-key="${key}"]`);
    setCheckCellState(cell, "", false);
  }
}

function inferHolidayDaysFromChecks(checks, daysInMonth = getDaysInSelectedMonth()) {
  const itemCount = getInspectionItemCount();
  const inferredDays = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    let hasHolidayMark = false;
    let allHoliday = true;

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const value = checks[checkKey(itemIndex, day)];
      if (value !== HOLIDAY_MARK) {
        allHoliday = false;
        break;
      }
      hasHolidayMark = true;
    }

    if (allHoliday && hasHolidayMark) {
      inferredDays.push(day);
    }
  }

  return inferredDays;
}

function mergeHolidayDays(days, checks = state.checks, daysInMonth = getDaysInSelectedMonth()) {
  return [...new Set([...(days || []), ...inferHolidayDaysFromChecks(checks, daysInMonth)].map((day) => Number(day)))]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= daysInMonth)
    .sort((left, right) => left - right);
}

function buildHolidayPayload(days = state.holidayDays, checks = state.checks, daysInMonth = getDaysInSelectedMonth()) {
  const normalizedDays = mergeHolidayDays(days, checks, daysInMonth);
  const dayEntries = normalizedDays.map((day) => [String(day), true]);
  return {
    holidayDays: normalizedDays,
    holidays: normalizedDays.map((day) => String(day)),
    holidayFlagsByDay: Object.fromEntries(dayEntries),
    isHolidayByDay: Object.fromEntries(dayEntries)
  };
}

function collectLegacyHolidayDays(checksByDay = {}) {
  return Object.entries(checksByDay || {})
    .filter(([, valuesByField]) => {
      const values = CHECK_FIELD_ORDER.map((fieldKey) => String(valuesByField?.[fieldKey] || "").trim());
      return values.length > 0 && values.every((value) => value === HOLIDAY_MARK);
    })
    .map(([dayText]) => Number(dayText));
}

function extractHolidayDays(recordData = {}, checks = {}, daysInMonth = getDaysInSelectedMonth()) {
  const collectedDays = collectLegacyHolidayDays(recordData.checksByDay || {});

  if (Array.isArray(recordData.holidayDays)) {
    collectedDays.push(...recordData.holidayDays);
  }
  if (Array.isArray(recordData.holidays)) {
    collectedDays.push(...recordData.holidays);
  }

  [recordData.holidayFlagsByDay, recordData.isHolidayByDay].forEach((mapValue) => {
    if (!mapValue || typeof mapValue !== "object") {
      return;
    }
    Object.entries(mapValue).forEach(([dayText, enabled]) => {
      if (enabled) {
        collectedDays.push(dayText);
      }
    });
  });

  return mergeHolidayDays(collectedDays, checks, daysInMonth);
}

function syncHolidayChecks() {
  state.holidayDays = mergeHolidayDays(state.holidayDays, state.checks);
  state.holidayDays.forEach((day) => applyHolidayChecks(day));
}

function markHolidayForDay(day) {
  if (isHolidayDay(day)) {
    if (!window.confirm(`${day}日の休日設定を解除しますか？`)) {
      return;
    }

    state.holidayDays = state.holidayDays.filter((holidayDay) => holidayDay !== day);
    clearHolidayChecks(day);
    setHolidayHeaderState(day, false);
    syncMaintenanceRecordsByDay();
    renderMaintenanceRecordCell();
    setStatus(`${day}日の休日設定を解除しました。保存すると反映されます。`);
    return;
  }

  if (!window.confirm(`${day}日を休日にしますか？`)) {
    return;
  }

  state.holidayDays = [...state.holidayDays, day].sort((left, right) => left - right);
  applyHolidayChecks(day);
  setHolidayHeaderState(day, true);
  syncMaintenanceRecordsByDay();
  renderMaintenanceRecordCell();
  setStatus(`${day}日を休日に設定しました。保存すると反映されます。`);
}

function rotateCheck(value) {
  const index = CHECK_STATES.indexOf(value);
  return CHECK_STATES[(index + 1) % CHECK_STATES.length];
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildHankoSvgMarkup(name, size = "small") {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return "";
  }

  const { width, height } = EXCEL_STAMP_IMAGE_SIZES[size] || EXCEL_STAMP_IMAGE_SIZES.small;
  const charCount = Array.from(trimmedName).length;
  const fontSize = size === "large"
    ? Math.max(17, 20 - Math.max(0, charCount - 2) * 2)
    : Math.max(11, 13 - Math.max(0, charCount - 2));
  const strokeWidth = size === "large" ? 2.5 : 2;
  const inset = strokeWidth + (size === "large" ? 2.5 : 1.5);
  const letterSpacing = size === "large" ? 0.5 : 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <circle cx="${width / 2}" cy="${height / 2}" r="${(Math.min(width, height) / 2) - inset}" fill="rgba(255,255,255,0.18)" stroke="#c61717" stroke-width="${strokeWidth}" />
  <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" fill="#c61717" font-size="${fontSize}" font-weight="700" font-family="'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif" letter-spacing="${letterSpacing}">${escapeXmlText(trimmedName)}</text>
</svg>`;
}

async function fetchStampSvgMarkup(assetUrl) {
  if (!stampSvgMarkupPromiseCache.has(assetUrl)) {
    stampSvgMarkupPromiseCache.set(assetUrl, (async () => {
      const response = await fetch(assetUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`印画像を取得できませんでした: HTTP ${response.status}`);
      }
      return response.text();
    })());
  }

  return stampSvgMarkupPromiseCache.get(assetUrl);
}

async function getStampSvgMarkup(name, size = "small") {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return "";
  }

  const assetUrl = EXCEL_CUSTOM_STAMP_ASSETS[`${trimmedName}:${size}`];
  if (assetUrl) {
    return fetchStampSvgMarkup(assetUrl);
  }

  return buildHankoSvgMarkup(trimmedName, size);
}

async function renderSvgToPngArrayBuffer(svgMarkup, width, height) {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("印画像の描画に失敗しました"));
      nextImage.src = objectUrl;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("印画像の描画コンテキストを取得できませんでした");
    }

    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("印画像の PNG 変換に失敗しました"));
      }, EXCEL_PNG_CONTENT_TYPE);
    });

    return await pngBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createHanko(name, size = "small") {
  if (!name) return "";
  return `<div class="hanko hanko-${size}"><span>${name}</span></div>`;
}

function setStamp(target, value) {
  state[target] = value;
  const idMap = {
    operationManager: "operationManagerSlot",
    maintenanceManager: "maintenanceManagerSlot"
  };
  const slot = document.getElementById(idMap[target]);
  slot.innerHTML = createHanko(value, "large");
}

function setBottomStampByDay(day, value) {
  const dayKey = String(day);
  if (value) {
    state.maintenanceBottomByDay[dayKey] = value;
  } else {
    delete state.maintenanceBottomByDay[dayKey];
  }
  const cell = maintenanceFooterRowEl.querySelector(`[data-bottom-day="${day}"]`);
  if (cell) {
    cell.innerHTML = createHanko(value, "small");
  }
}

function toggleStamp(target, value) {
  const nextValue = state[target] === value ? "" : value;
  setStamp(target, nextValue);
}

function toggleBottomStampByDay(day, value) {
  const dayKey = String(day);
  const nextValue = state.maintenanceBottomByDay[dayKey] === value ? "" : value;
  setBottomStampByDay(day, nextValue);
}

function renderBottomStampRow() {
  maintenanceFooterRowEl.querySelectorAll(".bottom-day-cell").forEach((el) => el.remove());
  const maintenanceRecordFooterCell = document.getElementById("maintenanceRecordFooterCell");
  const daysInMonth = getDaysInSelectedMonth();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement("td");
    cell.className = "bottom-day-cell";
    cell.dataset.bottomDay = String(day);
    cell.innerHTML = createHanko(state.maintenanceBottomByDay[String(day)] || "", "small");
    cell.addEventListener("click", () => {
      toggleBottomStampByDay(day, "若本");
    });
    maintenanceFooterRowEl.insertBefore(cell, maintenanceRecordFooterCell);
  }
}

function toWeekdayLabel(year, month, day) {
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[dayOfWeek];
}

function renderDays() {
  datesRowEl.innerHTML = '<th colspan="4" rowspan="2">点検個所</th><th colspan="4" rowspan="2" class="content-head"><div class="content-head-inner"><span class="content-title">点検内容</span><span class="day-mark-stack"><span class="day-mark-cell">日</span><span class="day-mark-cell">曜</span></span></div></th>';
  daysRowEl.innerHTML = "";

  const { year, month } = getSelectedYearMonth();
  const daysInMonth = getDaysInSelectedMonth();
  const managerSpan = 3;
  const titleSpan = Math.max(1, daysInMonth - managerSpan * 2);
  titleHeadEl.colSpan = titleSpan;
  driverHeadEl.colSpan = titleSpan;
  operationHeadEl.colSpan = managerSpan;
  maintenanceHeadEl.colSpan = managerSpan;
  document.getElementById("operationManagerSlot").colSpan = managerSpan;
  document.getElementById("maintenanceManagerSlot").colSpan = managerSpan;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateTh = document.createElement("th");
    dateTh.className = "day holiday-trigger";
    dateTh.dataset.day = String(day);
    dateTh.textContent = String(day);
    dateTh.title = `${day}日を休日に設定`;
    dateTh.addEventListener("click", () => {
      markHolidayForDay(day);
    });
    datesRowEl.append(dateTh);

    const dowTh = document.createElement("th");
    dowTh.className = "day holiday-trigger";
    dowTh.dataset.day = String(day);
    dowTh.textContent = toWeekdayLabel(year, month, day);
    dowTh.title = `${day}日を休日に設定`;
    dowTh.addEventListener("click", () => {
      markHolidayForDay(day);
    });
    if (isHolidayDay(day)) {
      dateTh.classList.add("is-holiday");
      dowTh.classList.add("is-holiday");
    }
    daysRowEl.append(dowTh);
  }
}

function syncToolbarWidth() {
  const tableWidth = inspectionTableEl.offsetWidth;
  if (tableWidth > 0) {
    toolbarEl.style.width = `${tableWidth}px`;
  }
}

function printSheet() {
  syncHeaderInfo();
  window.print();
}

function showHelp() {
  window.alert(
    [
      "日付を押すと休日の設定になります。もう一度押すと解除できます。",
      "読込、保存はFirebaseのデータに読込、保存されます。",
      "印刷はA4横で印刷されます。"
    ].join("\n")
  );
}

function renderBody() {
  bodyEl.innerHTML = "";
  const daysInMonth = getDaysInSelectedMonth();
  const itemCount = getInspectionItemCount();
  let rowIndex = 0;
  GROUPS.forEach((group) => {
    group.contents.forEach((line, groupLineIndex) => {
      const tr = document.createElement("tr");

      if (groupLineIndex === 0) {
        const category = document.createElement("td");
        category.className = "category";
        category.colSpan = 4;
        category.rowSpan = group.contents.length;
        category.textContent = group.category;
        tr.append(category);
      }

      const content = document.createElement("td");
      content.className = "content";
      content.colSpan = 4;
      content.textContent = line;
      tr.append(content);

      for (let day = 1; day <= daysInMonth; day += 1) {
        const key = checkKey(rowIndex, day);
        const td = document.createElement("td");
        td.className = "check-cell";
        td.dataset.checkKey = key;
        const isHoliday = isHolidayDay(day);
        const displayValue = isHoliday ? "" : (state.checks[key] || "");
        setCheckCellState(td, displayValue, isHoliday);
        td.addEventListener("click", () => {
          if (isHolidayDay(day)) {
            return;
          }
          const next = rotateCheck(state.checks[key] || "");
          state.checks[key] = next;
          if (!next) {
            delete state.checks[key];
          }
          syncMaintenanceRecordsByDay();
          setCheckCellState(td, next, false);
          renderMaintenanceRecordCell();
        });
        tr.append(td);
      }

      if (rowIndex === 0) {
        const maintenanceRecordCell = document.createElement("td");
        maintenanceRecordCell.id = "maintenanceRecordCell";
        maintenanceRecordCell.className = "maintenance-record-cell";
        maintenanceRecordCell.rowSpan = itemCount;
        tr.append(maintenanceRecordCell);
      }

      bodyEl.append(tr);
      rowIndex += 1;
    });
  });

  renderMaintenanceRecordCell();
}

function syncHeaderInfo() {
  const month = state.activeMonthKey ? String(parseYearMonthKey(state.activeMonthKey).month) : "";
  monthTextEl.textContent = month ? String(Number(month)) : "-";
  vehicleTextEl.textContent = vehicleEl.value.trim() || "-";
  driverTextEl.textContent = stripDriverReading(driverEl.value) || "-";
}

function clearLoadedDocId() {
  state.loadedDocId = null;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#1e2a35";
}

function buildRecordKey(month, vehicle, driver) {
  return `${month}__${normalizeVehicleValue(vehicle)}__${driver}`;
}

function resetRecordState() {
  state.checks = {};
  state.operationManager = "";
  state.maintenanceManager = "";
  state.maintenanceBottomByDay = {};
  state.maintenanceRecordsByDay = {};
  state.holidayDays = [];
  state.loadedDocId = null;
}

function resetAnnualRecordState(monthKey = formatMonthKey(getSelectedFiscalYearStart(), 4)) {
  const { year, month } = parseYearMonthKey(monthKey);
  state.recordsByMonth = {};
  state.activeMonthKey = monthKey;
  state.activeFiscalYearStart = getFiscalYearStartYear(year, month);
  resetRecordState();
}

function sanitizeFileNamePart(value, fallback) {
  const normalizedValue = normalizeOptionValue(value);
  if (!normalizedValue) {
    return fallback;
  }
  return normalizedValue.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function downloadBlob(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const linkEl = document.createElement("a");

  linkEl.href = downloadUrl;
  linkEl.download = fileName;
  document.body.append(linkEl);
  linkEl.click();
  linkEl.remove();
  URL.revokeObjectURL(downloadUrl);
}

function buildExcelFileName() {
  const month = state.activeMonthKey || `${getSelectedFiscalYearStart()}年度`;
  const vehicle = sanitizeFileNamePart(vehicleEl.value, "vehicle");
  const driver = sanitizeFileNamePart(stripDriverReading(driverEl.value), "driver");
  return `月次日常点検_${month}_${vehicle}_${driver}.xlsx`;
}

async function getJsZipModule() {
  if (!jsZipModulePromise) {
    jsZipModulePromise = import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")
      .then((module) => module.default);
  }
  return jsZipModulePromise;
}

function getExcelTemplateUrlCandidates() {
  return [...new Set([
    new URL(`./assets/${EXCEL_TEMPLATE_ASSET_FILE_NAME}`, import.meta.url).href,
    EXCEL_TEMPLATE_API_PATH,
    new URL(`../${EXCEL_TEMPLATE_FILE_NAME}`, import.meta.url).href
  ])];
}

async function fetchExcelTemplateArrayBuffer() {
  const failures = [];

  for (const templateUrl of getExcelTemplateUrlCandidates()) {
    try {
      const response = await fetch(templateUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      failures.push(`${templateUrl}: ${error.message}`);
    }
  }

  throw new Error(`Excelテンプレートを取得できませんでした: ${failures.join(" / ")}`);
}

function parseXmlDocument(xmlText) {
  const xmlDoc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("ExcelテンプレートのXML解析に失敗しました");
  }
  return xmlDoc;
}

function serializeXmlDocument(xmlDoc) {
  const xmlText = new XMLSerializer().serializeToString(xmlDoc);
  return xmlText.startsWith("<?xml")
    ? xmlText
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xmlText}`;
}

function getZipDirectoryPath(filePath) {
  return filePath.slice(0, filePath.lastIndexOf("/"));
}

function getZipBaseName(filePath) {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

function resolveZipPath(fromPath, targetPath) {
  const baseParts = getZipDirectoryPath(fromPath).split("/").filter(Boolean);
  const targetParts = targetPath.split("/").filter(Boolean);

  if (targetPath.startsWith("/")) {
    return targetParts.join("/");
  }

  const resolvedParts = [...baseParts];
  targetParts.forEach((part) => {
    if (!part || part === ".") {
      return;
    }
    if (part === "..") {
      resolvedParts.pop();
      return;
    }
    resolvedParts.push(part);
  });

  return resolvedParts.join("/");
}

function createRelationshipsDocument() {
  return parseXmlDocument(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}"></Relationships>`
  );
}

function clearElementChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function ensureContentTypeDefault(contentTypesDoc, extension, contentType) {
  const existing = Array.from(contentTypesDoc.getElementsByTagNameNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Default"))
    .find((node) => (node.getAttribute("Extension") || "").toLowerCase() === extension.toLowerCase());
  if (existing) {
    existing.setAttribute("ContentType", contentType);
    return;
  }

  const root = contentTypesDoc.documentElement;
  const defaultNode = contentTypesDoc.createElementNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Default");
  defaultNode.setAttribute("Extension", extension);
  defaultNode.setAttribute("ContentType", contentType);
  root.append(defaultNode);
}

function getNextWorkbookMediaIndex(workbook) {
  const mediaNames = Object.keys(workbook.files).filter((filePath) => /^xl\/media\/stamp-\d+\.png$/.test(filePath));
  if (!mediaNames.length) {
    return 1;
  }

  return Math.max(...mediaNames.map((filePath) => Number(filePath.match(/stamp-(\d+)\.png$/)?.[1] || 0))) + 1;
}

async function createExcelStampMediaStore(workbook, contentTypesDoc) {
  const mediaCache = new Map();
  let nextMediaIndex = getNextWorkbookMediaIndex(workbook);

  ensureContentTypeDefault(contentTypesDoc, "png", EXCEL_PNG_CONTENT_TYPE);

  return {
    async getStampImage(name, size) {
      const trimmedName = String(name || "").trim();
      if (!trimmedName) {
        return null;
      }

      const cacheKey = `${size}:${trimmedName}`;
      if (!mediaCache.has(cacheKey)) {
        mediaCache.set(cacheKey, (async () => {
          const dimensions = EXCEL_STAMP_IMAGE_SIZES[size] || EXCEL_STAMP_IMAGE_SIZES.small;
          const svgMarkup = await getStampSvgMarkup(trimmedName, size);
          const imageBuffer = await renderSvgToPngArrayBuffer(svgMarkup, dimensions.width, dimensions.height);
          const mediaPath = `xl/media/stamp-${nextMediaIndex}.png`;
          nextMediaIndex += 1;
          workbook.file(mediaPath, imageBuffer);
          return {
            mediaPath,
            ...dimensions
          };
        })());
      }

      return mediaCache.get(cacheKey);
    }
  };
}

function columnLabelToNumber(columnLabel) {
  return columnLabel.split("").reduce((total, char) => (total * 26) + (char.charCodeAt(0) - 64), 0);
}

function parseCellReference(cellRef) {
  const match = /^([A-Z]+)(\d+)$/.exec(cellRef);
  if (!match) {
    throw new Error(`不正なセル参照です: ${cellRef}`);
  }

  const [, columnLabel, rowText] = match;
  return {
    columnLabel,
    columnNumber: columnLabelToNumber(columnLabel),
    rowNumber: Number(rowText)
  };
}

function getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, sheetName) {
  const sheets = Array.from(workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheet"));
  const targetSheet = sheets.find((sheet) => sheet.getAttribute("name") === sheetName);
  if (!targetSheet) {
    return null;
  }

  const relationshipId = targetSheet.getAttributeNS(EXCEL_RELATIONSHIP_NAMESPACE, "id") || targetSheet.getAttribute("r:id");
  const relationships = Array.from(
    workbookRelsDoc.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship")
  );
  const relationship = relationships.find((item) => item.getAttribute("Id") === relationshipId);
  if (!relationship) {
    return null;
  }

  const targetPath = relationship.getAttribute("Target") || "";
  return {
    sheet: targetSheet,
    index: sheets.indexOf(targetSheet),
    path: targetPath.startsWith("/")
      ? targetPath.replace(/^\//, "")
      : `xl/${targetPath.replace(/^xl\//, "")}`
  };
}

function resolveExcelSheetTarget(workbookDoc, workbookRelsDoc, month) {
  const preferredSheetName = EXCEL_MONTH_SHEET_NAMES[month] || EXCEL_TEMPLATE_SHEET_NAME;
  return getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, preferredSheetName)
    || getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, EXCEL_TEMPLATE_SHEET_NAME);
}

function getInspectionSheetTargets(workbookDoc, workbookRelsDoc) {
  const sheets = Array.from(workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheet"));
  return sheets
    .map((sheet) => getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, sheet.getAttribute("name")))
    .filter((target) => target && /^日常点検記録表/.test(target.sheet.getAttribute("name")));
}

function getWorksheetSheetTargets(workbookDoc, workbookRelsDoc) {
  const sheets = Array.from(workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheet"));
  return sheets
    .map((sheet) => getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, sheet.getAttribute("name")))
    .filter(Boolean);
}

function getWorkbookRelationshipNodes(workbookRelsDoc) {
  return Array.from(workbookRelsDoc.getElementsByTagNameNS(PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship"));
}

function getNextNumericSuffix(workbook, pattern) {
  const matches = Object.keys(workbook.files)
    .map((filePath) => Number(filePath.match(pattern)?.[1] || 0))
    .filter((value) => value > 0);
  return matches.length ? Math.max(...matches) + 1 : 1;
}

function removeWorkbookRelationshipNode(workbookRelsDoc, relationshipId) {
  const relationshipNode = getWorkbookRelationshipNodes(workbookRelsDoc)
    .find((node) => node.getAttribute("Id") === relationshipId);
  if (relationshipNode?.parentNode) {
    relationshipNode.parentNode.removeChild(relationshipNode);
  }
}

function removeContentTypeOverride(contentTypesDoc, partName) {
  const normalizedPartName = partName.startsWith("/") ? partName : `/${partName}`;
  const overrideNode = Array.from(contentTypesDoc.getElementsByTagNameNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Override"))
    .find((node) => node.getAttribute("PartName") === normalizedPartName);
  if (overrideNode?.parentNode) {
    overrideNode.parentNode.removeChild(overrideNode);
  }
}

function ensureContentTypeOverride(contentTypesDoc, partName, contentType) {
  const normalizedPartName = partName.startsWith("/") ? partName : `/${partName}`;
  const existing = Array.from(contentTypesDoc.getElementsByTagNameNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Override"))
    .find((node) => node.getAttribute("PartName") === normalizedPartName);
  if (existing) {
    existing.setAttribute("ContentType", contentType);
    return;
  }

  const overrideNode = contentTypesDoc.createElementNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Override");
  overrideNode.setAttribute("PartName", normalizedPartName);
  overrideNode.setAttribute("ContentType", contentType);
  contentTypesDoc.documentElement.append(overrideNode);
}

function removeContentTypeOverridesMatching(contentTypesDoc, pattern) {
  Array.from(contentTypesDoc.getElementsByTagNameNS(EXCEL_CONTENT_TYPES_NAMESPACE, "Override"))
    .filter((node) => pattern.test(node.getAttribute("PartName") || ""))
    .forEach((node) => node.parentNode?.removeChild(node));
}

function removeWorkbookRelationshipsByType(workbookRelsDoc, relationshipType) {
  getWorkbookRelationshipNodes(workbookRelsDoc)
    .filter((node) => node.getAttribute("Type") === relationshipType)
    .forEach((node) => node.parentNode?.removeChild(node));
}

function removeZipEntriesMatching(workbook, pattern) {
  Object.keys(workbook.files)
    .filter((filePath) => pattern.test(filePath))
    .forEach((filePath) => workbook.remove(filePath));
}

async function createAnnualExcelSheetTargets(workbook, workbookDoc, workbookRelsDoc, contentTypesDoc) {
  const sheetsRoot = workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheets")[0];
  if (!sheetsRoot) {
    throw new Error("Excelテンプレートのシート一覧を取得できません");
  }

  const worksheetTargets = getWorksheetSheetTargets(workbookDoc, workbookRelsDoc);
  const sourceTarget = getWorkbookSheetTarget(workbookDoc, workbookRelsDoc, EXCEL_TEMPLATE_SHEET_NAME)
    || getInspectionSheetTargets(workbookDoc, workbookRelsDoc)
      .find((target) => /^日常点検記録表\d+月$/.test(target.sheet.getAttribute("name")))
    || worksheetTargets[0];
  if (!sourceTarget) {
    throw new Error("年度シートを生成するための月次シートを特定できません");
  }

  const sourceWorksheetXml = await workbook.file(sourceTarget.path)?.async("string");
  if (!sourceWorksheetXml) {
    throw new Error(`Excelテンプレートの元シートを開けません: ${sourceTarget.path}`);
  }

  const sourceWorksheetRelsPath = getWorksheetRelationshipsPath(sourceTarget.path);
  const sourceWorksheetRelsXml = await workbook.file(sourceWorksheetRelsPath)?.async("string");
  if (!sourceWorksheetRelsXml) {
    throw new Error(`Excelテンプレートの元シート関係を開けません: ${sourceWorksheetRelsPath}`);
  }

  const sourceWorksheetDoc = parseXmlDocument(sourceWorksheetXml);
  const sourceDrawingPath = await getWorksheetDrawingPath(workbook, sourceWorksheetDoc, sourceTarget.path);
  if (!sourceDrawingPath) {
    throw new Error("Excelテンプレートの元シート drawing を特定できません");
  }

  const sourceDrawingXml = await workbook.file(sourceDrawingPath)?.async("string");
  if (!sourceDrawingXml) {
    throw new Error(`Excelテンプレートの元 drawing を開けません: ${sourceDrawingPath}`);
  }

  Array.from(sheetsRoot.childNodes)
    .filter((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === "sheet")
    .forEach((node) => node.parentNode?.removeChild(node));

  removeWorkbookRelationshipsByType(
    workbookRelsDoc,
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
  );
  removeContentTypeOverridesMatching(contentTypesDoc, /^\/xl\/worksheets\/sheet\d+\.xml$/);
  removeContentTypeOverridesMatching(contentTypesDoc, /^\/xl\/drawings\/drawing\d+\.xml$/);
  removeZipEntriesMatching(workbook, /^xl\/worksheets\/sheet\d+\.xml$/);
  removeZipEntriesMatching(workbook, /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/);
  removeZipEntriesMatching(workbook, /^xl\/drawings\/drawing\d+\.xml$/);
  removeZipEntriesMatching(workbook, /^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/);

  const nextRelationshipNumberStart = getWorkbookRelationshipNodes(workbookRelsDoc)
    .reduce((max, node) => Math.max(max, Number((node.getAttribute("Id") || "").replace(/^rId/, "")) || 0), 0) + 1;
  let nextRelationshipNumber = nextRelationshipNumberStart;

  const generatedTargets = [];
  const { year, month } = getSelectedYearMonth();
  const fiscalMonths = buildFiscalYearMonthEntries(year, month);

  fiscalMonths.forEach((entry, index) => {
    const sheetNumber = index + 1;
    const sheetFilePath = `xl/worksheets/sheet${sheetNumber}.xml`;
    const drawingPath = `xl/drawings/drawing${sheetNumber}.xml`;
    const worksheetRelsPath = getWorksheetRelationshipsPath(sheetFilePath);
    const relationshipId = `rId${nextRelationshipNumber}`;
    nextRelationshipNumber += 1;

    const worksheetRelsDoc = parseXmlDocument(sourceWorksheetRelsXml);
    const drawingRelationshipNode = Array.from(
      worksheetRelsDoc.getElementsByTagNameNS(PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship")
    ).find((node) => node.getAttribute("Type") === EXCEL_DRAWING_RELATIONSHIP_TYPE);
    if (drawingRelationshipNode) {
      drawingRelationshipNode.setAttribute("Target", `../drawings/${getZipBaseName(drawingPath)}`);
    }

    workbook.file(sheetFilePath, sourceWorksheetXml);
    workbook.file(worksheetRelsPath, serializeXmlDocument(worksheetRelsDoc));
    workbook.file(drawingPath, sourceDrawingXml);

    ensureContentTypeOverride(
      contentTypesDoc,
      sheetFilePath,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
    );
    ensureContentTypeOverride(
      contentTypesDoc,
      drawingPath,
      "application/vnd.openxmlformats-officedocument.drawing+xml"
    );

    const relationshipNode = workbookRelsDoc.createElementNS(PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship");
    relationshipNode.setAttribute("Id", relationshipId);
    relationshipNode.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet");
    relationshipNode.setAttribute("Target", sheetFilePath.replace(/^xl\//, ""));
    workbookRelsDoc.documentElement.append(relationshipNode);

    const sheetNode = workbookDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "sheet");
    sheetNode.setAttribute("name", entry.sheetName);
    sheetNode.setAttribute("sheetId", String(sheetNumber));
    sheetNode.setAttributeNS(EXCEL_RELATIONSHIP_NAMESPACE, "r:id", relationshipId);
    sheetsRoot.append(sheetNode);

    generatedTargets.push({
      ...entry,
      sheet: sheetNode,
      path: sheetFilePath
    });
  });

  return generatedTargets;
}

function getElementChildren(parentNode, localName) {
  return Array.from(parentNode.childNodes).filter((child) => (
    child.nodeType === Node.ELEMENT_NODE && (!localName || child.localName === localName)
  ));
}

function normalizeExcelRgb(value) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (!normalizedValue) {
    return "";
  }
  if (/^[0-9A-F]{6}$/.test(normalizedValue)) {
    return `FF${normalizedValue}`;
  }
  return normalizedValue;
}

function getStyleFillNodes(stylesDoc) {
  const fillsRoot = stylesDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "fills")[0];
  return fillsRoot ? getElementChildren(fillsRoot, "fill") : [];
}

function ensureSolidFill(stylesDoc, rgb) {
  const fillsRoot = stylesDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "fills")[0];
  if (!fillsRoot) {
    return "0";
  }

  const targetRgb = normalizeExcelRgb(rgb);
  const existingFillIndex = getStyleFillNodes(stylesDoc).findIndex((fillNode) => {
    const patternFill = fillNode.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "patternFill")[0];
    const fgColor = patternFill?.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "fgColor")[0];
    return patternFill?.getAttribute("patternType") === "solid"
      && normalizeExcelRgb(fgColor?.getAttribute("rgb")) === targetRgb;
  });
  if (existingFillIndex >= 0) {
    return String(existingFillIndex);
  }

  const fillNode = stylesDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "fill");
  const patternFillNode = stylesDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "patternFill");
  const fgColorNode = stylesDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "fgColor");
  const bgColorNode = stylesDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "bgColor");

  patternFillNode.setAttribute("patternType", "solid");
  fgColorNode.setAttribute("rgb", targetRgb);
  bgColorNode.setAttribute("indexed", "64");
  patternFillNode.append(fgColorNode, bgColorNode);
  fillNode.append(patternFillNode);
  fillsRoot.append(fillNode);
  fillsRoot.setAttribute("count", String(getElementChildren(fillsRoot, "fill").length));

  return String(getStyleFillNodes(stylesDoc).length - 1);
}

function getDefaultInactiveFillId(stylesDoc) {
  const fillNodes = getStyleFillNodes(stylesDoc);
  const inactiveFillIndex = fillNodes.findIndex((fillNode, index) => {
    if (index <= 1) {
      return false;
    }
    const patternFill = fillNode.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "patternFill")[0];
    return patternFill?.getAttribute("patternType") === "solid";
  });
  return String(inactiveFillIndex >= 0 ? inactiveFillIndex : 0);
}

function buildStyleSignature(xfNode) {
  return Array.from(xfNode.attributes)
    .map((attribute) => [attribute.name, attribute.value])
    .filter(([name]) => name !== "fillId" && name !== "applyFill")
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, value]) => `${name}=${value}`)
    .join("|");
}

function buildStyleFillVariantMap(stylesDoc) {
  const cellXfs = stylesDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "cellXfs")[0];
  if (!cellXfs) {
    return new Map();
  }

  const holidayFillId = ensureSolidFill(stylesDoc, EXCEL_HOLIDAY_FILL_RGB);
  const inactiveFillId = getDefaultInactiveFillId(stylesDoc);

  const xfNodes = getElementChildren(cellXfs, "xf");
  const styleIndexByFillAndSignature = new Map();

  xfNodes.forEach((xfNode, styleIndex) => {
    const signature = buildStyleSignature(xfNode);
    const fillId = xfNode.getAttribute("fillId") || "0";
    styleIndexByFillAndSignature.set(`${fillId}::${signature}`, styleIndex);
  });

  const ensureStyleVariant = (xfNode, fillId) => {
    const signature = buildStyleSignature(xfNode);
    const variantKey = `${fillId}::${signature}`;
    const existingStyleIndex = styleIndexByFillAndSignature.get(variantKey);
    if (Number.isInteger(existingStyleIndex)) {
      return existingStyleIndex;
    }

    const clonedXfNode = xfNode.cloneNode(true);
    clonedXfNode.setAttribute("fillId", fillId);
    if (fillId === "0") {
      clonedXfNode.removeAttribute("applyFill");
    } else {
      clonedXfNode.setAttribute("applyFill", "1");
    }

    cellXfs.append(clonedXfNode);
    const styleIndex = getElementChildren(cellXfs, "xf").length - 1;
    cellXfs.setAttribute("count", String(styleIndex + 1));
    styleIndexByFillAndSignature.set(variantKey, styleIndex);
    return styleIndex;
  };

  const variantMap = new Map();
  xfNodes.forEach((xfNode, styleIndex) => {
    variantMap.set(styleIndex, {
      normal: ensureStyleVariant(xfNode, "0"),
      holiday: ensureStyleVariant(xfNode, holidayFillId),
      inactive: ensureStyleVariant(xfNode, inactiveFillId)
    });
  });

  return variantMap;
}

function getWorksheetRelationshipsPath(worksheetPath) {
  return `${getZipDirectoryPath(worksheetPath)}/_rels/${getZipBaseName(worksheetPath)}.rels`;
}

function getDrawingRelationshipsPath(drawingPath) {
  return `${getZipDirectoryPath(drawingPath)}/_rels/${getZipBaseName(drawingPath)}.rels`;
}

function getWorksheetDrawingPath(workbook, worksheetDoc, worksheetPath) {
  const drawingNode = worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "drawing")[0];
  if (!drawingNode) {
    return null;
  }

  const relationshipId = drawingNode.getAttributeNS(EXCEL_RELATIONSHIP_NAMESPACE, "id") || drawingNode.getAttribute("r:id");
  if (!relationshipId) {
    return null;
  }

  const relationshipsPath = getWorksheetRelationshipsPath(worksheetPath);
  const relationshipsFile = workbook.file(relationshipsPath);
  if (!relationshipsFile) {
    return null;
  }

  return relationshipsFile.async("string").then((xmlText) => {
    const relationshipsDoc = parseXmlDocument(xmlText);
    const relationship = Array.from(relationshipsDoc.getElementsByTagNameNS(PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship"))
      .find((item) => item.getAttribute("Id") === relationshipId && item.getAttribute("Type") === EXCEL_DRAWING_RELATIONSHIP_TYPE);

    if (!relationship) {
      return null;
    }

    return resolveZipPath(worksheetPath, relationship.getAttribute("Target") || "");
  });
}

function appendTextElement(parentNode, namespace, localName, textContent) {
  const element = parentNode.ownerDocument.createElementNS(namespace, localName);
  element.textContent = String(textContent);
  parentNode.append(element);
  return element;
}

function createDrawingAnchor(worksheetDoc, placement, relationshipId, shapeId) {
  const root = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:oneCellAnchor");
  const fromNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:from");
  const extNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:ext");
  const picNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:pic");
  const nvPicPrNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:nvPicPr");
  const cNvPrNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:cNvPr");
  const cNvPicPrNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:cNvPicPr");
  const picLocksNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:picLocks");
  const blipFillNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:blipFill");
  const blipNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:blip");
  const stretchNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:stretch");
  const fillRectNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:fillRect");
  const spPrNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:spPr");
  const xfrmNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:xfrm");
  const offNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:off");
  const picExtNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:ext");
  const prstGeomNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:prstGeom");
  const avLstNode = worksheetDoc.createElementNS(EXCEL_DRAWING_MAIN_NAMESPACE, "a:avLst");
  const clientDataNode = worksheetDoc.createElementNS(EXCEL_DRAWING_NAMESPACE, "xdr:clientData");
  const { width, height, columnNumber, rowNumber, columnOffset = 0, rowOffset = 0 } = placement;

  appendTextElement(fromNode, EXCEL_DRAWING_NAMESPACE, "xdr:col", columnNumber - 1);
  appendTextElement(fromNode, EXCEL_DRAWING_NAMESPACE, "xdr:colOff", columnOffset);
  appendTextElement(fromNode, EXCEL_DRAWING_NAMESPACE, "xdr:row", rowNumber - 1);
  appendTextElement(fromNode, EXCEL_DRAWING_NAMESPACE, "xdr:rowOff", rowOffset);

  extNode.setAttribute("cx", String(width * EXCEL_EMUS_PER_PIXEL));
  extNode.setAttribute("cy", String(height * EXCEL_EMUS_PER_PIXEL));

  cNvPrNode.setAttribute("id", String(shapeId));
  cNvPrNode.setAttribute("name", `Stamp ${shapeId}`);
  cNvPrNode.setAttribute("descr", placement.name);

  picLocksNode.setAttribute("noChangeAspect", "1");
  cNvPicPrNode.append(picLocksNode);
  nvPicPrNode.append(cNvPrNode, cNvPicPrNode);

  blipNode.setAttributeNS(EXCEL_RELATIONSHIP_NAMESPACE, "r:embed", relationshipId);
  stretchNode.append(fillRectNode);
  blipFillNode.append(blipNode, stretchNode);

  offNode.setAttribute("x", "0");
  offNode.setAttribute("y", "0");
  picExtNode.setAttribute("cx", String(width * EXCEL_EMUS_PER_PIXEL));
  picExtNode.setAttribute("cy", String(height * EXCEL_EMUS_PER_PIXEL));
  xfrmNode.append(offNode, picExtNode);
  prstGeomNode.setAttribute("prst", "rect");
  prstGeomNode.append(avLstNode);
  spPrNode.append(xfrmNode, prstGeomNode);

  picNode.append(nvPicPrNode, blipFillNode, spPrNode);
  root.append(fromNode, extNode, picNode, clientDataNode);
  return root;
}

function getStampPlacements() {
  return getStampPlacementsForRecord({
    operationManager: state.operationManager,
    maintenanceManager: state.maintenanceManager,
    maintenanceBottomByDay: state.maintenanceBottomByDay
  });
}

function getStampPlacementsForRecord(recordData = {}) {
  const placements = [];

  if (recordData.operationManager) {
    placements.push({
      name: recordData.operationManager,
      size: "large",
      cellRef: "AI2",
      columnOffset: 18000,
      rowOffset: 12000
    });
  }

  if (recordData.maintenanceManager) {
    placements.push({
      name: recordData.maintenanceManager,
      size: "large",
      cellRef: "AL2",
      columnOffset: 18000,
      rowOffset: 12000
    });
  }

  for (let day = 1; day <= EXCEL_DAY_COLUMNS.length; day += 1) {
    const stampName = recordData.maintenanceBottomByDay?.[String(day)];
    if (!stampName) {
      continue;
    }

    placements.push({
      name: stampName,
      size: "small",
      cellRef: `${EXCEL_DAY_COLUMNS[day - 1]}${EXCEL_BOTTOM_STAMP_ROW}`,
      columnOffset: 19050,
      rowOffset: 19050
    });
  }

  return placements.map((placement) => ({
    ...placement,
    ...parseCellReference(placement.cellRef),
    ...(EXCEL_STAMP_IMAGE_SIZES[placement.size] || EXCEL_STAMP_IMAGE_SIZES.small)
  }));
}

async function applyStampImagesToWorksheet(workbook, worksheetDoc, worksheetPath, placements, stampMediaStore) {
  if (!placements.length) {
    return;
  }

  const drawingPath = await getWorksheetDrawingPath(workbook, worksheetDoc, worksheetPath);
  if (!drawingPath) {
    throw new Error(`Excel シートの画像領域を特定できませんでした: ${worksheetPath}`);
  }

  const drawingFile = workbook.file(drawingPath);
  if (!drawingFile) {
    throw new Error(`Excel の drawing を開けません: ${drawingPath}`);
  }

  const drawingDoc = parseXmlDocument(await drawingFile.async("string"));
  const drawingRoot = drawingDoc.documentElement;
  clearElementChildren(drawingRoot);

  const drawingRelationshipsPath = getDrawingRelationshipsPath(drawingPath);
  const drawingRelationshipsDoc = createRelationshipsDocument();
  const drawingRelationshipsRoot = drawingRelationshipsDoc.documentElement;

  let nextRelationshipIndex = 1;
  let nextShapeId = 1;
  for (const placement of placements) {
    const image = await stampMediaStore.getStampImage(placement.name, placement.size);
    if (!image) {
      continue;
    }

    const relationshipId = `rId${nextRelationshipIndex}`;
    nextRelationshipIndex += 1;

    const relationshipNode = drawingRelationshipsDoc.createElementNS(PACKAGE_RELATIONSHIP_NAMESPACE, "Relationship");
    relationshipNode.setAttribute("Id", relationshipId);
    relationshipNode.setAttribute("Type", EXCEL_IMAGE_RELATIONSHIP_TYPE);
    relationshipNode.setAttribute("Target", `../media/${getZipBaseName(image.mediaPath)}`);
    drawingRelationshipsRoot.append(relationshipNode);

    drawingRoot.append(createDrawingAnchor(drawingDoc, { ...placement, ...image }, relationshipId, nextShapeId));
    nextShapeId += 1;
  }

  workbook.file(drawingPath, serializeXmlDocument(drawingDoc));
  workbook.file(drawingRelationshipsPath, serializeXmlDocument(drawingRelationshipsDoc));
}

function ensureWorkbookView(workbookDoc) {
  let bookViews = workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "bookViews")[0];
  if (!bookViews) {
    bookViews = workbookDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "bookViews");
    const workbookRoot = workbookDoc.documentElement;
    const sheets = workbookDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheets")[0];
    if (sheets) {
      workbookRoot.insertBefore(bookViews, sheets);
    } else {
      workbookRoot.append(bookViews);
    }
  }

  let workbookView = bookViews.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "workbookView")[0];
  if (!workbookView) {
    workbookView = workbookDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "workbookView");
    bookViews.append(workbookView);
  }

  return workbookView;
}

function setWorkbookActiveSheet(workbookDoc, sheetIndex, firstVisibleSheetIndex = 0) {
  const workbookView = ensureWorkbookView(workbookDoc);
  workbookView.setAttribute("activeTab", String(Math.max(0, sheetIndex)));
  workbookView.setAttribute("firstSheet", String(Math.max(0, firstVisibleSheetIndex)));
}

function setWorksheetSelected(worksheetDoc, isSelected) {
  const sheetView = worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheetView")[0];
  if (!sheetView) {
    return;
  }

  if (isSelected) {
    sheetView.setAttribute("tabSelected", "1");
  } else {
    sheetView.removeAttribute("tabSelected");
  }
}

function getWorksheetRowsMap(worksheetDoc) {
  return new Map(
    Array.from(worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "row")).map((row) => [Number(row.getAttribute("r")), row])
  );
}

function ensureWorksheetRow(worksheetDoc, rowsMap, rowNumber) {
  let row = rowsMap.get(rowNumber);
  if (row) {
    return row;
  }

  const sheetData = worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "sheetData")[0];
  row = worksheetDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "row");
  row.setAttribute("r", String(rowNumber));

  const insertBefore = Array.from(sheetData.childNodes)
    .find((candidate) => candidate.nodeType === Node.ELEMENT_NODE && Number(candidate.getAttribute("r")) > rowNumber);
  sheetData.insertBefore(row, insertBefore || null);
  rowsMap.set(rowNumber, row);
  return row;
}

function getRowCells(row) {
  return Array.from(row.childNodes).filter((child) => child.nodeType === Node.ELEMENT_NODE && child.localName === "c");
}

function ensureWorksheetCell(worksheetDoc, rowsMap, cellMap, cellRef) {
  let cell = cellMap.get(cellRef);
  if (cell) {
    return cell;
  }

  const { columnNumber, rowNumber } = parseCellReference(cellRef);
  const row = ensureWorksheetRow(worksheetDoc, rowsMap, rowNumber);
  const rowCells = getRowCells(row);
  const insertBefore = rowCells.find((candidate) => {
    const { columnNumber: candidateColumn } = parseCellReference(candidate.getAttribute("r"));
    return candidateColumn > columnNumber;
  });
  const styleSource = (
    rowCells.find((candidate) => {
      const { columnNumber: candidateColumn } = parseCellReference(candidate.getAttribute("r"));
      return candidateColumn < columnNumber;
    })
    || insertBefore
  );

  cell = worksheetDoc.createElementNS(EXCEL_SHEET_NAMESPACE, "c");
  cell.setAttribute("r", cellRef);
  if (styleSource?.hasAttribute("s")) {
    cell.setAttribute("s", styleSource.getAttribute("s"));
  }

  row.insertBefore(cell, insertBefore || null);
  cellMap.set(cellRef, cell);
  return cell;
}

function buildWorksheetContext(worksheetDoc) {
  const rowsMap = getWorksheetRowsMap(worksheetDoc);
  const cellMap = new Map(
    Array.from(worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "c")).map((cell) => [cell.getAttribute("r"), cell])
  );
  return { worksheetDoc, rowsMap, cellMap };
}

function setWorksheetCellText(worksheetContext, cellRef, value) {
  const cell = ensureWorksheetCell(
    worksheetContext.worksheetDoc,
    worksheetContext.rowsMap,
    worksheetContext.cellMap,
    cellRef
  );

  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  if (!value) {
    cell.removeAttribute("t");
    return;
  }

  const inlineStringEl = cell.ownerDocument.createElementNS(EXCEL_SHEET_NAMESPACE, "is");
  const textEl = cell.ownerDocument.createElementNS(EXCEL_SHEET_NAMESPACE, "t");

  cell.setAttribute("t", "inlineStr");
  textEl.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve");
  textEl.textContent = value;
  inlineStringEl.append(textEl);
  cell.append(inlineStringEl);
}

function setWorksheetCellStyle(worksheetContext, cellRef, styleIndex) {
  const cell = ensureWorksheetCell(
    worksheetContext.worksheetDoc,
    worksheetContext.rowsMap,
    worksheetContext.cellMap,
    cellRef
  );

  if (styleIndex == null || styleIndex === "") {
    cell.removeAttribute("s");
    return;
  }

  cell.setAttribute("s", String(styleIndex));
}

function syncWorksheetMergeCount(mergeCellsRoot) {
  if (!mergeCellsRoot) {
    return;
  }
  const count = Array.from(mergeCellsRoot.childNodes)
    .filter((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === "mergeCell")
    .length;
  mergeCellsRoot.setAttribute("count", String(count));
}

function removeWorksheetMergeRange(worksheetDoc, rangeRef) {
  const mergeCellsRoot = worksheetDoc.getElementsByTagNameNS(EXCEL_SHEET_NAMESPACE, "mergeCells")[0];
  if (!mergeCellsRoot) {
    return;
  }

  Array.from(mergeCellsRoot.childNodes)
    .filter((node) => node.nodeType === Node.ELEMENT_NODE && node.localName === "mergeCell")
    .filter((node) => node.getAttribute("ref") === rangeRef)
    .forEach((node) => node.parentNode?.removeChild(node));

  syncWorksheetMergeCount(mergeCellsRoot);
}

function normalizeExcelManagerStampLayout(worksheetDoc) {
  const worksheetContext = buildWorksheetContext(worksheetDoc);
  const neutralStyleRefs = {
    1: "AB1",
    2: "AB2",
    3: "AB3",
    4: "AB4"
  };

  setWorksheetCellText(worksheetContext, "AC1", "運行管理者");
  setWorksheetCellText(worksheetContext, "AF1", "整備管理者");

  ["AI1:AK1", "AL1:AN1", "AI2:AK4", "AL2:AN4"].forEach((rangeRef) => {
    removeWorksheetMergeRange(worksheetDoc, rangeRef);
  });

  for (let row = 1; row <= 4; row += 1) {
    const styleIndex = worksheetContext.cellMap.get(neutralStyleRefs[row])?.getAttribute("s");
    ["AI", "AJ", "AK", "AL", "AM", "AN"].forEach((columnLabel) => {
      const cellRef = `${columnLabel}${row}`;
      setWorksheetCellText(worksheetContext, cellRef, "");
      if (styleIndex != null) {
        setWorksheetCellStyle(worksheetContext, cellRef, styleIndex);
      }
    });
  }
}

function applyHolidayStylesToWorksheet(worksheetDoc, styleFillVariantMap) {
  return applyHolidayStylesToWorksheetForRecord(worksheetDoc, styleFillVariantMap, {
    year: getSelectedYearMonth().year,
    month: getSelectedYearMonth().month,
    holidayDays: state.holidayDays
  });
}

function applyHolidayStylesToWorksheetForRecord(worksheetDoc, styleFillVariantMap, options = {}) {
  const { cellMap } = buildWorksheetContext(worksheetDoc);
  const { year, month, holidayDays = [] } = options;
  const daysInMonth = getDaysInMonth(year, month);
  const holidaySet = new Set((holidayDays || []).map((day) => Number(day)).filter((day) => day > 0));

  for (let day = 1; day <= EXCEL_DAY_COLUMNS.length; day += 1) {
    const columnLabel = EXCEL_DAY_COLUMNS[day - 1];
    const isCustomHoliday = day <= daysInMonth && holidaySet.has(day);
    const styleKind = day > daysInMonth
      ? "inactive"
      : (isCustomHoliday ? "holiday" : "normal");

    for (let rowNumber = 5; rowNumber <= 30; rowNumber += 1) {
      const cell = cellMap.get(`${columnLabel}${rowNumber}`);
      if (!cell || !cell.hasAttribute("s")) {
        continue;
      }

      const currentStyleIndex = Number(cell.getAttribute("s"));
      const variants = styleFillVariantMap.get(currentStyleIndex);
      const isBottomStampRow = rowNumber >= EXCEL_BOTTOM_STAMP_ROW
        && rowNumber < EXCEL_BOTTOM_STAMP_ROW + EXCEL_BOTTOM_STAMP_ROW_SPAN;
      const nextStyleIndex = variants?.[isBottomStampRow ? "normal" : styleKind];

      if (Number.isInteger(nextStyleIndex)) {
        cell.setAttribute("s", String(nextStyleIndex));
      }
    }
  }
}

function populateExcelWorksheet(worksheetDoc, options = {}) {
  const {
    year = getSelectedYearMonth().year,
    month = getSelectedYearMonth().month,
    checks = state.checks,
    isTemplateLayout = false
  } = options;
  const daysInMonth = getDaysInMonth(year, month);
  const driverIdentity = getDriverIdentity();
  const worksheetContext = buildWorksheetContext(worksheetDoc);

  setWorksheetCellText(worksheetContext, "A3", `令和${getReiwaYear(year)}年${month}月`);

  if (isTemplateLayout) {
    setWorksheetCellText(worksheetContext, "F3", `車番：${vehicleEl.value.trim()}`);
    setWorksheetCellText(worksheetContext, "J3", `運転者名（点検者）：${driverIdentity.displayValue}`);
  } else {
    setWorksheetCellText(worksheetContext, "H3", vehicleEl.value.trim());
    setWorksheetCellText(worksheetContext, "P3", driverIdentity.displayValue);
  }

  setWorksheetCellText(worksheetContext, "AC2", "");
  setWorksheetCellText(worksheetContext, "AF2", "");
  setWorksheetCellText(worksheetContext, "AI2", "");
  setWorksheetCellText(worksheetContext, "AL2", "");

  for (let day = 1; day <= EXCEL_DAY_COLUMNS.length; day += 1) {
    const columnLabel = EXCEL_DAY_COLUMNS[day - 1];
    const dayLabel = day <= daysInMonth ? String(day) : "";
    const weekday = day <= daysInMonth
      ? EXCEL_WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]
      : "";
    setWorksheetCellText(worksheetContext, `${columnLabel}5`, dayLabel);
    setWorksheetCellText(worksheetContext, `${columnLabel}6`, weekday);
    setWorksheetCellText(worksheetContext, `${columnLabel}${EXCEL_BOTTOM_STAMP_ROW}`, "");

    for (let itemIndex = 0; itemIndex < CHECK_FIELD_ORDER.length; itemIndex += 1) {
      const rawValue = day <= daysInMonth
        ? (checks[checkKey(itemIndex, day)] || "")
        : "";
      const displayValue = rawValue === HOLIDAY_MARK ? "" : rawValue;
      setWorksheetCellText(worksheetContext, `${columnLabel}${EXCEL_CHECK_START_ROW + itemIndex}`, displayValue);
    }
  }
}

function createEmptyExcelRecordState() {
  return {
    checks: {},
    operationManager: "",
    maintenanceManager: "",
    maintenanceBottomByDay: {},
    holidayDays: []
  };
}

function sanitizeBottomStampsByDay(bottomStampsByDay = {}, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  return Object.fromEntries(
    Object.entries(bottomStampsByDay || {}).filter(([dayText, value]) => {
      const day = Number(dayText);
      return day >= 1 && day <= daysInMonth && typeof value === "string" && value.trim();
    })
  );
}

function buildExcelRecordStateFromSource(source = {}, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const checks = fromFirestoreChecksByDay(source.checksByDay || {}, daysInMonth);
  const holidayDays = extractHolidayDays(source, checks, daysInMonth)
    .filter((day) => day >= 1 && day <= daysInMonth);

  return {
    checks,
    operationManager: source.operationManager || "",
    maintenanceManager: source.maintenanceManager || "",
    maintenanceBottomByDay: sanitizeBottomStampsByDay(source.maintenanceBottomByDay || {}, year, month),
    holidayDays
  };
}

function buildCurrentExcelRecordState(year, month) {
  syncHolidayChecks();
  return {
    checks: { ...state.checks },
    operationManager: state.operationManager || "",
    maintenanceManager: state.maintenanceManager || "",
    maintenanceBottomByDay: sanitizeBottomStampsByDay(state.maintenanceBottomByDay || {}, year, month),
    holidayDays: mergeHolidayDays(state.holidayDays, state.checks)
      .filter((day) => day >= 1 && day <= getDaysInMonth(year, month))
  };
}

async function buildFiscalYearExcelRecords(vehicle, driver, selectedMonthKey) {
  const { year, month } = getSelectedYearMonth();
  const fiscalMonths = buildFiscalYearMonthEntries(year, month);
  syncCurrentMonthStateToAnnualMap();

  const records = await Promise.all(fiscalMonths.map(async (entry) => {
    const annualRecord = state.recordsByMonth[entry.monthKey];
    if (annualRecord) {
      return {
        ...entry,
        recordState: cloneRecordState(annualRecord, entry.monthKey)
      };
    }

    const record = await findRecord(entry.monthKey, vehicle, driver);
    return {
      ...entry,
      recordState: record
        ? buildExcelRecordStateFromSource(record.data, entry.year, entry.month)
        : createEmptyExcelRecordState()
    };
  }));

  return records;
}

async function downloadExcel() {
  const vehicle = vehicleEl.value.trim();
  const driverIdentity = getDriverIdentity();
  if (!vehicle || !driverIdentity.storageValue) {
    setStatus("Excel保存前に車番・運転者を選択してください", true);
    return;
  }

  syncHolidayChecks();
  setStatus("Excelファイルを作成しています...");

  const [JSZip, templateBuffer] = await Promise.all([
    getJsZipModule(),
    fetchExcelTemplateArrayBuffer()
  ]);
  const workbook = await JSZip.loadAsync(templateBuffer);
  const contentTypesDoc = parseXmlDocument(await workbook.file("[Content_Types].xml").async("string"));
  const stylesDoc = parseXmlDocument(await workbook.file("xl/styles.xml").async("string"));
  const workbookDoc = parseXmlDocument(await workbook.file("xl/workbook.xml").async("string"));
  const workbookRelsDoc = parseXmlDocument(await workbook.file("xl/_rels/workbook.xml.rels").async("string"));
  const selectedMonthKey = state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4);
  const annualSheetTargets = await createAnnualExcelSheetTargets(workbook, workbookDoc, workbookRelsDoc, contentTypesDoc);
  const targetSheet = annualSheetTargets.find((sheetTarget) => sheetTarget.monthKey === selectedMonthKey) || annualSheetTargets[0];
  const targetSheetIndex = annualSheetTargets.findIndex((sheetTarget) => sheetTarget.path === targetSheet?.path);
  const styleFillVariantMap = buildStyleFillVariantMap(stylesDoc);
  const stampMediaStore = await createExcelStampMediaStore(workbook, contentTypesDoc);
  const fiscalYearRecords = await buildFiscalYearExcelRecords(vehicle, driverIdentity.storageValue, selectedMonthKey);

  if (!targetSheet) {
    throw new Error("Excelテンプレート内の出力先シートが見つかりません");
  }

  for (const sheetTarget of annualSheetTargets) {
    const sheetRecord = fiscalYearRecords.find((entry) => entry.sheetName === sheetTarget.sheet.getAttribute("name"));
    const worksheetFile = workbook.file(sheetTarget.path);
    if (!worksheetFile) {
      throw new Error(`Excelテンプレートのワークシートを開けません: ${sheetTarget.path}`);
    }

    const worksheetDoc = parseXmlDocument(await worksheetFile.async("string"));
    const recordState = sheetRecord?.recordState || createEmptyExcelRecordState();
    populateExcelWorksheet(worksheetDoc, {
      year: sheetRecord?.year || getSelectedYearMonth().year,
      month: sheetRecord?.month || getSelectedYearMonth().month,
      checks: recordState.checks,
      isTemplateLayout: false
    });
    applyHolidayStylesToWorksheetForRecord(worksheetDoc, styleFillVariantMap, {
      year: sheetRecord?.year || getSelectedYearMonth().year,
      month: sheetRecord?.month || getSelectedYearMonth().month,
      holidayDays: recordState.holidayDays
    });
    await applyStampImagesToWorksheet(
      workbook,
      worksheetDoc,
      sheetTarget.path,
      getStampPlacementsForRecord(recordState),
      stampMediaStore
    );
    setWorksheetSelected(worksheetDoc, sheetTarget.path === annualSheetTargets[0]?.path);
    workbook.file(sheetTarget.path, serializeXmlDocument(worksheetDoc));
  }

  workbook.file("[Content_Types].xml", serializeXmlDocument(contentTypesDoc));
  workbook.file("xl/styles.xml", serializeXmlDocument(stylesDoc));
  setWorkbookActiveSheet(workbookDoc, 0, 0);
  workbook.file("xl/workbook.xml", serializeXmlDocument(workbookDoc));
  workbook.file("xl/_rels/workbook.xml.rels", serializeXmlDocument(workbookRelsDoc));

  const excelBlob = await workbook.generateAsync({
    type: "blob",
    mimeType: EXCEL_MIME_TYPE
  });

  downloadBlob(excelBlob, buildExcelFileName());
  setStatus("Excelファイルを保存しました");
}

function buildCsvRows() {
  syncHolidayChecks();
  syncMaintenanceRecordsByDay();
  const driverIdentity = getDriverIdentity();

  const rows = [
    CSV_HEADER,
    ["meta", "month", "", state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4)],
    ["meta", "vehicle", "", vehicleEl.value.trim()],
    ["meta", "driver", "", driverIdentity.storageValue],
    ["meta", "driverDisplay", "", driverIdentity.displayValue],
    ["meta", "operationManager", "", state.operationManager],
    ["meta", "maintenanceManager", "", state.maintenanceManager]
  ];

  state.holidayDays
    .slice()
    .sort((left, right) => left - right)
    .forEach((day) => {
      rows.push(["holiday", String(day), "", "1"]);
    });

  const checksByDay = toFirestoreChecksByDay(state.checks);
  Object.entries(checksByDay)
    .sort(([leftDay], [rightDay]) => Number(leftDay) - Number(rightDay))
    .forEach(([day, valuesByField]) => {
      CHECK_FIELD_ORDER.forEach((fieldKey) => {
        const value = valuesByField[fieldKey];
        if (typeof value === "string" && value) {
          rows.push(["check", day, fieldKey, value]);
        }
      });
    });

  Object.entries(state.maintenanceBottomByDay)
    .sort(([leftDay], [rightDay]) => Number(leftDay) - Number(rightDay))
    .forEach(([day, value]) => {
      if (value) {
        rows.push(["bottomStamp", day, "", value]);
      }
    });

  Object.entries(sanitizeMaintenanceRecordsByDay(state.maintenanceRecordsByDay))
    .sort(([leftDay], [rightDay]) => Number(leftDay) - Number(rightDay))
    .forEach(([day, value]) => {
      const normalizedValue = normalizeMaintenanceRecordValue(value);
      if (normalizedValue) {
        rows.push(["maintenanceRecord", day, "", normalizedValue]);
      }
    });

  return rows;
}

function downloadCsv() {
  const csvText = serializeCsv(buildCsvRows());
  const blob = new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8;" });
  const month = state.activeMonthKey || `${getSelectedFiscalYearStart()}年度`;
  const vehicle = sanitizeFileNamePart(vehicleEl.value, "vehicle");
  const driver = sanitizeFileNamePart(stripDriverReading(driverEl.value), "driver");

  downloadBlob(blob, `${month}_${vehicle}_${driver}_inspection.csv`);

  setStatus("CSVファイルを保存しました");
}

function parseImportedCsv(rows) {
  if (!rows.length) {
    throw new Error("CSVにデータがありません");
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeader = headerRow.map((value) => normalizeOptionValue(value));
  if (normalizedHeader.join(",") !== CSV_HEADER.join(",")) {
    throw new Error("このCSVは月次日常点検アプリの形式ではありません");
  }

  const imported = {
    month: state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4),
    vehicle: vehicleEl.value.trim(),
    driver: getDriverIdentity().storageValue,
    checks: {},
    operationManager: "",
    maintenanceManager: "",
    maintenanceBottomByDay: {},
    maintenanceRecordsByDay: {},
    holidayDays: []
  };

  dataRows.forEach((row) => {
    const [recordType = "", dayOrKey = "", fieldKey = "", value = ""] = row;

    if (recordType === "meta") {
      if (dayOrKey === "month" && /^\d{4}-\d{2}$/.test(value)) {
        imported.month = value;
      } else if (dayOrKey === "vehicle") {
        imported.vehicle = value;
      } else if (dayOrKey === "driver") {
        imported.driver = normalizeOptionValue(value);
      } else if (dayOrKey === "driverDisplay" && !imported.driver) {
        imported.driver = normalizeOptionValue(value);
      } else if (dayOrKey === "operationManager") {
        imported.operationManager = value;
      } else if (dayOrKey === "maintenanceManager") {
        imported.maintenanceManager = value;
      }
      return;
    }

    if (recordType === "holiday") {
      const day = Number(dayOrKey);
      if (Number.isInteger(day) && day >= 1) {
        imported.holidayDays.push(day);
      }
      return;
    }

    if (recordType === "bottomStamp") {
      const day = Number(dayOrKey);
      if (Number.isInteger(day) && day >= 1 && value) {
        imported.maintenanceBottomByDay[String(day)] = value;
      }
      return;
    }

    if (recordType === "maintenanceRecord" || recordType === "maintenanceNote") {
      const day = Number(dayOrKey);
      const normalizedValue = normalizeMaintenanceRecordValue(value);
      if (Number.isInteger(day) && day >= 1 && normalizedValue) {
        imported.maintenanceRecordsByDay[String(day)] = normalizedValue;
      }
      return;
    }

    if (recordType === "check") {
      const day = Number(dayOrKey);
      const rowIndex = CHECK_FIELD_INDEX[fieldKey];
      if (Number.isInteger(day) && day >= 1 && Number.isInteger(rowIndex) && value) {
        imported.checks[checkKey(rowIndex, day)] = value;
      }
    }
  });

  imported.holidayDays = mergeHolidayDays(imported.holidayDays, imported.checks);
  return imported;
}

function applyImportedRecord(imported) {
  if (/^\d{4}-\d{2}$/.test(imported.month)) {
    setMonthInputValue(imported.month);
    state.activeMonthKey = imported.month;
  }

  resetAnnualRecordState(state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4));

  rememberDriverStorageValue(imported.driver);
  ensureSelectValue(vehicleEl, imported.vehicle, normalizeVehicleValue);
  ensureSelectValue(driverEl, imported.driver, normalizeDriverDisplayName);

  const daysInMonth = getDaysInSelectedMonth();
  const filteredChecks = {};
  Object.entries(imported.checks).forEach(([key, value]) => {
    const [, dayText] = key.split("_");
    const day = Number(dayText);
    if (day >= 1 && day <= daysInMonth) {
      filteredChecks[key] = value;
    }
  });

  state.checks = filteredChecks;
  state.operationManager = imported.operationManager || "";
  state.maintenanceManager = imported.maintenanceManager || "";
  state.maintenanceBottomByDay = Object.fromEntries(
    Object.entries(imported.maintenanceBottomByDay).filter(([dayText, value]) => {
      const day = Number(dayText);
      return day >= 1 && day <= daysInMonth && Boolean(value);
    })
  );
  state.maintenanceRecordsByDay = Object.fromEntries(
    Object.entries(sanitizeMaintenanceRecordsByDay(imported.maintenanceRecordsByDay)).filter(([dayText]) => {
      const day = Number(dayText);
      return day >= 1 && day <= daysInMonth;
    })
  );
  state.holidayDays = mergeHolidayDays(imported.holidayDays, state.checks).filter((day) => day >= 1 && day <= daysInMonth);

  syncHolidayChecks();
  syncMaintenanceRecordsByDay();
  syncCurrentMonthStateToAnnualMap();
  syncHeaderInfo();
  renderMonthTabs();
  renderDays();
  renderBody();
  renderBottomStampRow();
  setStamp("operationManager", state.operationManager);
  setStamp("maintenanceManager", state.maintenanceManager);
  syncToolbarWidth();
}

async function importCsvFile(file) {
  const text = (await file.text()).replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  const imported = parseImportedCsv(rows);
  applyImportedRecord(imported);
}

function getSaveLocationMessage(month, vehicle, driver) {
  return `保存先: Firestore / ${FIRESTORE_COLLECTION}\n一致キー: ${buildRecordKey(month, vehicle, driver)}`;
}

function matchesVehicleRecord(record, vehicle) {
  const targetKey = normalizeVehicleValue(vehicle);
  if (!targetKey) {
    return false;
  }

  const candidateKeys = new Set(
    [
      record?.vehicle,
      record?.vehicleRaw,
      record?.vehicleDisplay,
      ...(Array.isArray(record?.vehicleAliases) ? record.vehicleAliases : [])
    ]
      .map((value) => normalizeVehicleValue(value))
      .filter(Boolean)
  );

  const normalizedVehicle = String(record?.vehicleNormalized || "").trim();
  if (normalizedVehicle) {
    candidateKeys.add(normalizedVehicle);
  }

  return candidateKeys.has(targetKey);
}

function toFirestoreChecksByDay(checks) {
  const checksByDay = {};
  Object.entries(checks).forEach(([cellKey, value]) => {
    if (!value) return;
    const [rowIndexText, dayText] = cellKey.split("_");
    const rowIndex = Number(rowIndexText);
    const day = String(Number(dayText));
    const fieldKey = CHECK_FIELD_ORDER[rowIndex];
    if (!fieldKey || !day) return;
    if (!checksByDay[day]) {
      checksByDay[day] = {};
    }
    checksByDay[day][fieldKey] = value;
  });
  return checksByDay;
}

function fromFirestoreChecksByDay(checksByDay = {}, daysInMonth = Number.POSITIVE_INFINITY) {
  const checks = {};
  Object.entries(checksByDay).forEach(([dayText, valuesByField]) => {
    const day = Number(dayText);
    if (!day || day > daysInMonth || typeof valuesByField !== "object" || valuesByField === null) return;
    CHECK_FIELD_ORDER.forEach((fieldKey, rowIndex) => {
      const rawValue = valuesByField[fieldKey];
      const normalizedValue = rawValue === "×" ? "☓" : rawValue;
      if (typeof normalizedValue === "string" && normalizedValue && normalizedValue !== HOLIDAY_MARK && CHECK_STATES.includes(normalizedValue)) {
        checks[checkKey(rowIndex, day)] = normalizedValue;
      }
    });
  });
  return checks;
}

function toEpochMillis(value) {
  if (!value) {
    return 0;
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (typeof value.seconds === "number") {
    return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1_000_000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function shouldReplaceLoadedRecord(existingRecord, nextRecord) {
  const existingUpdatedAt = toEpochMillis(existingRecord?.data?.updatedAt);
  const nextUpdatedAt = toEpochMillis(nextRecord?.data?.updatedAt);
  if (nextUpdatedAt !== existingUpdatedAt) {
    return nextUpdatedAt > existingUpdatedAt;
  }

  const existingDocId = String(existingRecord?.id || "");
  const nextDocId = String(nextRecord?.id || "");
  return nextDocId.localeCompare(existingDocId) > 0;
}

function buildFirestoreRecordState(monthKey, record) {
  if (!record) {
    return createEmptyMonthRecordState(monthKey);
  }

  const { year, month } = parseYearMonthKey(monthKey);
  const daysInMonth = getDaysInMonth(year, month);
  const checks = fromFirestoreChecksByDay(record.data.checksByDay, daysInMonth);
  return cloneRecordState({
    month: monthKey,
    checks,
    operationManager: record.data.operationManager || "",
    maintenanceManager: record.data.maintenanceManager || "",
    maintenanceBottomByDay: sanitizeBottomStampsByDay(record.data.maintenanceBottomByDay || {}, year, month),
    maintenanceRecordsByDay: getMaintenanceRecordsByDayFromSource(record.data),
    holidayDays: extractHolidayDays(record.data, checks, daysInMonth),
    loadedDocId: record.id
  }, monthKey);
}

async function deleteMonthRecord(docId) {
  if (!docId) {
    return;
  }
  await ensureAppAuth();
  await deleteDoc(doc(db, FIRESTORE_COLLECTION, docId));
}

async function listRecordsForVehicleAndDriver(vehicle, driver) {
  await ensureAppAuth();
  const recordsRef = collection(db, FIRESTORE_COLLECTION);
  const rawVehicle = normalizeOptionValue(vehicle);
  const normalizedVehicle = normalizeVehicleValue(vehicle);
  const queries = [
    query(recordsRef, where("vehicleNormalized", "==", normalizedVehicle)),
    query(recordsRef, where("vehicle", "==", normalizedVehicle), limit(200)),
    query(recordsRef, where("vehicle", "==", rawVehicle), limit(200))
  ];
  const snapshots = await Promise.all(queries.map((currentQuery) => getDocs(currentQuery)));
  const targetDriverKey = normalizeDriverLookupKey(driver);
  const seenDocIds = new Set();
  const records = [];

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((recordDoc) => {
      if (seenDocIds.has(recordDoc.id)) {
        return;
      }
      seenDocIds.add(recordDoc.id);
      const recordData = recordDoc.data();
      const candidateValues = [
        recordData.driver,
        recordData.driverRaw,
        recordData.driverDisplay,
        ...(Array.isArray(recordData.driverAliases) ? recordData.driverAliases : [])
      ];
      const matchesDriver = candidateValues.some((candidate) => normalizeDriverLookupKey(candidate || "") === targetDriverKey);
      if (!matchesVehicleRecord(recordData, normalizedVehicle) || !matchesDriver) {
        return;
      }
      records.push({
        id: recordDoc.id,
        data: recordData
      });
    });
  });

  return records;
}

async function loadFiscalYearRecordStates(vehicle, driver, monthKey) {
  const { year, month } = parseYearMonthKey(monthKey);
  const fiscalEntries = buildFiscalYearMonthEntries(year, month);
  const fiscalMonthKeys = new Set(fiscalEntries.map((entry) => entry.monthKey));
  const records = await listRecordsForVehicleAndDriver(vehicle, driver);
  const latestByMonth = {};
  const matchedRecordsByMonth = {};

  records.forEach((record) => {
    const recordMonth = String(record.data.month || "");
    if (!fiscalMonthKeys.has(recordMonth)) {
      return;
    }
    if (!matchedRecordsByMonth[recordMonth]) {
      matchedRecordsByMonth[recordMonth] = [];
    }
    matchedRecordsByMonth[recordMonth].push(record);
    if (!latestByMonth[recordMonth] || shouldReplaceLoadedRecord(latestByMonth[recordMonth], record)) {
      latestByMonth[recordMonth] = record;
    }
  });

  Object.entries(matchedRecordsByMonth).forEach(([recordMonth, monthRecords]) => {
    if (monthRecords.length <= 1) {
      return;
    }
    console.warn("Duplicate monthly inspection records detected:", {
      month: recordMonth,
      vehicle,
      driver,
      docIds: monthRecords.map((record) => record.id),
      updatedAt: monthRecords.map((record) => toEpochMillis(record.data?.updatedAt))
    });
  });

  return Object.fromEntries(
    fiscalEntries.map((entry) => [entry.monthKey, buildFirestoreRecordState(entry.monthKey, latestByMonth[entry.monthKey])])
  );
}

async function findRecord(month, vehicle, driver) {
  await ensureAppAuth();
  const recordsRef = collection(db, FIRESTORE_COLLECTION);
  const normalizedVehicle = normalizeVehicleValue(vehicle);
  const recordQuery = query(
    recordsRef,
    where("month", "==", month),
    where("vehicleNormalized", "==", normalizedVehicle),
    where("driver", "==", driver),
    limit(1)
  );
  const snapshot = await getDocs(recordQuery);
  if (snapshot.empty) {
    const fallbackQuery = query(
      recordsRef,
      where("month", "==", month),
      where("vehicle", "==", normalizedVehicle),
      limit(50)
    );
    const fallbackSnapshot = await getDocs(fallbackQuery);
    if (fallbackSnapshot.empty) {
      return null;
    }

    const targetDriverKey = normalizeDriverLookupKey(driver);
    const matchedDoc = fallbackSnapshot.docs.find((recordDoc) => {
      const recordData = recordDoc.data();
      const candidateValues = [
        recordData.driver,
        recordData.driverRaw,
        recordData.driverDisplay,
        ...(Array.isArray(recordData.driverAliases) ? recordData.driverAliases : [])
      ];
      return matchesVehicleRecord(recordData, normalizedVehicle)
        && candidateValues.some((candidate) => normalizeDriverLookupKey(candidate || "") === targetDriverKey);
    });

    if (!matchedDoc) {
      return null;
    }

    return {
      id: matchedDoc.id,
      data: matchedDoc.data()
    };
  }
  const recordDoc = snapshot.docs[0];
  return {
    id: recordDoc.id,
    data: recordDoc.data()
  };
}

async function loadRecord() {
  const month = state.activeMonthKey || formatMonthKey(getSelectedFiscalYearStart(), 4);
  const vehicle = normalizeVehicleValue(vehicleEl.value);
  const driver = getDriverIdentity().storageValue;
  if (!vehicle || !driver) {
    setStatus("読込前に車番・運転者を入力してください", true);
    return;
  }

  const loadedRecordsByMonth = await loadFiscalYearRecordStates(vehicle, driver, month);
  state.recordsByMonth = loadedRecordsByMonth;
  const hasAnyLoadedMonth = Object.values(loadedRecordsByMonth).some((recordState) => monthRecordHasContent(recordState));
  const initialMonth = monthRecordHasContent(loadedRecordsByMonth[month])
    ? month
    : (Object.keys(loadedRecordsByMonth).find((monthKey) => monthRecordHasContent(loadedRecordsByMonth[monthKey])) || month);

  rememberDriverStorageValue(driver);
  switchActiveMonth(initialMonth, { preserveCurrent: false });
  setStatus(hasAnyLoadedMonth ? "年度読込完了" : "年度内に一致データがないため新規入力モードです。");
}

async function saveMonthRecord(monthKey, vehicle, driverIdentity, recordState) {
  const driver = driverIdentity.storageValue;
  const normalizedVehicle = normalizeVehicleValue(vehicle);
  const monthState = cloneRecordState(recordState, monthKey);
  const { year, month } = parseYearMonthKey(monthKey);
  const holidayPayload = buildHolidayPayload(monthState.holidayDays, monthState.checks, getDaysInMonth(year, month));
  const rawDocId = buildRecordKey(monthKey, normalizedVehicle, driverIdentity.storageValue);
  const basePayload = {
    month: monthKey,
    vehicle: normalizedVehicle,
    vehicleRaw: normalizedVehicle,
    vehicleDisplay: normalizedVehicle,
    vehicleAliases: [normalizedVehicle].filter(Boolean),
    vehicleNormalized: normalizeVehicleValue(normalizedVehicle),
    driver,
    driverRaw: driverIdentity.storageValue,
    driverDisplay: driverIdentity.displayValue,
    driverAliases: driverIdentity.aliases,
    driverNormalized: driverIdentity.normalizedKey,
    checksByDay: toFirestoreChecksByDay(monthState.checks),
    operationManager: monthState.operationManager,
    maintenanceManager: monthState.maintenanceManager,
    maintenanceBottomByDay: monthState.maintenanceBottomByDay,
    maintenanceRecordsByDay: sanitizeMaintenanceRecordsByDay(monthState.maintenanceRecordsByDay),
    maintenanceNotesByDay: sanitizeMaintenanceRecordsByDay(monthState.maintenanceRecordsByDay),
    ...holidayPayload,
    updatedAt: serverTimestamp()
  };

  const existingRecord = monthState.loadedDocId
    ? { id: monthState.loadedDocId }
    : await findRecord(monthKey, normalizedVehicle, driver);
  const targetDocId = existingRecord?.id || rawDocId;
  await ensureAppAuth();
  await setDoc(doc(db, FIRESTORE_COLLECTION, targetDocId), basePayload);
  return targetDocId;
}

async function saveRecord() {
  syncCurrentMonthStateToAnnualMap();
  const fiscalEntries = getCurrentFiscalEntries();
  const vehicle = normalizeVehicleValue(vehicleEl.value);
  const driverIdentity = getDriverIdentity();
  const driver = driverIdentity.storageValue;
  if (!vehicle || !driver) {
    setStatus("保存前に車番・運転者を入力してください", true);
    return;
  }

  const saveLocationMessage = `保存先: Firestore / ${FIRESTORE_COLLECTION}\n対象年度: ${fiscalEntries[0]?.monthKey} 〜 ${fiscalEntries[fiscalEntries.length - 1]?.monthKey}\n一致キー: ${vehicle} / ${driver}`;
  const accepted = window.confirm(`保存先を確認してください。\n\n${saveLocationMessage}\n\nこの年度の編集内容を保存しますか？`);
  if (!accepted) {
    setStatus("保存をキャンセルしました");
    return;
  }

  let savedCount = 0;
  let deletedCount = 0;
  for (const entry of fiscalEntries) {
    const monthState = state.recordsByMonth[entry.monthKey] || createEmptyMonthRecordState(entry.monthKey);
    if (!monthRecordHasContent(monthState)) {
      if (monthState.loadedDocId) {
        await deleteMonthRecord(monthState.loadedDocId);
        state.recordsByMonth[entry.monthKey] = createEmptyMonthRecordState(entry.monthKey);
        deletedCount += 1;
      }
      continue;
    }
    const savedDocId = await saveMonthRecord(entry.monthKey, vehicle, driverIdentity, monthState);
    state.recordsByMonth[entry.monthKey] = {
      ...cloneRecordState(monthState, entry.monthKey),
      loadedDocId: savedDocId
    };
    savedCount += 1;
  }

  applyMonthRecordState(state.activeMonthKey, getRecordStateForMonth(state.activeMonthKey));
  setStatus(
    savedCount || deletedCount
      ? `年度保存完了 (保存 ${savedCount}か月 / 削除 ${deletedCount}か月)`
      : "保存対象の月がありません"
  );
}

monthEl.addEventListener("change", () => {
  if (state.suppressMonthInputSync) {
    return;
  }

  const nextMonthKey = formatMonthKey(getSelectedFiscalYearStart(), 4);
  resetAnnualRecordState(nextMonthKey);
  syncHeaderInfo();
  renderMonthTabs();
  renderDays();
  renderBody();
  renderBottomStampRow();
  setStamp("operationManager", "");
  setStamp("maintenanceManager", "");
  syncToolbarWidth();
  setStatus("対象年度を切り替えました。必要に応じて読込してください。");
});
vehicleEl.addEventListener("change", () => {
  resetAnnualRecordState(formatMonthKey(getSelectedFiscalYearStart(), 4));
  syncHeaderInfo();
  renderMonthTabs();
  renderDays();
  renderBody();
  renderBottomStampRow();
  setStamp("operationManager", "");
  setStamp("maintenanceManager", "");
});
driverEl.addEventListener("change", () => {
  resetAnnualRecordState(formatMonthKey(getSelectedFiscalYearStart(), 4));
  syncHeaderInfo();
  renderMonthTabs();
  renderDays();
  renderBody();
  renderBottomStampRow();
  setStamp("operationManager", "");
  setStamp("maintenanceManager", "");
});
window.addEventListener("resize", syncToolbarWidth);

document.getElementById("loadBtn").addEventListener("click", () => {
  loadRecord().catch((err) => setStatus(`読込失敗: ${err.message}`, true));
});

document.getElementById("printBtn").addEventListener("click", () => {
  printSheet();
});

helpBtnEl.addEventListener("click", () => {
  showHelp();
});

document.getElementById("saveBtn").addEventListener("click", () => {
  saveRecord().catch((err) => setStatus(`保存失敗: ${err.message}`, true));
});

document.getElementById("operationManagerSlot").addEventListener("click", () => toggleStamp("operationManager", "岸田"));
document.getElementById("maintenanceManagerSlot").addEventListener("click", () => toggleStamp("maintenanceManager", "若本"));

exportExcelBtnEl.addEventListener("click", () => {
  downloadExcel().catch((error) => {
    setStatus(`Excel保存失敗: ${error.message}`, true);
  });
});

exportCsvBtnEl.addEventListener("click", () => {
  try {
    downloadCsv();
  } catch (error) {
    setStatus(`CSV保存失敗: ${error.message}`, true);
  }
});

importCsvBtnEl.addEventListener("click", () => {
  csvImportInputEl.value = "";
  csvImportInputEl.click();
});

csvImportInputEl.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  importCsvFile(file).catch((error) => {
    setStatus(`CSV読込失敗: ${error.message}`, true);
  });
});

maintenanceNoteSaveBtnEl.addEventListener("click", () => {
  closeMaintenanceNoteDialog(maintenanceNoteInputEl.value);
});

maintenanceNoteCancelBtnEl.addEventListener("click", () => {
  closeMaintenanceNoteDialog(null);
});

maintenanceNoteModalEl.addEventListener("click", (event) => {
  if (event.target === maintenanceNoteModalEl) {
    closeMaintenanceNoteDialog(null);
  }
});

maintenanceNoteInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMaintenanceNoteDialog(null);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    closeMaintenanceNoteDialog(maintenanceNoteInputEl.value);
  }
});

resetAnnualRecordState(formatMonthKey(getSelectedFiscalYearStart(), 4));
syncHeaderInfo();
renderMonthTabs();
renderDays();
renderBody();
renderBottomStampRow();
syncToolbarWidth();
loadReferenceOptions().catch((err) => setStatus(`候補一覧の取得に失敗しました: ${err.message}`, true));



