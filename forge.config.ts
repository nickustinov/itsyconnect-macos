import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { APP_VERSION, BUILD_NUMBER } from "./src/lib/version";

const makers = [
  new MakerDMG({
    format: "ULFO",
    name: "Itsyconnect",
    icon: "public/icon.icns",
    overwrite: true,
  }),
  new MakerZIP({}),
];

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.itsyconnect.app",
    name: "Itsyconnect",
    appVersion: APP_VERSION,
    buildVersion: BUILD_NUMBER,
    icon: "public/icon",
    asar: false,
    osxSign: process.env.APPLE_TEAM_ID ? {} : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_ID_PASSWORD!,
          teamId: process.env.APPLE_TEAM_ID!,
        }
      : undefined,
    osxUniversal: {
      // Native modules live under `.next/standalone/node_modules`.
      // Use an explicit pattern that matches hidden `.next` paths during
      // @electron/universal's Mach-O comparison.
      x64ArchFiles: "Contents/Resources/app/.next/standalone/node_modules/**/*.{node,dylib}",
    },
    ignore: (filePath: string) => {
      if (!filePath) return false;
      if (filePath === "/package.json") return false;
      if (filePath.startsWith("/electron")) return false;
      if (filePath === "/.next" || filePath.startsWith("/.next/standalone")) return false;
      if (filePath.startsWith("/drizzle")) return false;
      if (filePath.startsWith("/public")) return false;
      return true;
    },
  },
  makers,
};

export default config;
