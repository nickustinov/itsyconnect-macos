export const DISPLAY_TYPE_LABELS: Record<string, string> = {
  // iPhone
  APP_IPHONE_67: 'iPhone 6.7"',
  APP_IPHONE_61: 'iPhone 6.1"',
  APP_IPHONE_65: 'iPhone 6.5"',
  APP_IPHONE_58: 'iPhone 5.8"',
  APP_IPHONE_55: 'iPhone 5.5"',
  APP_IPHONE_47: 'iPhone 4.7"',
  APP_IPHONE_40: 'iPhone 4"',
  APP_IPHONE_35: 'iPhone 3.5"',
  // iPad
  APP_IPAD_PRO_3GEN_129: 'iPad Pro 12.9"',
  APP_IPAD_PRO_3GEN_11: 'iPad Pro 11"',
  APP_IPAD_PRO_129: 'iPad Pro 12.9" (2nd)',
  APP_IPAD_105: 'iPad 10.5"',
  APP_IPAD_97: 'iPad 9.7"',
  // Apple Watch
  APP_WATCH_ULTRA: "Apple Watch Ultra",
  APP_WATCH_SERIES_10: "Apple Watch Series 10",
  APP_WATCH_SERIES_7: "Apple Watch Series 7",
  APP_WATCH_SERIES_4: "Apple Watch Series 4",
  APP_WATCH_SERIES_3: "Apple Watch Series 3",
  // Other
  APP_DESKTOP: "Mac",
  APP_APPLE_TV: "Apple TV",
  APP_APPLE_VISION_PRO: "Apple Vision Pro",
  // iMessage – iPhone
  IMESSAGE_APP_IPHONE_67: 'iMessage iPhone 6.7"',
  IMESSAGE_APP_IPHONE_65: 'iMessage iPhone 6.5"',
  IMESSAGE_APP_IPHONE_61: 'iMessage iPhone 6.1"',
  IMESSAGE_APP_IPHONE_58: 'iMessage iPhone 5.8"',
  IMESSAGE_APP_IPHONE_55: 'iMessage iPhone 5.5"',
  IMESSAGE_APP_IPHONE_47: 'iMessage iPhone 4.7"',
  IMESSAGE_APP_IPHONE_40: 'iMessage iPhone 4"',
  // iMessage – iPad
  IMESSAGE_APP_IPAD_PRO_3GEN_129: 'iMessage iPad Pro 12.9"',
  IMESSAGE_APP_IPAD_PRO_3GEN_11: 'iMessage iPad Pro 11"',
  IMESSAGE_APP_IPAD_PRO_129: 'iMessage iPad Pro 12.9" (2nd)',
  IMESSAGE_APP_IPAD_105: 'iMessage iPad 10.5"',
  IMESSAGE_APP_IPAD_97: 'iMessage iPad 9.7"',
};

/** Primary portrait resolution for each display type (width × height). */
export const DISPLAY_TYPE_SIZES: Record<string, string> = {
  // iPhone
  APP_IPHONE_67: "1290 × 2796",
  APP_IPHONE_61: "1170 × 2532",
  APP_IPHONE_65: "1284 × 2778",
  APP_IPHONE_58: "1125 × 2436",
  APP_IPHONE_55: "1242 × 2208",
  APP_IPHONE_47: "750 × 1334",
  APP_IPHONE_40: "640 × 1136",
  APP_IPHONE_35: "640 × 960",
  // iPad
  APP_IPAD_PRO_3GEN_129: "2048 × 2732",
  APP_IPAD_PRO_3GEN_11: "1668 × 2388",
  APP_IPAD_PRO_129: "2048 × 2732",
  APP_IPAD_105: "1668 × 2224",
  APP_IPAD_97: "1536 × 2048",
  // Apple Watch
  APP_WATCH_ULTRA: "410 × 502",
  APP_WATCH_SERIES_10: "416 × 496",
  APP_WATCH_SERIES_7: "396 × 484",
  APP_WATCH_SERIES_4: "368 × 448",
  APP_WATCH_SERIES_3: "312 × 390",
  // Other
  APP_DESKTOP: "2880 × 1800",
  APP_APPLE_TV: "1920 × 1080",
  APP_APPLE_VISION_PRO: "3840 × 2160",
};

