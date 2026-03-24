(function () {
  "use strict";

  const primaryConfig = Object.freeze({
    apiKey: "AIzaSyCUhbTrb3c5wN3zeJkFHzYvdWtN777hpNk",
    authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
    projectId: "sinyuubuturyuu-86aeb",
    storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
    messagingSenderId: "213947378677",
    appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
    measurementId: "G-F9VYGCTHEV"
  });

  const collections = Object.freeze({
    tireInspection: "tiretenkenhyou",
    dailyInspection: "nichijyoutenkenhyou",
    points: "points",
    directory: "syainmei"
  });

  const directoryDocIds = Object.freeze({
    vehicles: "monthly_tire_company_settings_backup_vehicles_slot1",
    drivers: "monthly_tire_company_settings_backup_drivers_slot1"
  });

  const appNames = Object.freeze({
    directory: "sinyuubuturyuu-directory",
    dailyReference: "reference-app",
    sharedSettingsReference: "shared-settings-reference",
    driverPoints: "driver-points-app"
  });

  window.SINYUUBUTURYUU_FIREBASE_RUNTIME = Object.freeze({
    primaryConfig: primaryConfig,
    directoryConfig: primaryConfig,
    collections: collections,
    directoryDocIds: directoryDocIds,
    appNames: appNames
  });

  window.APP_FIREBASE_CONFIG = primaryConfig;
  window.APP_FIREBASE_SYNC_OPTIONS = Object.freeze({
    enabled: true,
    collection: collections.tireInspection,
    documentPrefix: collections.tireInspection,
    companyCode: "company",
    useAnonymousAuth: true,
    autoFlushIntervalMs: 15000
  });

  window.APP_FIREBASE_DIRECTORY_CONFIG = primaryConfig;
  window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS = Object.freeze({
    enabled: true,
    appName: appNames.directory,
    collection: collections.directory,
    docIds: directoryDocIds,
    useAnonymousAuth: true
  });

  window.DRIVER_POINTS_FIREBASE_CONFIG = primaryConfig;
  window.DRIVER_POINTS_FIREBASE_SETTINGS = Object.freeze({
    appName: appNames.driverPoints,
    useAnonymousAuth: true,
    preferredCollection: collections.points,
    collectionCandidates: [
      collections.points
    ],
    vehicleFieldCandidates: [
      "vehicleNumber",
      "vehicleKey",
      "vehicle",
      "carNumber",
      "truckNumber",
      "vehicleNo"
    ],
    driverFieldCandidates: [
      "driverKey",
      "driver",
      "driverName",
      "driverDisplay",
      "employeeName",
      "staffName",
      "name"
    ],
    pointsFieldCandidates: [
      "totalPoints",
      "dailyInspectionPoints",
      "points",
      "point",
      "grantedPoints",
      "currentPoints",
      "score"
    ],
    updatedAtFieldCandidates: [
      "updatedAt",
      "updated_at",
      "lastUpdatedAt",
      "modifiedAt",
      "createdAt"
    ],
    summaryKindValue: "driver_points_summary",
    docIdPatterns: [
      "{vehicle}__{driver}",
      "{vehicle}_{driver}",
      "{vehicle}-{driver}",
      "{driver}__{vehicle}",
      "{driver}_{vehicle}",
      "{driver}-{vehicle}"
    ]
  });
})();
