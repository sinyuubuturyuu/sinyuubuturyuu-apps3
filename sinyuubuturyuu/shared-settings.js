(function () {
  "use strict";

  const STORAGE = Object.freeze({
    current: "tire.monthly.current.v1",
    vehicles: "tire.monthly.vehicles.v1",
    drivers: "tire.monthly.drivers.v1",
    truckTypes: "tire.monthly.trucktypes.v1",
    theme: "tire.monthly.theme.v1",
    vehicleProfiles: "tire.monthly.vehicle-profiles.v1",
    userProfiles: "tire.monthly.user-profiles.v1"
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

  function normalizeLoginId(value) {
    return normalizeText(value).toLowerCase();
  }

  function normalizeVehicleNumber(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, "");
  }

  function normalizeTruckType(type, fallback = TRUCK_TYPES.LOW12) {
    if (type === TRUCK_TYPES.TEN10) return TRUCK_TYPES.TEN10;
    if (type === TRUCK_TYPES.FOURTON6) return TRUCK_TYPES.FOURTON6;
    if (type === TRUCK_TYPES.LOW12) return TRUCK_TYPES.LOW12;
    return fallback;
  }

  function normalizeCurrentTruckType(type) {
    if (type === TRUCK_TYPES.TEN10) return TRUCK_TYPES.TEN10;
    if (type === TRUCK_TYPES.FOURTON6) return TRUCK_TYPES.FOURTON6;
    if (type === TRUCK_TYPES.LOW12) return TRUCK_TYPES.LOW12;
    return "";
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

  function normalizeVehicleProfile(entry) {
    if (typeof entry === "string") {
      const vehicleNumber = normalizeVehicleNumber(entry);
      if (!vehicleNumber) {
        return null;
      }
      return {
        vehicleNumber,
        truckType: TRUCK_TYPES.LOW12
      };
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const vehicleNumber = normalizeVehicleNumber(entry.vehicleNumber || entry.vehicle || entry.value || entry.carNumber);
    if (!vehicleNumber) {
      return null;
    }

    return {
      vehicleNumber,
      truckType: normalizeTruckType(entry.truckType)
    };
  }

  function normalizeVehicleProfiles(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = new Map();
    rows.forEach((entry) => {
      const profile = normalizeVehicleProfile(entry);
      if (!profile) {
        return;
      }
      unique.set(profile.vehicleNumber, profile);
    });

    return Array.from(unique.values()).sort((left, right) => {
      return JA_COLLATOR.compare(left.vehicleNumber, right.vehicleNumber);
    });
  }

  function buildUserProfileKey(profile) {
    const loginId = normalizeLoginId(profile && profile.loginId);
    if (loginId) {
      return `login:${loginId}`;
    }
    return `name:${normalizeDriverNameKey(profile && profile.driverName)}`;
  }

  function normalizeUserProfile(entry) {
    if (typeof entry === "string") {
      const driverName = normalizeDriverName(entry);
      if (!driverName) {
        return null;
      }
      return {
        loginId: "",
        driverName,
        vehicleNumber: ""
      };
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const loginId = normalizeLoginId(entry.loginId || entry.email || entry.userId);
    const driverName = normalizeDriverName(entry.driverName || entry.driver || entry.name || entry.value);
    const vehicleNumber = normalizeVehicleNumber(entry.vehicleNumber || entry.vehicle || entry.defaultVehicleNumber);
    if (!loginId && !driverName && !vehicleNumber) {
      return null;
    }

    return {
      loginId,
      driverName,
      vehicleNumber
    };
  }

  function normalizeUserProfiles(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = new Map();
    rows.forEach((entry) => {
      const profile = normalizeUserProfile(entry);
      if (!profile || !profile.driverName) {
        return;
      }
      unique.set(buildUserProfileKey(profile), profile);
    });

    return Array.from(unique.values()).sort((left, right) => {
      const driverCompare = JA_COLLATOR.compare(left.driverName, right.driverName);
      if (driverCompare !== 0) {
        return driverCompare;
      }
      return JA_COLLATOR.compare(left.loginId, right.loginId);
    });
  }

  function deriveVehiclesFromProfiles(vehicleProfiles) {
    return normalizeVehicles(vehicleProfiles.map((profile) => profile.vehicleNumber));
  }

  function deriveDriversFromProfiles(userProfiles) {
    return normalizeDrivers(userProfiles.map((profile) => profile.driverName));
  }

  function arraysEqual(left, right) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index]);
  }

  function vehicleProfilesEqual(left, right) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((profile, index) => {
        const next = right[index];
        return next
          && profile.vehicleNumber === next.vehicleNumber
          && profile.truckType === next.truckType;
      });
  }

  function userProfilesEqual(left, right) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((profile, index) => {
        const next = right[index];
        return next
          && profile.loginId === next.loginId
          && profile.driverName === next.driverName
          && profile.vehicleNumber === next.vehicleNumber;
      });
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
    const legacyVehicles = safeReadJson(STORAGE.vehicles, []);
    const legacyDrivers = safeReadJson(STORAGE.drivers, []);
    const rawVehicleProfiles = safeReadJson(STORAGE.vehicleProfiles, null);
    const rawUserProfiles = safeReadJson(STORAGE.userProfiles, null);
    const vehicleProfiles = normalizeVehicleProfiles(rawVehicleProfiles == null ? legacyVehicles : rawVehicleProfiles);
    const userProfiles = normalizeUserProfiles(rawUserProfiles == null ? legacyDrivers : rawUserProfiles);
    return {
      currentRaw: rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {},
      current: {
        loginId: normalizeLoginId(rawCurrent && rawCurrent.loginId),
        driverName: normalizeDriverName(rawCurrent && rawCurrent.driverName),
        vehicleNumber: normalizeVehicleNumber(rawCurrent && rawCurrent.vehicleNumber),
        truckType: normalizeCurrentTruckType(rawCurrent && rawCurrent.truckType)
      },
      vehicleProfiles,
      userProfiles,
      vehicles: deriveVehiclesFromProfiles(vehicleProfiles),
      drivers: deriveDriversFromProfiles(userProfiles),
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

  function getVehicleProfile(vehicleNumber, state) {
    const safeState = state || readState();
    const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
    return safeState.vehicleProfiles.find((profile) => profile.vehicleNumber === normalizedVehicleNumber) || null;
  }

  function getTruckTypeForVehicle(vehicleNumber, state) {
    const profile = getVehicleProfile(vehicleNumber, state);
    return profile ? profile.truckType : "";
  }

  function getUserProfileByLoginId(loginId, state) {
    const safeState = state || readState();
    const normalizedLoginId = normalizeLoginId(loginId);
    if (!normalizedLoginId) {
      return null;
    }
    return safeState.userProfiles.find((profile) => profile.loginId === normalizedLoginId) || null;
  }

  function ensureState() {
    let state = readState();
    let current = { ...state.current };
    let changed = false;

    if (current.driverName && !state.drivers.some((entry) => normalizeDriverNameKey(entry) === normalizeDriverNameKey(current.driverName))) {
      current.driverName = "";
      changed = true;
    }

    if (current.vehicleNumber && !state.vehicles.includes(current.vehicleNumber)) {
      current.vehicleNumber = "";
      current.truckType = "";
      changed = true;
    }

    if (current.vehicleNumber) {
      const linkedTruckType = getTruckTypeForVehicle(current.vehicleNumber, state);
      if (current.truckType !== linkedTruckType) {
        current.truckType = linkedTruckType;
        changed = true;
      }
    } else if (current.truckType) {
      current.truckType = "";
      changed = true;
    }

    if (!arraysEqual(state.truckTypes, normalizeTruckTypes(state.truckTypes))) {
      state = {
        ...state,
        truckTypes: normalizeTruckTypes(state.truckTypes)
      };
      changed = true;
    }

    if (
      state.current.loginId !== current.loginId
      || state.current.driverName !== current.driverName
      || state.current.vehicleNumber !== current.vehicleNumber
      || state.current.truckType !== current.truckType
    ) {
      writeCurrent(state, current);
      changed = true;
    }

    safeWriteJson(STORAGE.vehicleProfiles, state.vehicleProfiles);
    safeWriteJson(STORAGE.userProfiles, state.userProfiles);
    safeWriteJson(STORAGE.vehicles, state.vehicles);
    safeWriteJson(STORAGE.drivers, state.drivers);
    safeWriteJson(STORAGE.truckTypes, state.truckTypes);

    return changed ? readState() : state;
  }

  function saveVehicleProfiles(rows) {
    safeWriteJson(STORAGE.vehicleProfiles, normalizeVehicleProfiles(rows));
    return ensureState();
  }

  function saveUserProfiles(rows) {
    safeWriteJson(STORAGE.userProfiles, normalizeUserProfiles(rows));
    return ensureState();
  }

  function saveReferenceProfiles(profiles) {
    if (profiles && Object.prototype.hasOwnProperty.call(profiles, "vehicleProfiles")) {
      safeWriteJson(STORAGE.vehicleProfiles, normalizeVehicleProfiles(profiles.vehicleProfiles));
    }
    if (profiles && Object.prototype.hasOwnProperty.call(profiles, "userProfiles")) {
      safeWriteJson(STORAGE.userProfiles, normalizeUserProfiles(profiles.userProfiles));
    }
    return ensureState();
  }

  function saveVehicles(rows) {
    const state = ensureState();
    const existingProfiles = new Map(state.vehicleProfiles.map((profile) => [profile.vehicleNumber, profile]));
    return saveVehicleProfiles(
      normalizeVehicles(rows).map((vehicleNumber) => {
        return existingProfiles.get(vehicleNumber) || {
          vehicleNumber,
          truckType: TRUCK_TYPES.LOW12
        };
      })
    );
  }

  function saveDrivers(rows) {
    const state = ensureState();
    const existingProfiles = new Map(state.userProfiles.map((profile) => [normalizeDriverNameKey(profile.driverName), profile]));
    return saveUserProfiles(
      normalizeDrivers(rows).map((driverName) => {
        return existingProfiles.get(normalizeDriverNameKey(driverName)) || {
          loginId: "",
          driverName: normalizeDriverName(driverName),
          vehicleNumber: ""
        };
      })
    );
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
    if (Object.prototype.hasOwnProperty.call(patch, "loginId")) {
      nextPatch.loginId = normalizeLoginId(patch.loginId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "driverName")) {
      nextPatch.driverName = normalizeDriverName(patch.driverName);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "vehicleNumber")) {
      const nextVehicleNumber = normalizeVehicleNumber(patch.vehicleNumber);
      nextPatch.vehicleNumber = nextVehicleNumber;
      if (!Object.prototype.hasOwnProperty.call(patch, "truckType")) {
        nextPatch.truckType = nextVehicleNumber ? getTruckTypeForVehicle(nextVehicleNumber, state) : "";
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "truckType")) {
      nextPatch.truckType = normalizeCurrentTruckType(patch.truckType);
    }
    writeCurrent(state, nextPatch);
    return ensureState();
  }

  function applyLoginAssignment(loginId) {
    const state = ensureState();
    const normalizedLoginId = normalizeLoginId(loginId);
    const userProfile = getUserProfileByLoginId(normalizedLoginId, state);
    const vehicleNumber = userProfile ? userProfile.vehicleNumber : "";
    writeCurrent(state, {
      loginId: normalizedLoginId,
      driverName: userProfile ? userProfile.driverName : "",
      vehicleNumber: vehicleNumber,
      truckType: vehicleNumber ? getTruckTypeForVehicle(vehicleNumber, state) : ""
    });
    return ensureState();
  }

  function truckTypeLabel(type) {
    const found = TRUCK_TYPE_CATALOG.find((item) => item.value === type);
    return found ? found.label : "未選択";
  }

  window.SharedLauncherSettings = Object.freeze({
    STORAGE,
    TRUCK_TYPES,
    TRUCK_TYPE_CATALOG,
    readState,
    ensureState,
    saveVehicles,
    saveDrivers,
    saveVehicleProfiles,
    saveUserProfiles,
    saveReferenceProfiles,
    saveTruckTypes,
    saveTheme,
    updateCurrent,
    applyLoginAssignment,
    getVehicleProfile,
    getTruckTypeForVehicle,
    getUserProfileByLoginId,
    buildUserProfileKey,
    normalizeLoginId,
    normalizeDriverName,
    normalizeDriverEntry,
    normalizeDriverReading,
    normalizeVehicleNumber,
    normalizeTruckType,
    normalizeVehicles,
    normalizeDrivers,
    normalizeVehicleProfiles,
    normalizeUserProfiles,
    normalizeCurrentTruckType,
    truckTypeLabel
  });
})();
