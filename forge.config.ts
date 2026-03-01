import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerPKG } from "@electron-forge/maker-pkg";
import { BUILD_NUMBER } from "./src/lib/version";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.itsyconnect.app",
    name: "Itsyconnect",
    appVersion: process.env.npm_package_version,
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
    ignore: (filePath: string) => {
      if (!filePath) return false;
      if (filePath === "/package.json") return false;
      if (filePath.startsWith("/electron")) return false;
      if (filePath.startsWith("/.next/standalone")) return false;
      if (filePath.startsWith("/drizzle")) return false;
      if (filePath.startsWith("/public")) return false;
      return true;
    },
  },
  makers: [
    new MakerDMG({
      format: "ULFO",
    }),
    new MakerPKG({}),
  ],
};

export default config;