/** Consistent display order for screenshot sets. Types not listed sort to end alphabetically. */
export const DISPLAY_TYPE_ORDER: string[] = [
  // iPhone
  "APP_IPHONE_67",
  "APP_IPHONE_61",
  "APP_IPHONE_65",
  "APP_IPHONE_58",
  "APP_IPHONE_55",
  "APP_IPHONE_47",
  "APP_IPHONE_40",
  "APP_IPHONE_35",
  // iPad
  "APP_IPAD_PRO_3GEN_129",
  "APP_IPAD_PRO_3GEN_11",
  "APP_IPAD_PRO_129",
  "APP_IPAD_105",
  "APP_IPAD_97",
  // Apple Watch
  "APP_WATCH_ULTRA",
  "APP_WATCH_SERIES_10",
  "APP_WATCH_SERIES_7",
  "APP_WATCH_SERIES_4",
  "APP_WATCH_SERIES_3",
  // Other
  "APP_DESKTOP",
  "APP_APPLE_TV",
  "APP_APPLE_VISION_PRO",
  // iMessage – iPhone
  "IMESSAGE_APP_IPHONE_67",
  "IMESSAGE_APP_IPHONE_65",
  "IMESSAGE_APP_IPHONE_61",
  "IMESSAGE_APP_IPHONE_58",
  "IMESSAGE_APP_IPHONE_55",
  "IMESSAGE_APP_IPHONE_47",
  "IMESSAGE_APP_IPHONE_40",
  // iMessage – iPad
  "IMESSAGE_APP_IPAD_PRO_3GEN_129",
  "IMESSAGE_APP_IPAD_PRO_3GEN_11",
  "IMESSAGE_APP_IPAD_PRO_129",
  "IMESSAGE_APP_IPAD_105",
  "IMESSAGE_APP_IPAD_97",
];

/** Device categories group display types for the tab bar. */
export type DeviceCategory =
  | "iPhone"
  | "iPad"
  | "Apple Watch"
  | "iMessage"
  | "Mac"
  | "Apple TV"
  | "Apple Vision Pro";

export const DEVICE_CATEGORY_TYPES: Record<DeviceCategory, string[]> = {
  iPhone: [
    "APP_IPHONE_67",
    "APP_IPHONE_61",
    "APP_IPHONE_65",
    "APP_IPHONE_58",
    "APP_IPHONE_55",
    "APP_IPHONE_47",
    "APP_IPHONE_40",
    "APP_IPHONE_35",
  ],
  iPad: [
    "APP_IPAD_PRO_3GEN_129",
    "APP_IPAD_PRO_3GEN_11",
    "APP_IPAD_PRO_129",
    "APP_IPAD_105",
    "APP_IPAD_97",
  ],
  "Apple Watch": [
    "APP_WATCH_ULTRA",
    "APP_WATCH_SERIES_10",
    "APP_WATCH_SERIES_7",
    "APP_WATCH_SERIES_4",
    "APP_WATCH_SERIES_3",
  ],
  iMessage: [
    "IMESSAGE_APP_IPHONE_67",
    "IMESSAGE_APP_IPHONE_65",
    "IMESSAGE_APP_IPHONE_61",
    "IMESSAGE_APP_IPHONE_58",
    "IMESSAGE_APP_IPHONE_55",
    "IMESSAGE_APP_IPHONE_47",
    "IMESSAGE_APP_IPHONE_40",
    "IMESSAGE_APP_IPAD_PRO_3GEN_129",
    "IMESSAGE_APP_IPAD_PRO_3GEN_11",
    "IMESSAGE_APP_IPAD_PRO_129",
    "IMESSAGE_APP_IPAD_105",
    "IMESSAGE_APP_IPAD_97",
  ],
  Mac: ["APP_DESKTOP"],
  "Apple TV": ["APP_APPLE_TV"],
  "Apple Vision Pro": ["APP_APPLE_VISION_PRO"],
};

