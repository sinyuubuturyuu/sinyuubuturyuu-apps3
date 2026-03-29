(function () {
  "use strict";

  window.DRIVER_POINTS_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDdLIx-gZNn3i9LrT3XY6dyyhFXQ8Ogw6A",
    authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
    projectId: "sinyuubuturyuu-dev",
    storageBucket: "sinyuubuturyuu-dev.firebasestorage.app",
    messagingSenderId: "997788842966",
    appId: "1:997788842966:web:e011e7340e2af863c40277"
  };

  window.DRIVER_POINTS_FIREBASE_SETTINGS = {
    appName: "driver-points-app",
    useAnonymousAuth: true,
    preferredCollection: "driver-points",
    collectionCandidates: [
      "driver-points"
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
  };
})();
