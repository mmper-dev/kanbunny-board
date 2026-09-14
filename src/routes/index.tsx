import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { COLUMNS, TASKS, byId, blockers, dependents } from "@/lib/board-data";
import { TaskCard } from "@/components/TaskCard";
import { DependencyGraph } from "@/components/DependencyGraph";
import bunny from "@/assets/kanbunny.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanbunny — Kanban board with dependency graphs" },
      {
        name: "description",
        content:
          "A calm kanban board that maps how tasks block each other, with Kanbunny, an assistant that searches and explains your work.",
      },
      { property: "og:title", content: "Kanbunny — Kanban with dependency graphs" },
      {
        property: "og:description",
        content: "Track work in lanes, see the blocking chain, and ask the bunny what to do next.",
      },
    ],
  }),
  component: Board,
});

function Board() {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "graph">("board");
  const task = selected ? byId(selected) : undefined;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <img src={bunny} alt="Kanbunny mascot" width={36} height={36} className="size-9" />
          <div className="mr-auto">
            <h1 className="text-lg font-bold">Kanbunny</h1>
            <p className="text-xs text-muted-foreground">Carrot Ops · Sprint 12</p>
          </div>

          <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
            {(["board", "graph"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-3 py-1.5 capitalize transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <Link
            to="/kanbunny"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Ask Kanbunny
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {view === "board" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const items = TASKS.filter((t) => t.status === col.id);
              return (
                <section key={col.id} className="rounded-2xl bg-lane p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {items.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        active={t.id === selected}
                        onSelect={setSelected}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <DependencyGraph selected={selected} onSelect={setSelected} />
        )}

        {task && (
          <aside className="mt-6 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                <h2 className="text-xl font-bold">{task.title}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{task.detail}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
              <Detail label="Owner" value={task.assignee} />
              <Detail
                label="Waiting on"
                value={
                  blockers(task).length
                    ? blockers(task)
                        .map((b) => `${b.id} ${b.title}`)
                        .join(", ")
                    : "Nothing — ready to hop"
                }
              />
              <Detail
                label="Blocks"
                value={
                  dependents(task.id).length
                    ? dependents(task.id)
                        .map((b) => b.id)
                        .join(", ")
                    : "Nothing"
                }
              />
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
