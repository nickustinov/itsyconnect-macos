export interface MockApp {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}

export interface MockVersion {
  id: string;
  appId: string;
  versionString: string;
  platform: "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS";
  appVersionState: string;
  createdDate: string;
}

export const MOCK_APPS: MockApp[] = [
  {
    id: "app-001",
    name: "Weatherly",
    bundleId: "com.example.weatherly",
    sku: "WEATHERLY_001",
    primaryLocale: "en-US",
  },
  {
    id: "app-002",
    name: "Taskflow",
    bundleId: "com.example.taskflow",
    sku: "TASKFLOW_001",
    primaryLocale: "en-US",
  },
  {
    id: "app-003",
    name: "Photon Camera",
    bundleId: "com.example.photon",
    sku: "PHOTON_001",
    primaryLocale: "en-GB",
  },
];

export const MOCK_VERSIONS: MockVersion[] = [
  // Weatherly versions
  {
    id: "ver-001",
    appId: "app-001",
    versionString: "2.1.0",
    platform: "IOS",
    appVersionState: "PREPARE_FOR_SUBMISSION",
    createdDate: "2026-02-20T10:00:00Z",
  },
  {
    id: "ver-002",
    appId: "app-001",
    versionString: "2.0.1",
    platform: "IOS",
    appVersionState: "READY_FOR_SALE",
    createdDate: "2026-02-01T10:00:00Z",
  },
  {
    id: "ver-003",
    appId: "app-001",
    versionString: "1.0.0",
    platform: "MAC_OS",
    appVersionState: "READY_FOR_SALE",
    createdDate: "2026-01-15T10:00:00Z",
  },
  // Taskflow versions
  {
    id: "ver-004",
    appId: "app-002",
    versionString: "3.0.0",
    platform: "IOS",
    appVersionState: "IN_REVIEW",
    createdDate: "2026-02-24T10:00:00Z",
  },
  {
    id: "ver-005",
    appId: "app-002",
    versionString: "2.9.0",
    platform: "IOS",
    appVersionState: "READY_FOR_SALE",
    createdDate: "2026-02-10T10:00:00Z",
  },
  {
    id: "ver-006",
    appId: "app-002",
    versionString: "1.2.0",
    platform: "MAC_OS",
    appVersionState: "WAITING_FOR_REVIEW",
    createdDate: "2026-02-22T10:00:00Z",
  },
  {
    id: "ver-007",
    appId: "app-002",
    versionString: "1.0.0",
    platform: "TV_OS",
    appVersionState: "REJECTED",
    createdDate: "2026-02-18T10:00:00Z",
  },
  // Photon Camera versions
  {
    id: "ver-008",
    appId: "app-003",
    versionString: "1.5.0",
    platform: "IOS",
    appVersionState: "PREPARE_FOR_SUBMISSION",
    createdDate: "2026-02-25T10:00:00Z",
  },
  {
    id: "ver-009",
    appId: "app-003",
    versionString: "1.4.2",
    platform: "IOS",
    appVersionState: "READY_FOR_SALE",
    createdDate: "2026-02-12T10:00:00Z",
  },
  {
    id: "ver-010",
    appId: "app-003",
    versionString: "1.0.0",
    platform: "VISION_OS",
    appVersionState: "METADATA_REJECTED",
    createdDate: "2026-02-20T10:00:00Z",
  },
];

export interface MockLocalization {
  id: string;
  versionId: string;
  locale: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  keywords: string | null;
  whatsNew: string | null;
  promotionalText: string | null;
  supportUrl: string | null;
  marketingUrl: string | null;
}

export interface MockBuild {
  id: string;
  versionId: string;
  buildNumber: string;
  uploadedDate: string;
  versionString: string;
  iconUrl: string | null;
}

