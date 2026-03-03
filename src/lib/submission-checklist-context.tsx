"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type FieldStatus = "ok" | "warn" | "missing";

export interface FieldIssues {
  status: FieldStatus;
  localesWithIssues: string[];
}

export interface ChecklistFlags {
  description: FieldIssues;
  whatsNew: FieldIssues;
  keywords: FieldIssues;
}

const defaultField: FieldIssues = { status: "missing", localesWithIssues: [] };

const defaults: ChecklistFlags = {
  description: { ...defaultField },
  whatsNew: { ...defaultField },
  keywords: { ...defaultField },
};

interface SubmissionChecklistContextValue {
  flags: ChecklistFlags;
  report: (flags: ChecklistFlags) => void;
}

const SubmissionChecklistContext = createContext<SubmissionChecklistContextValue>({
  flags: defaults,
  report: () => {},
});

export function SubmissionChecklistProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<ChecklistFlags>(defaults);
  const report = useCallback((f: ChecklistFlags) => setFlags(f), []);

  return (
    <SubmissionChecklistContext.Provider value={{ flags, report }}>
      {children}
    </SubmissionChecklistContext.Provider>
  );
}

export function useSubmissionChecklist() {
  return useContext(SubmissionChecklistContext);
}
