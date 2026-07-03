"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { CircleNotch, Plus, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { TFGroup } from "@/lib/asc/testflight";
import { useTranslations } from "@/lib/i18n/locale-context";

export function GroupsSection({
  appId,
  buildId,
  buildGroups,
  availableGroups,
  onGroupAdded,
  onGroupRemoved,
  onGroupsChanged,
  linkSuffix,
}: {
  appId: string;
  buildId: string;
  buildGroups: TFGroup[];
  availableGroups: TFGroup[];
  onGroupAdded: (groupId: string) => void;
  onGroupRemoved: (groupId: string) => void;
  onGroupsChanged: () => void;
  linkSuffix: string;
}) {
  const t = useTranslations();
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  async function addGroup(groupId: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [groupId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.addGroupFailed"));
      }
      toast.success(t("testflight.buildAddedToGroup"));
      onGroupAdded(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.addGroupFailed"));
    } finally {
      setAdding(false);
    }
  }

  async function removeGroup(groupId: string) {
    setRemoving(groupId);
    try {
      const res = await fetch(`/api/apps/${appId}/testflight/builds/${buildId}/groups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [groupId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("testflight.removeGroupFailed"));
      }
      toast.success(t("testflight.buildRemovedFromGroup"));
      onGroupRemoved(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testflight.removeGroupFailed"));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{t("testflight.groups")}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={adding}>
              <Plus size={14} className="mr-1.5" />
              {t("testflight.addToGroup")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableGroups.map((g) => (
              <DropdownMenuItem key={g.id} onClick={() => addGroup(g.id)}>
                <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                  {g.isInternal ? "I" : "E"}
                </span>
                {g.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
              <Plus size={14} className="text-muted-foreground" />
              {t("testflight.addGroup")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {buildGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("testflight.noGroupsOnBuild")}
        </div>
      ) : (
        <div className="space-y-1">
          {buildGroups.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <Link
                href={`/dashboard/apps/${appId}/testflight/groups/${g.id}${linkSuffix}`}
                className="flex flex-1 items-center gap-3"
              >
                <span className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-medium ${g.isInternal ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                  {g.isInternal ? "I" : "E"}
                </span>
                <span className="text-sm font-medium">{g.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("testflight.testersCount", { count: g.testerCount })}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeGroup(g.id)}
                disabled={removing === g.id}
              >
                {removing === g.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        appId={appId}
        onCreated={onGroupsChanged}
      />
    </section>
  );
}