export const MOCK_BUILDS: MockBuild[] = [
  {
    id: "build-001",
    versionId: "ver-001",
    buildNumber: "142",
    uploadedDate: "2026-02-19T14:30:00Z",
    versionString: "2.1.0",
    iconUrl: null,
  },
  {
    id: "build-002",
    versionId: "ver-002",
    buildNumber: "138",
    uploadedDate: "2026-01-30T10:00:00Z",
    versionString: "2.0.1",
    iconUrl: null,
  },
  {
    id: "build-003",
    versionId: "ver-004",
    buildNumber: "301",
    uploadedDate: "2026-02-23T16:45:00Z",
    versionString: "3.0.0",
    iconUrl: null,
  },
  {
    id: "build-004",
    versionId: "ver-008",
    buildNumber: "87",
    uploadedDate: "2026-02-24T09:15:00Z",
    versionString: "1.5.0",
    iconUrl: null,
  },
  {
    id: "build-005",
    versionId: "ver-003",
    buildNumber: "12",
    uploadedDate: "2026-01-14T11:00:00Z",
    versionString: "1.0.0",
    iconUrl: null,
  },
  {
    id: "build-006",
    versionId: "ver-005",
    buildNumber: "285",
    uploadedDate: "2026-02-09T08:30:00Z",
    versionString: "2.9.0",
    iconUrl: null,
  },
  {
    id: "build-007",
    versionId: "ver-006",
    buildNumber: "44",
    uploadedDate: "2026-02-21T15:20:00Z",
    versionString: "1.2.0",
    iconUrl: null,
  },
  {
    id: "build-008",
    versionId: "ver-007",
    buildNumber: "8",
    uploadedDate: "2026-02-17T12:00:00Z",
    versionString: "1.0.0",
    iconUrl: null,
  },
  {
    id: "build-009",
    versionId: "ver-009",
    buildNumber: "76",
    uploadedDate: "2026-02-11T10:45:00Z",
    versionString: "1.4.2",
    iconUrl: null,
  },
  {
    id: "build-010",
    versionId: "ver-010",
    buildNumber: "5",
    uploadedDate: "2026-02-19T14:00:00Z",
    versionString: "1.0.0",
    iconUrl: null,
  },
];

