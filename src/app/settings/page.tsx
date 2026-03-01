"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { AddAccountDialog } from "@/components/layout/add-account-dialog";

interface Team {
  id: string;
  name: string | null;
  issuerId: string;
  keyId: string;
  isActive: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "error">>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/settings/credentials");
    if (res.ok) {
      const data = await res.json();
      setTeams(data.credentials);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

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
        toast.success("Team removed");
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl space-y-6">
        {teams.map((team) => (
          <div
            key={team.id}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">
                {team.name || "My team"}
              </h3>
              {team.isActive && (
                <Badge variant="secondary" className="text-xs">Active</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Issuer ID</span>
                <p className="font-mono text-xs mt-0.5">{team.issuerId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Key ID</span>
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
                {testingId === team.id ? "Testing…" : "Test connection"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Trash size={14} />
                    Remove team
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove team?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the App Store Connect credentials for{" "}
                      <strong>{team.name || "My team"}</strong> and clear all
                      cached app data.
                      {teams.length === 1
                        ? " You will need to set up the app again."
                        : " Another team will be activated automatically."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRemove(team.id)}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {testResults[team.id] === "ok" && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle size={16} weight="fill" /> Connected
                </span>
              )}
              {testResults[team.id] === "error" && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle size={16} weight="fill" /> Connection failed
                </span>
              )}
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={16} />
          Add team
        </Button>
      </div>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleTeamAdded}
      />
    </>
  );
}
