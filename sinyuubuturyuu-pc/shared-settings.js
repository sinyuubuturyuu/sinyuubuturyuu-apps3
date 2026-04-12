(function () {
  "use strict";

  const STORAGE = Object.freeze({
    vehicles: "tire.monthly.vehicles.v1",
    drivers: "tire.monthly.drivers.v1",
    driverReadings: "tire.monthly.driver-readings.v1",
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

  const JA_COLLATOR = new Intl.Collator("ja", {
    usage: "sort",
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true
  });
  const KATAKANA_RE = /[\u30A1-\u30F6]/g;
  const DRIVER_WITH_READING_RE = /^(.*?)[\s　]*[（(]([^（）()]+)[）)]$/;

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeLoginId(value) {
    return normalizeText(value).toLowerCase();
  }

  function normalizeVehicleNumber(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, "");
  }

  function normalizeTruckType(value, fallback = TRUCK_TYPES.LOW12) {
    if (value === TRUCK_TYPES.TEN10) return TRUCK_TYPES.TEN10;
    if (value === TRUCK_TYPES.FOURTON6) return TRUCK_TYPES.FOURTON6;
    if (value === TRUCK_TYPES.LOW12) return TRUCK_TYPES.LOW12;
    return fallback;
  }

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
    if (!raw) {
      return { name: "", reading: "" };
    }

    const match = raw.match(DRIVER_WITH_READING_RE);
    if (match) {
      return {
        name: normalizeDriverDisplayName(match[1]) || normalizeDriverDisplayName(raw),
        reading: normalizeText(match[2])
      };
    }

    return { name: normalizeDriverDisplayName(raw), reading: "" };
  }

  function normalizeDriverName(value) {
    return normalizeDriverDisplayName(parseDriverEntry(value).name);
  }

  function toHiragana(value) {
    return normalizeText(value)
      .normalize("NFKC")
      .replace(KATAKANA_RE, function (char) {
        return String.fromCharCode(char.charCodeAt(0) - 0x60);
      })
      .replace(/\s+/g, "");
  }

  function normalizeDriverReading(value) {
    return toHiragana(value);
  }

  function normalizeDriverEntry(value) {
    const parsed = parseDriverEntry(value);
    if (!parsed.name) {
      return "";
    }
    if (!parsed.reading) {
      return parsed.name;
    }
    return parsed.name + "（" + normalizeDriverReading(parsed.reading) + "）";
  }

  function driverSortKey(value) {
    const parsed = parseDriverEntry(value);
    return normalizeDriverReading(parsed.reading || parsed.name);
  }

  function pickPreferredDriverEntry(existingValue, nextValue) {
    if (!existingValue) {
      return nextValue;
    }

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

  function normalizeVehicles(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = [];
    rows.forEach(function (item) {
      const value = normalizeVehicleNumber(item);
      if (!value || unique.includes(value)) {
        return;
      }
      unique.push(value);
    });

    return unique.sort(function (left, right) {
      return JA_COLLATOR.compare(left, right);
    });
  }

  function normalizeDrivers(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = new Map();
    rows.forEach(function (item) {
      const value = normalizeDriverEntry(item);
      const key = normalizeDriverNameKey(value);
      if (!value || !key) {
        return;
      }
      unique.set(key, pickPreferredDriverEntry(unique.get(key), value));
    });

    return Array.from(unique.values()).sort(function (left, right) {
      const keyResult = JA_COLLATOR.compare(driverSortKey(left), driverSortKey(right));
      if (keyResult !== 0) {
        return keyResult;
      }
      return JA_COLLATOR.compare(normalizeDriverName(left), normalizeDriverName(right));
    });
  }

  function normalizeVehicleProfile(entry) {
    if (typeof entry === "string") {
      const vehicleNumber = normalizeVehicleNumber(entry);
      if (!vehicleNumber) {
        return null;
      }
      return {
        vehicleNumber: vehicleNumber,
        truckType: TRUCK_TYPES.LOW12
      };
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const vehicleNumber = normalizeVehicleNumber(entry.vehicleNumber || entry.value || entry.vehicle || entry.carNumber);
    if (!vehicleNumber) {
      return null;
    }

    return {
      vehicleNumber: vehicleNumber,
      truckType: normalizeTruckType(entry.truckType)
    };
  }

  function normalizeVehicleProfiles(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = new Map();
    rows.forEach(function (entry) {
      const profile = normalizeVehicleProfile(entry);
      if (!profile) {
        return;
      }
      unique.set(profile.vehicleNumber, profile);
    });

    return Array.from(unique.values()).sort(function (left, right) {
      return JA_COLLATOR.compare(left.vehicleNumber, right.vehicleNumber);
    });
  }

  function buildUserProfileKey(profile) {
    const loginId = normalizeLoginId(profile && profile.loginId);
    if (loginId) {
      return "login:" + loginId;
    }
    return "name:" + normalizeDriverNameKey(profile && profile.driverName);
  }

  function formatDriverProfileEntry(profile) {
    if (!profile) {
      return "";
    }
    return normalizeDriverEntry(
      profile.driverReading
        ? (profile.driverName + "（" + profile.driverReading + "）")
        : profile.driverName
    );
  }

  function normalizeUserProfile(entry) {
    if (typeof entry === "string") {
      const parsed = parseDriverEntry(entry);
      const driverName = normalizeDriverName(parsed.name || entry);
      if (!driverName) {
        return null;
      }
      return {
        loginId: "",
        driverName: driverName,
        driverReading: normalizeDriverReading(parsed.reading),
        vehicleNumber: ""
      };
    }

    if (!entry || typeof entry !== "object") {
      return null;
    }

    const loginId = normalizeLoginId(entry.loginId || entry.email || entry.userId);
    const rawDriverName = entry.driverName || entry.name || entry.driver || entry.value;
    const parsed = parseDriverEntry(rawDriverName);
    const driverName = normalizeDriverName(rawDriverName);
    const driverReading = normalizeDriverReading(entry.driverReading || entry.reading || parsed.reading);
    const vehicleNumber = normalizeVehicleNumber(entry.vehicleNumber || entry.vehicle || entry.defaultVehicleNumber);
    if (!loginId && !driverName && !vehicleNumber) {
      return null;
    }

    return {
      loginId: loginId,
      driverName: driverName,
      driverReading: driverReading,
      vehicleNumber: vehicleNumber
    };
  }

  function normalizeUserProfiles(rows) {
    if (!Array.isArray(rows)) {
      return [];
    }

    const unique = new Map();
    rows.forEach(function (entry) {
      const profile = normalizeUserProfile(entry);
      if (!profile || !profile.driverName) {
        return;
      }
      unique.set(buildUserProfileKey(profile), profile);
    });

    return Array.from(unique.values()).sort(function (left, right) {
      const driverCompare = JA_COLLATOR.compare(
        driverSortKey(formatDriverProfileEntry(left)),
        driverSortKey(formatDriverProfileEntry(right))
      );
      if (driverCompare !== 0) {
        return driverCompare;
      }
      const nameCompare = JA_COLLATOR.compare(left.driverName, right.driverName);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return JA_COLLATOR.compare(left.loginId, right.loginId);
    });
  }

  function deriveVehiclesFromProfiles(vehicleProfiles) {
    return normalizeVehicles(vehicleProfiles.map(function (profile) {
      return profile.vehicleNumber;
    }));
  }

  function deriveDriversFromProfiles(userProfiles) {
    return normalizeDrivers(userProfiles.map(function (profile) {
      return formatDriverProfileEntry(profile);
    }));
  }

  function mergeLegacyDriverReadings(userProfiles, legacyDrivers) {
    const legacyMap = new Map();
    normalizeDrivers(legacyDrivers).forEach(function (entry) {
      const key = normalizeDriverNameKey(entry);
      const reading = normalizeDriverReading(parseDriverEntry(entry).reading);
      if (key && reading) {
        legacyMap.set(key, reading);
      }
    });

    return userProfiles.map(function (profile) {
      if (profile.driverReading) {
        return profile;
      }
      const reading = legacyMap.get(normalizeDriverNameKey(profile.driverName)) || "";
      return reading
        ? { ...profile, driverReading: reading }
        : profile;
    });
  }

  function normalizeStoredDriverReadings(source) {
    if (!source || typeof source !== "object") {
      return new Map();
    }

    const readingMap = new Map();
    Object.keys(source).forEach(function (key) {
      const normalizedKey = normalizeText(key);
      const reading = normalizeDriverReading(source[key]);
      if (!normalizedKey || !reading) {
        return;
      }
      readingMap.set(normalizedKey, reading);
    });
    return readingMap;
  }

  function deriveDriverReadings(userProfiles) {
    return userProfiles.reduce(function (result, profile) {
      const reading = normalizeDriverReading(profile && profile.driverReading);
      const profileKey = buildUserProfileKey(profile);
      const nameKey = normalizeDriverNameKey(profile && profile.driverName);
      if (!reading) {
        return result;
      }
      if (profileKey) {
        result[profileKey] = reading;
      }
      if (nameKey) {
        result["name:" + nameKey] = reading;
      }
      return result;
    }, {});
  }

  function mergeStoredDriverReadings(userProfiles, storedReadings) {
    return userProfiles.map(function (profile) {
      if (profile.driverReading) {
        return profile;
      }

      const profileKey = buildUserProfileKey(profile);
      const nameKey = normalizeDriverNameKey(profile.driverName);
      const reading = storedReadings.get(profileKey)
        || storedReadings.get("name:" + nameKey)
        || storedReadings.get(nameKey)
        || "";

      return reading
        ? { ...profile, driverReading: reading }
        : profile;
    });
  }

  function readState() {
    const legacyVehicles = safeReadJson(STORAGE.vehicles, []);
    const legacyDrivers = safeReadJson(STORAGE.drivers, []);
    const storedDriverReadings = normalizeStoredDriverReadings(safeReadJson(STORAGE.driverReadings, null));
    const rawVehicleProfiles = safeReadJson(STORAGE.vehicleProfiles, null);
    const rawUserProfiles = safeReadJson(STORAGE.userProfiles, null);
    const vehicleProfiles = normalizeVehicleProfiles(rawVehicleProfiles == null ? legacyVehicles : rawVehicleProfiles);
    const userProfiles = mergeLegacyDriverReadings(
      mergeStoredDriverReadings(
        normalizeUserProfiles(rawUserProfiles == null ? legacyDrivers : rawUserProfiles),
        storedDriverReadings
      ),
      legacyDrivers
    );

    return {
      vehicleProfiles: vehicleProfiles,
      userProfiles: userProfiles,
      vehicles: deriveVehiclesFromProfiles(vehicleProfiles),
      drivers: deriveDriversFromProfiles(userProfiles)
    };
  }

  function ensureState() {
    const state = readState();
    safeWriteJson(STORAGE.vehicleProfiles, state.vehicleProfiles);
    safeWriteJson(STORAGE.userProfiles, state.userProfiles);
    safeWriteJson(STORAGE.vehicles, state.vehicles);
    safeWriteJson(STORAGE.drivers, state.drivers);
    safeWriteJson(STORAGE.driverReadings, deriveDriverReadings(state.userProfiles));
    return state;
  }

  function saveVehicleProfiles(rows) {
    safeWriteJson(STORAGE.vehicleProfiles, normalizeVehicleProfiles(rows));
    return ensureState();
  }

  function saveUserProfiles(rows) {
    safeWriteJson(STORAGE.userProfiles, normalizeUserProfiles(rows));
    return ensureState();
  }

  function saveVehicles(rows) {
    const state = ensureState();
    const existingProfiles = new Map(state.vehicleProfiles.map(function (profile) {
      return [profile.vehicleNumber, profile];
    }));

    return saveVehicleProfiles(
      normalizeVehicles(rows).map(function (vehicleNumber) {
        return existingProfiles.get(vehicleNumber) || {
          vehicleNumber: vehicleNumber,
          truckType: TRUCK_TYPES.LOW12
        };
      })
    );
  }

  function saveDrivers(rows) {
    const state = ensureState();
    const existingProfiles = new Map(state.userProfiles.map(function (profile) {
      return [normalizeDriverNameKey(profile.driverName), profile];
    }));

    return saveUserProfiles(
      normalizeDrivers(rows).map(function (driverName) {
        const existing = existingProfiles.get(normalizeDriverNameKey(driverName));
        return existing || {
          loginId: "",
          driverName: normalizeDriverName(driverName),
          driverReading: normalizeDriverReading(parseDriverEntry(driverName).reading),
          vehicleNumber: ""
        };
      })
    );
  }

  function addVehicle(value, truckType) {
    const state = ensureState();
    const vehicleNumber = normalizeVehicleNumber(value);
    if (!vehicleNumber) {
      return state;
    }

    const nextProfiles = state.vehicleProfiles.filter(function (profile) {
      return profile.vehicleNumber !== vehicleNumber;
    });
    nextProfiles.push({
      vehicleNumber: vehicleNumber,
      truckType: normalizeTruckType(truckType)
    });
    return saveVehicleProfiles(nextProfiles);
  }

  function addDriver(name, loginId, vehicleNumber, driverReading) {
    const state = ensureState();
    const driverName = normalizeDriverName(name);
    if (!driverName) {
      return state;
    }

    const nextProfile = {
      loginId: normalizeLoginId(loginId),
      driverName: driverName,
      driverReading: normalizeDriverReading(driverReading),
      vehicleNumber: normalizeVehicleNumber(vehicleNumber)
    };
    const nextProfiles = state.userProfiles.filter(function (profile) {
      return buildUserProfileKey(profile) !== buildUserProfileKey(nextProfile);
    });
    nextProfiles.push(nextProfile);
    return saveUserProfiles(nextProfiles);
  }

  function getVehicleProfile(vehicleNumber, state) {
    const safeState = state || ensureState();
    const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);
    return safeState.vehicleProfiles.find(function (profile) {
      return profile.vehicleNumber === normalizedVehicleNumber;
    }) || null;
  }

  function getTruckTypeForVehicle(vehicleNumber, state) {
    const profile = getVehicleProfile(vehicleNumber, state);
    return profile ? profile.truckType : "";
  }

  function getUserProfileByLoginId(loginId, state) {
    const safeState = state || ensureState();
    const normalizedLoginId = normalizeLoginId(loginId);
    if (!normalizedLoginId) {
      return null;
    }
    return safeState.userProfiles.find(function (profile) {
      return profile.loginId === normalizedLoginId;
    }) || null;
  }

  function truckTypeLabel(type) {
    const found = TRUCK_TYPE_CATALOG.find(function (item) {
      return item.value === type;
    });
    return found ? found.label : "未設定";
  }

  window.SharedAppSettings = Object.freeze({
    STORAGE: STORAGE,
    TRUCK_TYPES: TRUCK_TYPES,
    TRUCK_TYPE_CATALOG: TRUCK_TYPE_CATALOG,
    readState: readState,
    ensureState: ensureState,
    saveVehicles: saveVehicles,
    saveDrivers: saveDrivers,
    saveVehicleProfiles: saveVehicleProfiles,
    saveUserProfiles: saveUserProfiles,
    addVehicle: addVehicle,
    addDriver: addDriver,
    getVehicleProfile: getVehicleProfile,
    getTruckTypeForVehicle: getTruckTypeForVehicle,
    getUserProfileByLoginId: getUserProfileByLoginId,
    buildUserProfileKey: buildUserProfileKey,
    formatDriverProfileEntry: formatDriverProfileEntry,
    normalizeText: normalizeText,
    normalizeLoginId: normalizeLoginId,
    normalizeVehicleNumber: normalizeVehicleNumber,
    normalizeVehicles: normalizeVehicles,
    normalizeDrivers: normalizeDrivers,
    normalizeDriverName: normalizeDriverName,
    normalizeDriverEntry: normalizeDriverEntry,
    normalizeDriverReading: normalizeDriverReading,
    normalizeTruckType: normalizeTruckType,
    normalizeVehicleProfiles: normalizeVehicleProfiles,
    normalizeUserProfiles: normalizeUserProfiles,
    truckTypeLabel: truckTypeLabel
  });
})();
