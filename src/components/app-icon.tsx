import { AppWindow, CloudSun, Barbell, Notepad } from "@phosphor-icons/react";
import type { ComponentType } from "react";

interface AppIconProps {
  iconUrl: string | null | undefined;
  name: string;
  /** Tailwind size class, e.g. "size-8" or "size-14". */
  className?: string;
  /** Phosphor icon size in px for the fallback. */
  iconSize?: number;
  /** Border-radius class. Defaults to "rounded-lg". */
  rounded?: string;
}

interface DemoIconDef {
  Icon: ComponentType<{ size: number; weight: "fill"; color?: string }>;
  gradient: string;
}

const DEMO_ICONS: Record<string, DemoIconDef> = {
  "demo-app-weatherly": {
    Icon: CloudSun,
    gradient: "from-sky-400 to-indigo-600",
  },
  "demo-app-trackfit": {
    Icon: Barbell,
    gradient: "from-emerald-400 to-teal-600",
  },
  "demo-app-notepad": {
    Icon: Notepad,
    gradient: "from-amber-400 to-orange-600",
  },
};

export function AppIcon({ iconUrl, name, className = "size-8", iconSize = 16, rounded = "rounded-lg" }: AppIconProps) {
  if (iconUrl) {
    // Demo icon encoded as "demo:<appId>"
    if (iconUrl.startsWith("demo:")) {
      const def = DEMO_ICONS[iconUrl.slice(5)];
      if (def) {
        return (
          <div className={`flex items-center justify-center bg-gradient-to-b ${def.gradient} shadow-sm ${rounded} ${className}`}>
            <def.Icon size={Math.round(iconSize * 1.5)} weight="fill" color="white" />
          </div>
        );
      }
    }

    return (
      <img
        src={iconUrl}
        alt={name}
        className={`${className} ${rounded} shadow-sm`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm ${rounded} ${className}`}
    >
      <AppWindow size={iconSize} weight="fill" />
    </div>
  );
}
