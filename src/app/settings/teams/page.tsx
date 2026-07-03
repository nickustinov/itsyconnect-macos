"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plugs,
  Plus,
  Trash,
  CheckCircle,
  XCircle,
  PencilSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { AddAccountDialog } from "@/components/layout/add-account-dialog";
import { useTranslations } from "@/lib/i18n/locale-context";

interface Team {
  id: string;
  name: string | null;
  issuerId: string;
  keyId: string;
  isActive: boolean;
  createdAt: string;
}

export default function TeamsPage() {
  const router = useRouter();
  const t = useTranslations();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "error">>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const [isDemo, setIsDemo] = useState(false);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/settings/credentials");
    if (res.ok) {
      const data = await res.json();
      setTeams(data.credentials);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings/credentials")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTeams(data.credentials); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIsDemo(d.demo === true); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const res = await fetch("/api/settings/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      setTestResults((prev) => ({ ...prev, [id]: res.ok ? "ok" : "error" }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "error" }));
    }

    setTestingId(null);
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/settings/credentials?id=${id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      const data = await res.json();
      if (data.redirectToSetup) {
        router.push("/setup");
      } else {
        toast.success(t("settings.teams.teamRemoved"));
        fetchTeams();
        router.refresh();
      }
    }
  }

  function handleTeamAdded() {
    setDialogOpen(false);
    fetchTeams();
    router.refresh();
  }

  function startEditing(team: Team) {
    setEditingId(team.id);
    setEditValue(team.name || t("nav.myTeam"));
    setTimeout(() => editRef.current?.select(), 0);
  }

  async function saveEdit() {
    const trimmed = editValue.trim();
    if (!editingId || !trimmed) {
      setEditingId(null);
      return;
    }
    setEditingId(null);
    setTeams((prev) =>
      prev.map((t) => (t.id === editingId ? { ...t, name: trimmed } : t)),
    );
    await fetch("/api/settings/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, name: trimmed }),
    });
  }

  if (loading) return null;

  return (
    <>
      <div className="max-w-2xl space-y-6">
        {teams.map((team) => (
          <div
            key={team.id}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              {editingId === team.id ? (
                <Input
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 w-48 text-sm font-medium"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(team)}
                  className="group flex items-center gap-1.5 font-medium text-sm hover:text-foreground/80"
                >
                  {team.name || t("nav.myTeam")}
                  <PencilSimple
                    size={13}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>
              )}
              {team.isActive && (
                <Badge variant="secondary" className="text-xs">{t("settings.teams.active")}</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">{t("settings.teams.issuerId")}</span>
                <p className="font-mono text-xs mt-0.5">{team.issuerId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("settings.teams.keyId")}</span>
                <p className="font-mono text-xs mt-0.5">{team.keyId}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest(team.id)}
                disabled={testingId === team.id}
              >
                <Plugs size={14} />
                {testingId === team.id ? t("settings.teams.testing") : t("settings.teams.testConnection")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Trash size={14} />
                    {t("settings.teams.removeTeam")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.teams.removeTeamTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("settings.teams.removeTeamDescription")}{" "}
                      <strong>{team.name || t("nav.myTeam")}</strong>{" "}
                      {teams.length === 1
                        ? t("settings.teams.removeTeamSetupAgain")
                        : t("settings.teams.removeTeamActivateOther")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRemove(team.id)}>
                      {t("common.remove")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {testResults[team.id] === "ok" && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle size={16} weight="fill" /> {t("settings.teams.connected")}
                </span>
              )}
              {testResults[team.id] === "error" && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle size={16} weight="fill" /> {t("settings.teams.connectionFailed")}
                </span>
              )}
            </div>
          </div>
        ))}

        {isDemo ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.teams.demoUnavailable")}
          </p>
        ) : (
          <Button
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <Plus size={16} />
            {t("settings.teams.addTeam")}
          </Button>
        )}
      </div>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleTeamAdded}
      />
    </>
  );
}
