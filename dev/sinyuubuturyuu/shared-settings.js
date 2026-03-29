(function () {
  "use strict";

  const STORAGE = Object.freeze({
    current: "tire.monthly.current.v1",
    vehicles: "tire.monthly.vehicles.v1",
    drivers: "tire.monthly.drivers.v1",
    truckTypes: "tire.monthly.trucktypes.v1",
    theme: "tire.monthly.theme.v1"
  });

  const TRUCK_TYPES = Object.freeze({
    LOW12: "low12",
    TEN10: "ten10",
    FOURTON6: "fourton6"
  });

  const TRUCK_TYPE_CATALOG = Object.freeze([
    { value: TRUCK_TYPES.LOW12, label: "大型低床" },
    { value: TRUCK_TYPES.TEN10, label: "大型10輪" },
    { value: TRUCK_TYPES.FOURTON6, label: "4トン車" }
  ]);

  const KATAKANA_RE = /[\u30A1-\u30F6]/g;
  const DRIVER_WITH_READING_RE = /^(.*?)[\s　]*[（(]([^（）()]+)[）)]$/;
  const JA_COLLATOR = new Intl.Collator("ja", {
    usage: "sort",
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true
  });

  function safeReadJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function safeWriteJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeVehicleNumber(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, "");
  }

  function normalizeTruckType(type) {
    if (type === TRUCK_TYPES.TEN10) return TRUCK_TYPES.TEN10;
    if (type === TRUCK_TYPES.FOURTON6) return TRUCK_TYPES.FOURTON6;
    return TRUCK_TYPES.LOW12;
  }

  function sortTruckTypes(rows) {
    return TRUCK_TYPE_CATALOG.map((item) => item.value).filter((value) => rows.includes(value));
  }

  function normalizeVehicles(rows) {
    if (!Array.isArray(rows)) return [];
    const uniq = [];
    rows.forEach((item) => {
      const value = normalizeVehicleNumber(item);
      if (!value || uniq.includes(value)) return;
      uniq.push(value);
    });
    return uniq.slice(0, 300);
  }

  function normalizeDriverDisplayName(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, " ");
  }

  function normalizeDriverNameKey(value) {
    return normalizeDriverDisplayName(normalizeDriverName(value)).replace(/\s+/g, "");
  }

  function parseDriverEntry(value) {
    const raw = normalizeText(value);
    if (!raw) return { name: "", reading: "" };
    const legacyMatch = raw.match(DRIVER_WITH_READING_RE);
    if (legacyMatch) {
      const name = normalizeDriverDisplayName(legacyMatch[1]);
      const reading = normalizeText(legacyMatch[2]);
      if (name && reading) return { name, reading };
    }
    const parenMatch = raw.match(/^(.*?)[\s　]*[（(]([^（）()]*)[）)][\s　]*$/);
    if (parenMatch) {
      const name = normalizeDriverDisplayName(parenMatch[1]);
      const reading = normalizeText(parenMatch[2]);
      if (name && reading) return { name, reading };
    }
    return { name: normalizeDriverDisplayName(raw), reading: "" };
  }

  function normalizeDriverName(value) {
    return normalizeDriverDisplayName(parseDriverEntry(value).name);
  }

  function toHiragana(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(KATAKANA_RE, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  function normalizeDriverReading(value) {
    return toHiragana(value).replace(/\s+/g, "");
  }

  function normalizeDriverEntry(value) {
    const parsed = parseDriverEntry(value);
    if (!parsed.name) return "";
    if (!parsed.reading) return parsed.name;
    return `${parsed.name}（${normalizeDriverReading(parsed.reading)}）`;
  }

  function driverSortKey(value) {
    const parsed = parseDriverEntry(value);
    return normalizeDriverReading(parsed.reading || parsed.name);
  }

  function pickPreferredDriverEntry(existingValue, nextValue) {
    if (!existingValue) return nextValue;
    const existing = parseDriverEntry(existingValue);
    const next = parseDriverEntry(nextValue);
    if (Boolean(existing.reading) !== Boolean(next.reading)) {
      return next.reading ? nextValue : existingValue;
    }
    if (/\s/.test(existing.name) !== /\s/.test(next.name)) {
      return /\s/.test(next.name) ? nextValue : existingValue;
    }
    return existingValue;
  }

  function normalizeDrivers(rows) {
    if (!Array.isArray(rows)) return [];
    const unique = new Map();
    rows.forEach((item) => {
      const value = normalizeDriverEntry(item);
      const key = normalizeDriverNameKey(value);
      if (!value || !key) return;
      unique.set(key, pickPreferredDriverEntry(unique.get(key), value));
    });
    return Array.from(unique.values()).sort((left, right) => {
      const keyCompare = JA_COLLATOR.compare(driverSortKey(left), driverSortKey(right));
      if (keyCompare !== 0) return keyCompare;
      return JA_COLLATOR.compare(normalizeDriverName(left), normalizeDriverName(right));
    });
  }

  function normalizeTruckTypes(rows) {
    if (!Array.isArray(rows)) {
      return sortTruckTypes(TRUCK_TYPE_CATALOG.map((item) => item.value));
    }
    const uniq = [];
    rows.forEach((item) => {
      if (!TRUCK_TYPE_CATALOG.some((type) => type.value === item)) return;
      if (!uniq.includes(item)) uniq.push(item);
    });
    const sorted = sortTruckTypes(uniq);
    return sorted.length ? sorted : sortTruckTypes(TRUCK_TYPE_CATALOG.map((item) => item.value));
  }

  function arraysEqual(left, right) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index]);
  }

  function getTheme() {
    const stored = window.localStorage.getItem(STORAGE.theme);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    return "light";
  }

  function readState() {
    const rawCurrent = safeReadJson(STORAGE.current, {});
    return {
      currentRaw: rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {},
      current: {
        driverName: normalizeDriverName(rawCurrent && rawCurrent.driverName),
        vehicleNumber: normalizeVehicleNumber(rawCurrent && rawCurrent.vehicleNumber),
        truckType: normalizeTruckType(rawCurrent && rawCurrent.truckType)
      },
      vehicles: normalizeVehicles(safeReadJson(STORAGE.vehicles, [])),
      drivers: normalizeDrivers(safeReadJson(STORAGE.drivers, [])),
      truckTypes: normalizeTruckTypes(safeReadJson(STORAGE.truckTypes, TRUCK_TYPE_CATALOG.map((item) => item.value))),
      theme: getTheme()
    };
  }

  function writeCurrent(state, patch) {
    const nextRaw = {
      ...state.currentRaw,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    safeWriteJson(STORAGE.current, nextRaw);
  }

  function ensureState() {
    let state = readState();
    let vehicles = state.vehicles.slice();
    let drivers = state.drivers.slice();
    let truckTypes = state.truckTypes.slice();
    const current = { ...state.current };
    let changed = false;

    if (current.vehicleNumber && !vehicles.includes(current.vehicleNumber)) {
      vehicles = [current.vehicleNumber].concat(vehicles.filter((value) => value !== current.vehicleNumber));
      safeWriteJson(STORAGE.vehicles, vehicles);
      changed = true;
    }

    if (current.driverName && !drivers.some((entry) => normalizeDriverNameKey(entry) === normalizeDriverNameKey(current.driverName))) {
      drivers = normalizeDrivers(drivers.concat(current.driverName));
      safeWriteJson(STORAGE.drivers, drivers);
      changed = true;
    }

    if (current.driverName) {
      const matchedDriver = drivers.find((entry) => normalizeDriverNameKey(entry) === normalizeDriverNameKey(current.driverName));
      const matchedName = matchedDriver ? normalizeDriverName(matchedDriver) : "";
      if (matchedName && matchedName !== current.driverName) {
        current.driverName = matchedName;
        changed = true;
      }
    }

    if (!truckTypes.includes(current.truckType)) {
      current.truckType = truckTypes[0] || TRUCK_TYPES.LOW12;
      changed = true;
    }

    if (!current.vehicleNumber && vehicles.length) {
      current.vehicleNumber = vehicles[0];
      changed = true;
    }

    if (!current.driverName && drivers.length) {
      current.driverName = normalizeDriverName(drivers[0]);
      changed = true;
    }

    if (!arraysEqual(state.truckTypes, truckTypes)) {
      safeWriteJson(STORAGE.truckTypes, truckTypes);
      changed = true;
    }

    if (
      state.current.driverName !== current.driverName
      || state.current.vehicleNumber !== current.vehicleNumber
      || state.current.truckType !== current.truckType
    ) {
      writeCurrent(state, current);
      changed = true;
    }

    return changed ? readState() : state;
  }

  function saveVehicles(rows) {
    safeWriteJson(STORAGE.vehicles, normalizeVehicles(rows));
    return ensureState();
  }

  function saveDrivers(rows) {
    safeWriteJson(STORAGE.drivers, normalizeDrivers(rows));
    return ensureState();
  }

  function saveTruckTypes(rows) {
    safeWriteJson(STORAGE.truckTypes, normalizeTruckTypes(rows));
    return ensureState();
  }

  function saveTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    window.localStorage.setItem(STORAGE.theme, next);
    return next;
  }

  function updateCurrent(patch) {
    const state = readState();
    const nextPatch = {};
    if (Object.prototype.hasOwnProperty.call(patch, "driverName")) {
      nextPatch.driverName = normalizeDriverName(patch.driverName);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "vehicleNumber")) {
      nextPatch.vehicleNumber = normalizeVehicleNumber(patch.vehicleNumber);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "truckType")) {
      nextPatch.truckType = normalizeTruckType(patch.truckType);
    }
    writeCurrent(state, nextPatch);
    return ensureState();
  }

  function truckTypeLabel(type) {
    const found = TRUCK_TYPE_CATALOG.find((item) => item.value === type);
    return found ? found.label : TRUCK_TYPE_CATALOG[0].label;
  }

  window.SharedLauncherSettings = Object.freeze({
    STORAGE,
    TRUCK_TYPES,
    TRUCK_TYPE_CATALOG,
    readState,
    ensureState,
    saveVehicles,
    saveDrivers,
    saveTruckTypes,
    saveTheme,
    updateCurrent,
    normalizeDriverName,
    normalizeDriverEntry,
    normalizeDriverReading,
    normalizeVehicleNumber,
    normalizeTruckType,
    normalizeVehicles,
    normalizeDrivers,
    normalizeTruckTypes,
    truckTypeLabel
  });
})();