export const MOCK_LOCALIZATIONS: MockLocalization[] = [
  // ver-001 (Weatherly 2.1.0 iOS)
  {
    id: "loc-001",
    versionId: "ver-001",
    locale: "en-US",
    name: "Weatherly",
    subtitle: "Beautiful weather forecasts",
    description: "Weatherly brings you beautiful, accurate weather forecasts with stunning animations. Check hourly and 10-day forecasts, severe weather alerts, and radar maps – all in one elegant app.\n\nFeatures:\n- Real-time weather conditions and forecasts\n- Interactive radar and satellite maps\n- Severe weather alerts and notifications\n- Air quality index and UV index\n- Multiple location support\n- Beautiful weather animations\n- Apple Watch complication support",
    keywords: "weather,forecast,radar,temperature,alerts,rain,snow,wind,humidity,barometer",
    whatsNew: "What's new\n\n- Auto-refresh weather data in the background\n- New precipitation graph showing hourly rain/snow probability\n- Improved severe weather notifications with custom sound\n- Temperature unit setting to override system locale\n- Widget now shows \"feels like\" temperature\n\nBug fixes\n\n- Fix radar map not loading on first launch\n- Fix incorrect sunrise/sunset times near the poles\n- Fix widget not updating after location change\n- Fix crash when switching between Celsius and Fahrenheit rapidly",
    promotionalText: "Now with live precipitation graphs and smarter weather alerts!",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  {
    id: "loc-002",
    versionId: "ver-001",
    locale: "de-DE",
    name: "Weatherly",
    subtitle: "Schöne Wettervorhersagen",
    description: "Weatherly bietet Ihnen wunderschöne, präzise Wettervorhersagen mit atemberaubenden Animationen. Stündliche und 10-Tage-Vorhersagen, Unwetterwarnungen und Radarkarten – alles in einer eleganten App.",
    keywords: "Wetter,Vorhersage,Radar,Temperatur,Warnungen,Regen,Schnee,Wind",
    whatsNew: "Neu\n\n- Automatische Wetteraktualisierung im Hintergrund\n- Neues Niederschlagsdiagramm\n- Verbesserte Unwettermeldungen\n\nFehlerbehebungen\n\n- Radarkarte lädt jetzt korrekt beim ersten Start\n- Sonnenauf-/untergangszeiten korrigiert",
    promotionalText: "Jetzt mit Live-Niederschlagsgrafiken und intelligenteren Wetterwarnungen!",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  {
    id: "loc-003",
    versionId: "ver-001",
    locale: "ja",
    name: "Weatherly",
    subtitle: "美しい天気予報",
    description: "Weatherlyは美しいアニメーションで正確な天気予報をお届けします。時間ごとの予報、10日間予報、気象警報、レーダーマップ – すべてをひとつのエレガントなアプリで。",
    keywords: "天気,予報,レーダー,気温,警報,雨,雪,風,湿度",
    whatsNew: "新機能\n\n- バックグラウンドでの自動天気更新\n- 新しい降水グラフ\n- 改善された気象通知\n\nバグ修正\n\n- 初回起動時のレーダーマップの読み込みを修正\n- 日の出・日の入り時刻の修正",
    promotionalText: "ライブ降水グラフとスマートな気象警報を搭載！",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  // ver-002 (Weatherly 2.0.1 iOS – Ready for Sale)
  {
    id: "loc-007",
    versionId: "ver-002",
    locale: "en-US",
    name: "Weatherly",
    subtitle: "Beautiful weather forecasts",
    description: "Weatherly brings you beautiful, accurate weather forecasts with stunning animations. Check hourly and 10-day forecasts, severe weather alerts, and radar maps – all in one elegant app.\n\nFeatures:\n- Real-time weather conditions and forecasts\n- Interactive radar and satellite maps\n- Severe weather alerts and notifications\n- Air quality index and UV index\n- Multiple location support\n- Beautiful weather animations\n- Apple Watch complication support",
    keywords: "weather,forecast,radar,temperature,alerts,rain,snow,wind,humidity,barometer",
    whatsNew: "- Improved radar map rendering performance\n- Fix for notification sound not playing on iOS 19\n- Minor UI tweaks and stability improvements",
    promotionalText: "Beautiful weather at a glance – now faster than ever.",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  {
    id: "loc-008",
    versionId: "ver-002",
    locale: "de-DE",
    name: "Weatherly",
    subtitle: "Schöne Wettervorhersagen",
    description: "Weatherly bietet Ihnen wunderschöne, präzise Wettervorhersagen mit atemberaubenden Animationen. Stündliche und 10-Tage-Vorhersagen, Unwetterwarnungen und Radarkarten – alles in einer eleganten App.",
    keywords: "Wetter,Vorhersage,Radar,Temperatur,Warnungen,Regen,Schnee,Wind",
    whatsNew: "- Verbesserte Radarkarten-Darstellung\n- Benachrichtigungston-Problem unter iOS 19 behoben\n- Kleinere UI-Verbesserungen",
    promotionalText: "Schönes Wetter auf einen Blick – jetzt schneller denn je.",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  // ver-003 (Weatherly 1.0.0 macOS – Ready for Sale)
  {
    id: "loc-009",
    versionId: "ver-003",
    locale: "en-US",
    name: "Weatherly",
    subtitle: "Weather on your desktop",
    description: "Weatherly for Mac brings beautiful weather forecasts to your desktop. Check conditions at a glance from the menu bar, or open the full window for detailed hourly and 10-day forecasts, radar maps, and severe weather alerts.",
    keywords: "weather,forecast,radar,mac,menu bar,temperature,alerts,desktop",
    whatsNew: "Initial release of Weatherly for macOS.",
    promotionalText: "Beautiful weather forecasts, now on your Mac.",
    supportUrl: "https://example.com/weatherly/support",
    marketingUrl: "https://example.com/weatherly",
  },
  // ver-004 (Taskflow 3.0.0 iOS)
  {
    id: "loc-004",
    versionId: "ver-004",
    locale: "en-US",
    name: "Taskflow",
    subtitle: "Tasks that adapt to you",
    description: "Taskflow is the task manager that adapts to how you work. Organize projects with kanban boards, set smart reminders, and collaborate with your team in real-time.\n\nFeatures:\n- Kanban boards, lists, and calendar views\n- Smart reminders based on location and time\n- Real-time collaboration\n- File attachments and comments\n- Recurring tasks and templates\n- Siri shortcuts integration",
    keywords: "tasks,todo,kanban,project,management,productivity,reminders,collaborate,team",
    whatsNew: "Taskflow 3.0 – complete redesign!\n\n- All-new interface built with the latest design language\n- Kanban boards now support custom columns\n- New calendar view with drag-and-drop\n- Shared workspaces for team collaboration\n- Import tasks from Reminders and Things 3",
    promotionalText: "Taskflow 3.0 is here – completely redesigned from the ground up.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  {
    id: "loc-005",
    versionId: "ver-004",
    locale: "fr-FR",
    name: "Taskflow",
    subtitle: "Les tâches qui s'adaptent",
    description: "Taskflow est le gestionnaire de tâches qui s'adapte à votre façon de travailler. Organisez vos projets avec des tableaux kanban, définissez des rappels intelligents et collaborez avec votre équipe en temps réel.",
    keywords: "tâches,kanban,projet,gestion,productivité,rappels,collaboration,équipe",
    whatsNew: "Taskflow 3.0 – refonte complète !\n\n- Nouvelle interface entièrement repensée\n- Les tableaux kanban supportent des colonnes personnalisées\n- Nouvelle vue calendrier avec glisser-déposer\n- Espaces de travail partagés\n- Import depuis Rappels et Things 3",
    promotionalText: "Taskflow 3.0 est là – entièrement repensé.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  // ver-005 (Taskflow 2.9.0 iOS – Ready for Sale)
  {
    id: "loc-010",
    versionId: "ver-005",
    locale: "en-US",
    name: "Taskflow",
    subtitle: "Tasks that adapt to you",
    description: "Taskflow is the task manager that adapts to how you work. Organize projects with kanban boards, set smart reminders, and collaborate with your team in real-time.\n\nFeatures:\n- Kanban boards, lists, and calendar views\n- Smart reminders based on location and time\n- Real-time collaboration\n- File attachments and comments\n- Recurring tasks and templates\n- Siri shortcuts integration",
    keywords: "tasks,todo,kanban,project,management,productivity,reminders,collaborate,team",
    whatsNew: "- Quick-add widget for adding tasks from the home screen\n- Improved sync performance for large workspaces\n- Fix for reminders not firing when app is in the background\n- Stability improvements",
    promotionalText: "Add tasks from your home screen with the new quick-add widget.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  {
    id: "loc-011",
    versionId: "ver-005",
    locale: "fr-FR",
    name: "Taskflow",
    subtitle: "Les tâches qui s'adaptent",
    description: "Taskflow est le gestionnaire de tâches qui s'adapte à votre façon de travailler. Organisez vos projets avec des tableaux kanban, définissez des rappels intelligents et collaborez avec votre équipe en temps réel.",
    keywords: "tâches,kanban,projet,gestion,productivité,rappels,collaboration,équipe",
    whatsNew: "- Widget d'ajout rapide depuis l'écran d'accueil\n- Performances de synchronisation améliorées\n- Correction des rappels en arrière-plan\n- Améliorations de stabilité",
    promotionalText: "Ajoutez des tâches depuis l'écran d'accueil avec le nouveau widget.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  // ver-006 (Taskflow 1.2.0 macOS – Waiting for Review)
  {
    id: "loc-012",
    versionId: "ver-006",
    locale: "en-US",
    name: "Taskflow",
    subtitle: "Tasks on your desktop",
    description: "Taskflow for Mac brings your tasks and projects to the desktop. Manage kanban boards, set reminders, and collaborate – all with native macOS integration including menu bar quick-add and keyboard shortcuts.",
    keywords: "tasks,todo,kanban,project,management,mac,productivity,menu bar",
    whatsNew: "- Global keyboard shortcut for quick-add (⌘⇧T)\n- Menu bar item shows today's tasks at a glance\n- Improved drag-and-drop between boards\n- Native macOS share sheet support",
    promotionalText: "Quick-add tasks from anywhere with global keyboard shortcuts.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  // ver-007 (Taskflow 1.0.0 tvOS – Rejected)
  {
    id: "loc-013",
    versionId: "ver-007",
    locale: "en-US",
    name: "Taskflow",
    subtitle: "Tasks on the big screen",
    description: "Taskflow for Apple TV lets you view your tasks and projects on the big screen. Review your day's agenda, check project progress, and mark tasks as complete – all from the comfort of your couch.",
    keywords: "tasks,todo,kanban,project,apple tv,productivity,dashboard",
    whatsNew: "Initial release of Taskflow for tvOS.",
    promotionalText: "Your tasks, on the big screen.",
    supportUrl: "https://example.com/taskflow/support",
    marketingUrl: "https://example.com/taskflow",
  },
  // ver-008 (Photon Camera 1.5.0 iOS)
  {
    id: "loc-006",
    versionId: "ver-008",
    locale: "en-GB",
    name: "Photon Camera",
    subtitle: "Manual controls, simple UI",
    description: "Photon Camera gives you manual controls with the simplicity of a point-and-shoot. Adjust shutter speed, ISO, focus, and white balance with intuitive gestures.\n\nFeatures:\n- Full manual controls (shutter, ISO, focus, WB)\n- RAW and HEIF capture\n- Live histogram and zebra stripes\n- Burst mode up to 30fps\n- Night mode with long exposure",
    keywords: "camera,photo,manual,RAW,HEIF,shutter,ISO,focus,exposure,photography",
    whatsNew: "- New macro mode for close-up photography\n- ProRAW support on iPhone 15 Pro and later\n- Improved night mode processing\n- Focus peaking overlay\n- Export presets for Lightroom and Capture One",
    promotionalText: "Macro mode, ProRAW, and focus peaking – your camera just got serious.",
    supportUrl: "https://example.com/photon/support",
    marketingUrl: "https://example.com/photon",
  },
  // ver-009 (Photon Camera 1.4.2 iOS – Ready for Sale)
  {
    id: "loc-014",
    versionId: "ver-009",
    locale: "en-GB",
    name: "Photon Camera",
    subtitle: "Manual controls, simple UI",
    description: "Photon Camera gives you manual controls with the simplicity of a point-and-shoot. Adjust shutter speed, ISO, focus, and white balance with intuitive gestures.\n\nFeatures:\n- Full manual controls (shutter, ISO, focus, WB)\n- RAW and HEIF capture\n- Live histogram and zebra stripes\n- Burst mode up to 30fps\n- Night mode with long exposure",
    keywords: "camera,photo,manual,RAW,HEIF,shutter,ISO,focus,exposure,photography",
    whatsNew: "- Fix for RAW files not saving on iPhone 16 Pro\n- Improved night mode noise reduction\n- Fixed histogram not updating in real-time\n- Minor UI fixes",
    promotionalText: "Pro camera controls, refined and reliable.",
    supportUrl: "https://example.com/photon/support",
    marketingUrl: "https://example.com/photon",
  },
  // ver-010 (Photon Camera 1.0.0 visionOS – Metadata Rejected)
  {
    id: "loc-015",
    versionId: "ver-010",
    locale: "en-GB",
    name: "Photon Camera",
    subtitle: "Spatial photography controls",
    description: "Photon Camera for Apple Vision Pro lets you compose and capture spatial photos with manual controls. Adjust exposure, white balance, and focus in an immersive viewfinder.\n\nFeatures:\n- Spatial photo capture\n- Manual exposure and white balance\n- Immersive viewfinder with live histogram\n- RAW and HEIF output\n- Quick share to Photos library",
    keywords: "camera,spatial,photo,vision pro,manual,RAW,capture,photography",
    whatsNew: "Initial release of Photon Camera for visionOS.",
    promotionalText: "Spatial photography with full manual controls.",
    supportUrl: "https://example.com/photon/support",
    marketingUrl: "https://example.com/photon",
  },
];

export function getAppVersions(appId: string): MockVersion[] {
  return MOCK_VERSIONS.filter((v) => v.appId === appId);
}

export function getVersion(versionId: string): MockVersion | undefined {
  return MOCK_VERSIONS.find((v) => v.id === versionId);
}

export function getVersionLocalizations(versionId: string): MockLocalization[] {
  return MOCK_LOCALIZATIONS.filter((l) => l.versionId === versionId);
}

export function getVersionBuild(versionId: string): MockBuild | undefined {
  return MOCK_BUILDS.find((b) => b.versionId === versionId);
}

export function getAppPlatforms(appId: string): string[] {
  const versions = getAppVersions(appId);
  return [...new Set(versions.map((v) => v.platform))];
}

export function getVersionsByPlatform(
  appId: string,
  platform: string
): MockVersion[] {
  return MOCK_VERSIONS.filter(
    (v) => v.appId === appId && v.platform === platform
  );
}

/** Returns the first editable version for the app, or the latest version. */
export function getDefaultVersion(appId: string): MockVersion | undefined {
  const versions = getAppVersions(appId);
  return (
    versions.find(
      (v) => v.appVersionState === "PREPARE_FOR_SUBMISSION"
    ) ?? versions[0]
  );
}

export function resolveVersion(
  appId: string,
  versionId: string | null,
): MockVersion | undefined {
  if (versionId) {
    const found = MOCK_VERSIONS.find(
      (v) => v.id === versionId && v.appId === appId,
    );
    if (found) return found;
  }
  return getDefaultVersion(appId);
}
