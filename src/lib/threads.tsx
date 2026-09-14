import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Thread = { id: string; title: string };

type Ctx = {
  threads: Thread[];
  createThread: () => Thread;
  renameThread: (id: string, title: string) => void;
  removeThread: (id: string) => void;
  ensureThread: (id: string) => void;
};

const ThreadContext = createContext<Ctx | null>(null);

const newId = () => Math.random().toString(36).slice(2, 9);

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);

  const value = useMemo<Ctx>(
    () => ({
      threads,
      createThread: () => {
        const thread = { id: newId(), title: "New burrow" };
        setThreads((prev) => [thread, ...prev]);
        return thread;
      },
      ensureThread: (id: string) =>
        setThreads((prev) =>
          prev.some((t) => t.id === id) ? prev : [{ id, title: "New burrow" }, ...prev]
        ),
      renameThread: (id, title) =>
        setThreads((prev) =>
          prev.map((t) => (t.id === id && t.title === "New burrow" ? { ...t, title } : t))
        ),
      removeThread: (id) => setThreads((prev) => prev.filter((t) => t.id !== id)),
    }),
    [threads]
  );

  return <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>;
}

export function useThreads() {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error("useThreads must be used inside ThreadProvider");
  return ctx;
}
