"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ElectronNavigationListener() {
  const router = useRouter();

  useEffect(() => {
    return window.electron?.onNavigate((path) => router.push(path));
  }, [router]);

  return null;
}
