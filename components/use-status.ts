"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Status } from "@/lib/client/api";

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/status"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Blindfold.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load of server state
    void refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);
  return { status, error, refresh };
}
