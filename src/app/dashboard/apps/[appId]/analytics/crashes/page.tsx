"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bug,
  DeviceMobile,
  Desktop,
} from "@phosphor-icons/react";
import { useAnalytics } from "@/lib/analytics-context";
import { KpiCard } from "@/components/kpi-card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

// ---------- Page ----------

export default function CrashesPage() {
  const { data, loading, error, pending } = useAnalytics();

  const crashesByVersion = data?.crashesByVersion ?? [];
  const crashesByDevice = data?.crashesByDevice ?? [];

  const totalCrashes = crashesByVersion.reduce((s, c) => s + c.crashes, 0);
  const totalAffected = crashesByVersion.reduce((s, c) => s + c.uniqueDevices, 0);

  if (loading && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (pending && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Fetching analytics data – this may take a moment on first load
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total crashes"
          value={totalCrashes.toLocaleString()}
          subtitle={`Across ${crashesByVersion.length} version${crashesByVersion.length !== 1 ? "s" : ""}`}
          icon={Bug}
        />
        <KpiCard
          title="Affected devices"
          value={totalAffected.toLocaleString()}
          subtitle="Unique devices with crashes"
          icon={DeviceMobile}
        />
        <KpiCard
          title="Device models"
          value={crashesByDevice.length.toLocaleString()}
          subtitle="Distinct models affected"
          icon={Desktop}
        />
      </div>

      {/* Two tables side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Crashes by version */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Crashes by version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Crashes</TableHead>
                  <TableHead className="text-right">Unique devices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crashesByVersion.map((row) => (
                  <TableRow key={`${row.version}-${row.platform}`}>
                    <TableCell className="font-medium font-mono">
                      {row.version}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.platform}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.crashes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.uniqueDevices}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Crashes by device */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Crashes by device
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">Crashes</TableHead>
                  <TableHead className="text-right">Unique devices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crashesByDevice.map((row) => (
                  <TableRow key={row.device}>
                    <TableCell className="font-medium font-mono">
                      {row.device}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.crashes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.uniqueDevices}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
