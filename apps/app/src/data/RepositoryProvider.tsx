import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@wallt/db";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { notifyLocalWrite, setOnFxChanges, setOnRemoteChanges } from "../sync/runtime";
import { restoreSession } from "../sync/session";
import { openRepository } from "./database";

type State =
  | { status: "loading" }
  | { status: "ready"; repository: Repository }
  | { status: "error"; error: Error };

const RepositoryContext = createContext<State>({ status: "loading" });

/** Current data-source state (loading, ready or failed), for screens that need to show it. */
export function useDataState(): State {
  return useContext(RepositoryContext);
}

/** The repository. Throws if the data source is not ready: gate screens with `useDataState()` first. */
export function useRepository(): Repository {
  const state = useContext(RepositoryContext);
  if (state.status !== "ready") {
    throw new Error(
      state.status === "error"
        ? `Data source unavailable: ${state.error.message}`
        : "Data source is still loading",
    );
  }
  return state.repository;
}

/**
 * Opens the repository once and provides it together with the TanStack Query client. The UI talks to the
 * `Repository` interface only, never to SQL.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const queryClient = useMemo(
    () =>
      new QueryClient({
        // every successful local write may need pushing (no-op while signed out)
        mutationCache: new MutationCache({ onSuccess: () => notifyLocalWrite() }),
        defaultOptions: {
          // Local data: no network retries or window-focus refetching to speak of.
          queries: {
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    // a sync that pulled rows: cached queries are stale
    setOnRemoteChanges(() => void queryClient.invalidateQueries());
    setOnFxChanges(() => void queryClient.invalidateQueries({ queryKey: ["fx"] }));
    openRepository().then(
      (repository) => {
        if (!alive) return;
        setState({ status: "ready", repository });
        void restoreSession().catch(() => undefined);
      },
      (cause: unknown) =>
        alive &&
        setState({
          status: "error",
          error: cause instanceof Error ? cause : new Error(String(cause)),
        }),
    );
    return () => {
      alive = false;
      setOnRemoteChanges(null);
      setOnFxChanges(null);
    };
  }, [queryClient]);

  return (
    <RepositoryContext.Provider value={state}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RepositoryContext.Provider>
  );
}
