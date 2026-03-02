"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Moon, Sun, CheckCircle, XCircle } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "downloaded" | "error";

export default function GeneralPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted guard for SSR hydration
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    window.electron?.updates.getAutoCheck().then((v) => setAutoCheck(v));
    return window.electron?.updates.onStatus((status) => {
      setUpdateState(status.state as UpdateState);
      if (status.state === "error") setErrorMessage(status.message ?? "Unknown error");
    });
  }, []);

  function handleAutoCheckChange(enabled: boolean) {
    setAutoCheck(enabled);
    window.electron?.updates.setAutoCheck(enabled);
  }

  function handleCheckNow() {
    setUpdateState("checking");
    setErrorMessage("");
    window.electron?.updates.checkNow();
  }

  if (!mounted) return null;

  const isElectron = !!window.electron;

  return (
    <div className="space-y-8">
      {isElectron && (
        <section className="space-y-4">
          <h3 className="section-title">Updates</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="auto-check-updates"
              checked={autoCheck}
              onCheckedChange={handleAutoCheckChange}
            />
            <Label htmlFor="auto-check-updates" className="text-sm">
              Automatically check for updates
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckNow}
              disabled={updateState === "checking"}
            >
              {updateState === "checking" ? (
                <>
                  <Spinner className="size-3.5" />
                  Checking…
                </>
              ) : (
                "Check now"
              )}
            </Button>
            {updateState === "up-to-date" && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle size={16} weight="fill" /> Up to date
              </span>
            )}
            {updateState === "available" && (
              <span className="text-sm text-muted-foreground">
                Downloading update…
              </span>
            )}
            {updateState === "downloaded" && (
              <span className="text-sm text-muted-foreground">
                Update ready – restart to install
              </span>
            )}
            {updateState === "error" && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircle size={16} weight="fill" /> {errorMessage}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="section-title">Theme</h3>
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="w-[200px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <SelectItem key={value} value={value}>
                <Icon size={14} className="mr-2 inline-block" />
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          System follows your macOS appearance setting.
        </p>
      </section>
    </div>
  );
}
