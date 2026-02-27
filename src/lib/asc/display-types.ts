export const DISPLAY_TYPE_LABELS: Record<string, string> = {
  APP_IPHONE_67: 'iPhone 6.7"',
  APP_IPHONE_61: 'iPhone 6.1"',
  APP_IPHONE_65: 'iPhone 6.5"',
  APP_IPHONE_58: 'iPhone 5.8"',
  APP_IPHONE_55: 'iPhone 5.5"',
  APP_IPHONE_47: 'iPhone 4.7"',
  APP_IPHONE_40: 'iPhone 4"',
  APP_IPHONE_35: 'iPhone 3.5"',
  APP_IPAD_PRO_3GEN_129: 'iPad Pro 12.9"',
  APP_IPAD_PRO_3GEN_11: 'iPad Pro 11"',
  APP_IPAD_PRO_129: 'iPad Pro 12.9" (2nd)',
  APP_IPAD_105: 'iPad 10.5"',
  APP_IPAD_97: 'iPad 9.7"',
  APP_DESKTOP: "Mac",
  APP_APPLE_TV: "Apple TV",
  APP_APPLE_VISION_PRO: "Apple Vision Pro",
};

/** Primary portrait resolution for each display type (width × height). */
export const DISPLAY_TYPE_SIZES: Record<string, string> = {
  APP_IPHONE_67: "1290 × 2796",
  APP_IPHONE_61: "1170 × 2532",
  APP_IPHONE_65: "1284 × 2778",
  APP_IPHONE_58: "1125 × 2436",
  APP_IPHONE_55: "1242 × 2208",
  APP_IPHONE_47: "750 × 1334",
  APP_IPHONE_40: "640 × 1136",
  APP_IPHONE_35: "640 × 960",
  APP_IPAD_PRO_3GEN_129: "2048 × 2732",
  APP_IPAD_PRO_3GEN_11: "1668 × 2388",
  APP_IPAD_PRO_129: "2048 × 2732",
  APP_IPAD_105: "1668 × 2224",
  APP_IPAD_97: "1536 × 2048",
  APP_DESKTOP: "2880 × 1800",
  APP_APPLE_TV: "1920 × 1080",
  APP_APPLE_VISION_PRO: "3840 × 2160",
};

/** Consistent display order for screenshot sets. Types not listed sort to end alphabetically. */
export const DISPLAY_TYPE_ORDER: string[] = [
  "APP_IPHONE_67",
  "APP_IPHONE_61",
  "APP_IPHONE_65",
  "APP_IPHONE_58",
  "APP_IPHONE_55",
  "APP_IPHONE_47",
  "APP_IPHONE_40",
  "APP_IPHONE_35",
  "APP_IPAD_PRO_3GEN_129",
  "APP_IPAD_PRO_3GEN_11",
  "APP_IPAD_PRO_129",
  "APP_IPAD_105",
  "APP_IPAD_97",
  "APP_DESKTOP",
  "APP_APPLE_TV",
  "APP_APPLE_VISION_PRO",
];

/** Device categories group display types for the tab bar. */
export type DeviceCategory = "iPhone" | "iPad" | "Mac" | "Apple TV" | "Apple Vision Pro";

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
  Mac: ["APP_DESKTOP"],
  "Apple TV": ["APP_APPLE_TV"],
  "Apple Vision Pro": ["APP_APPLE_VISION_PRO"],
};

/** Maps ASC platform codes to the device categories available for that platform. */
export const PLATFORM_DEVICE_CATEGORIES: Record<string, DeviceCategory[]> = {
  IOS: ["iPhone", "iPad"],
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
    assetDeliveryState: { state: string } | null;
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

/** Build an Apple CDN thumbnail URL from a screenshot's assetToken. */
export function screenshotImageUrl(assetToken: string, width = 300): string {
  return `https://is1-ssl.mzstatic.com/image/thumb/${assetToken}/${width}x0w.png`;
}