/** Maps ASC platform codes to the device categories available for that platform. */
export const PLATFORM_DEVICE_CATEGORIES: Record<string, DeviceCategory[]> = {
  IOS: ["iPhone", "iPad", "Apple Watch"],
  MAC_OS: ["Mac"],
  TV_OS: ["Apple TV"],
  VISION_OS: ["Apple Vision Pro"],
};

/** Get the device category for a display type. */
export function getDeviceCategory(displayType: string): DeviceCategory | undefined {
  for (const [cat, types] of Object.entries(DEVICE_CATEGORY_TYPES) as [DeviceCategory, string[]][]) {
    if (types.includes(displayType)) return cat;
  }
  return undefined;
}

export function displayTypeLabel(type: string): string {
  return DISPLAY_TYPE_LABELS[type] ?? type;
}

export function sortDisplayTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ai = DISPLAY_TYPE_ORDER.indexOf(a);
    const bi = DISPLAY_TYPE_ORDER.indexOf(b);
    const aIdx = ai === -1 ? Infinity : ai;
    const bIdx = bi === -1 ? Infinity : bi;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
  });
}

// --- Screenshot types (client-safe, no server deps) ---

export interface AscScreenshot {
  id: string;
  attributes: {
    fileSize: number;
    fileName: string;
    sourceFileChecksum: string | null;
    assetDeliveryState: {
      state: string;
      errors?: Array<{ code: string; description: string }>;
    } | null;
    assetToken: string | null;
  };
}

export interface AscScreenshotSet {
  id: string;
  attributes: {
    screenshotDisplayType: string;
  };
  screenshots: AscScreenshot[];
}

/** Map Apple's screenshot error codes to human-readable messages. */
const SCREENSHOT_ERROR_MESSAGES: Record<string, string> = {
  IMAGE_BAD_DIMENSION_SM_LESS_MIN: "Image is too small for this display type",
  IMAGE_BAD_DIMENSION_SM_OVER_MAX: "Image is too large for this display type",
  IMG_BAD_DIMENSIONS: "Image dimensions don't match this display type",
  IMAGE_INCORRECT_DIMENSIONS: "Image dimensions don't match this display type",
  IMG_BAD_COLOR_SPACE: "Image must use RGB colour space",
  IMG_APPEARS_CORRUPT: "Image file appears to be corrupt – try re-saving it",
  IMAGE_TOOL_FAILURE: "Apple could not process this image – try again later",
  IMG_BAD_FORMAT: "Unsupported image format – use PNG or JPEG",
};

export function screenshotErrorMessage(
  errors: Array<{ code: string; description: string }>,
): string {
  if (errors.length === 0) return "Processing failed";
  const first = errors[0];
  return SCREENSHOT_ERROR_MESSAGES[first.code] ?? first.description ?? "Processing failed";
}

/** Build an Apple CDN thumbnail URL from a screenshot's assetToken. */
export function screenshotImageUrl(assetToken: string, width = 300): string {
  return `https://is1-ssl.mzstatic.com/image/thumb/${assetToken}/${width}x0w.png`;
}

// ── Status indicator colours ──────────────────────────────────────────

export const BUILD_STATUS_DOTS: Record<string, string> = {
  Testing: "bg-green-500",
  "Ready to test": "bg-green-500",
  "Ready to submit": "bg-yellow-500",
  "Waiting for review": "bg-orange-500",
  "In beta review": "bg-blue-500",
  Rejected: "bg-red-500",
  "In compliance review": "bg-blue-500",
  Processing: "bg-blue-500",
  Expired: "bg-red-500",
  Invalid: "bg-red-500",
  "Missing compliance": "bg-amber-500",
  "Processing exception": "bg-red-500",
};

export const DIAGNOSTIC_TYPE_DOTS: Record<string, string> = {
  DISK_WRITES: "bg-amber-500",
  HANGS: "bg-red-500",
  LAUNCHES: "bg-blue-500",
};

export const TESTER_STATUS_DOTS: Record<string, string> = {
  INSTALLED: "bg-green-500",
  ACCEPTED: "bg-yellow-500",
  INVITED: "bg-blue-500",
  NOT_INVITED: "bg-gray-400",
  REVOKED: "bg-red-500",
};
