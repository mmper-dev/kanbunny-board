import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, MoreHorizontal, Plus, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { BoardColumn } from "@/components/BoardColumn";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DependencyGraph } from "@/components/DependencyGraph";
import { ProjectBar } from "@/components/ProjectBar";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { TaskCard } from "@/components/TaskCard";
import { TaskDialog } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { COLUMNS, STATUS_LABEL, type Status, type Task } from "@/lib/board-data";
import { blockers, dependents, matches, subtaskProgress } from "@/lib/board-queries";
import { useBoard } from "@/lib/board-store";
import { useKeyboardShortcuts, type FocusMove } from "@/hooks/use-keyboard-shortcuts";
import bunny from "@/assets/kanbunny.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanbunny — Kanban board with dependency graphs" },
      {
        name: "description",
        content:
          "A calm kanban board that maps how tasks block each other, with a layered dependency graph.",
      },
      { property: "og:title", content: "Kanbunny — Kanban with dependency graphs" },
      {
        property: "og:description",
        content: "Track work in lanes and see the blocking chain at a glance.",
      },
    ],
  }),
  component: Board,
});

function Board() {
  const { tasks, projects, loading, deleteTask, moveTask, resetBoard } = useBoard();

  const [view, setView] = useState<"board" | "graph">("board");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [rawFilter, setRawFilter] = useState("");
  const [filter, setFilter] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const filterRef = useRef<HTMLInputElement | null>(null);

  // --- derived data --------------------------------------------------------

  const projectTasks = useMemo(
    () => (activeProject ? tasks.filter((t) => t.projectId === activeProject) : tasks),
    [tasks, activeProject]
  );

  const visibleTasks = useMemo(() => matches(projectTasks, filter), [projectTasks, filter]);

  const lanes = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        tasks: visibleTasks.filter((t) => t.status === column.id),
        total: projectTasks.filter((t) => t.status === column.id).length,
      })),
    [visibleTasks, projectTasks]
  );

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) : undefined;
  const editingTask = editingId ? tasks.find((t) => t.id === editingId) : undefined;
  const focusedTask = focusedId ? tasks.find((t) => t.id === focusedId) : undefined;
  const pendingDeleteTask = pendingDeleteId
    ? tasks.find((t) => t.id === pendingDeleteId)
    : undefined;

  const activeProjectName = activeProject
    ? (projects.find((p) => p.id === activeProject)?.name ?? "All projects")
    : "All projects";

  const dialogsOpen = dialogOpen || pendingDeleteId !== null || shortcutsOpen || resetOpen;

  // --- filter debounce -----------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => setFilter(rawFilter), 150);
    return () => clearTimeout(timer);
  }, [rawFilter]);

  // --- focus management ----------------------------------------------------

  // Keep the roving focus pointed at something that actually exists on screen.
  useEffect(() => {
    if (visibleTasks.length === 0) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (!focusedId || !visibleTasks.some((t) => t.id === focusedId)) {
      setFocusedId(visibleTasks[0]?.id ?? null);
    }
  }, [visibleTasks, focusedId]);

  const focusCard = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
      el?.focus();
    });
  }, []);

  const locate = useCallback(
    (id: string | null) => {
      if (!id) return null;
      for (let lane = 0; lane < lanes.length; lane += 1) {
        const row = lanes[lane]?.tasks.findIndex((t) => t.id === id) ?? -1;
        if (row >= 0) return { lane, row };
      }
      return null;
    },
    [lanes]
  );

  const moveFocus = useCallback(
    (move: FocusMove) => {
      if (view !== "board" || visibleTasks.length === 0) return;
      const at = locate(focusedId) ?? { lane: 0, row: 0 };
      let { lane, row } = at;

      if (move === "left" || move === "right") {
        const step = move === "left" ? -1 : 1;
        // Skip empty lanes rather than trapping focus against one.
        for (let i = 1; i <= lanes.length; i += 1) {
          const next = lane + step * i;
          if (next < 0 || next >= lanes.length) break;
          if ((lanes[next]?.tasks.length ?? 0) > 0) {
            lane = next;
            break;
          }
        }
        row = Math.min(row, Math.max(0, (lanes[lane]?.tasks.length ?? 1) - 1));
      } else if (move === "up") {
        row = Math.max(0, row - 1);
      } else if (move === "down") {
        row = Math.min((lanes[lane]?.tasks.length ?? 1) - 1, row + 1);
      } else if (move === "first") {
        row = 0;
      } else if (move === "last") {
        row = Math.max(0, (lanes[lane]?.tasks.length ?? 1) - 1);
      }

      const next = lanes[lane]?.tasks[row];
      if (next) {
        setFocusedId(next.id);
        focusCard(next.id);
      }
    },
    [focusCard, focusedId, lanes, locate, view, visibleTasks.length]
  );

  // --- mutations -----------------------------------------------------------

  const announceMove = useCallback((task: Task, status: Status) => {
    setAnnouncement(`${task.id} moved to ${STATUS_LABEL[status]}.`);
  }, []);

  const applyMove = useCallback(
    (taskId: string, status: Status) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === status) return;

      void moveTask(taskId, status);
      announceMove(task, status);

      // The board describes reality rather than enforcing process: harvesting blocked work is
      // allowed, but worth saying out loud.
      if (status === "done") {
        const unfinished = blockers(tasks, task);
        if (unfinished.length > 0) {
          toast.warning(
            `${task.id} is harvested, but it was still waiting on ${unfinished
              .map((b) => b.id)
              .join(", ")}.`
          );
        }
      }
    },
    [announceMove, moveTask, tasks]
  );

  // dragend does not always arrive (drops into other windows, cancelled gestures), and a stale
  // draggingId leaves the card stuck at half opacity. Clearing on drop too makes that impossible.
  const handleDrop = useCallback(
    (taskId: string, status: Status) => {
      setDraggingId(null);
      applyMove(taskId, status);
    },
    [applyMove]
  );

  const moveFocusedToLane = useCallback(
    (index: number) => {
      const column = COLUMNS[index];
      if (!column || !focusedTask) return;
      applyMove(focusedTask.id, column.id);
      focusCard(focusedTask.id);
    },
    [applyMove, focusCard, focusedTask]
  );

  const moveFocusedRelative = useCallback(
    (delta: -1 | 1) => {
      if (!focusedTask) return;
      const current = COLUMNS.findIndex((c) => c.id === focusedTask.status);
      const next = COLUMNS[current + delta];
      if (!next) return;
      applyMove(focusedTask.id, next.id);
      focusCard(focusedTask.id);
    },
    [applyMove, focusCard, focusedTask]
  );

  const openNewTask = useCallback(() => {
    setEditingId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pendingDeleteId) return;
    void deleteTask(pendingDeleteId);
    if (selectedId === pendingDeleteId) setSelectedId(null);
    setPendingDeleteId(null);
  }, [deleteTask, pendingDeleteId, selectedId]);

  // --- keyboard ------------------------------------------------------------

  useKeyboardShortcuts(
    {
      onNewTask: openNewTask,
      onEditFocused: () => focusedId && openEdit(focusedId),
      onDeleteFocused: () => focusedId && setPendingDeleteId(focusedId),
      onFocusFilter: () => filterRef.current?.focus(),
      onSetView: setView,
      onEscape: () => {
        if (rawFilter) {
          setRawFilter("");
          return;
        }
        setSelectedId(null);
      },
      onMoveFocus: moveFocus,
      onSelectFocused: () => focusedId && setSelectedId(focusedId),
      onMoveToLane: moveFocusedToLane,
      onMoveLaneRelative: moveFocusedRelative,
      onToggleHelp: () => setShortcutsOpen((open) => !open),
    },
    dialogsOpen
  );

  // --- render --------------------------------------------------------------

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <img src={bunny} alt="Kanbunny mascot" width={36} height={36} className="size-9" />
          <div className="mr-auto">
            <h1 className="text-lg font-bold">Kanbunny</h1>
            <p className="text-xs text-muted-foreground">
              {activeProjectName} · {projectTasks.length}{" "}
              {projectTasks.length === 1 ? "task" : "tasks"}
            </p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={filterRef}
              value={rawFilter}
              onChange={(event) => setRawFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setRawFilter("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search…"
              aria-label="Search the board"
              className="h-9 w-40 rounded-full pl-8 pr-8 text-xs sm:w-56"
            />
            {rawFilter && (
              <button
                onClick={() => setRawFilter("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
            {(["board", "graph"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "rounded-full px-3 py-1.5 capitalize transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <Button className="rounded-full" onClick={openNewTask}>
            <Plus className="size-4" /> New task
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Board menu" className="rounded-full p-2 hover:bg-secondary">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                <Keyboard className="size-3.5" /> Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setResetOpen(true)}>
                <RotateCcw className="size-3.5" /> Reset board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <ProjectBar active={activeProject} onChange={setActiveProject} />

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Waking the bunny…</p>
        ) : view === "board" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {lanes.map((lane) => (
              <BoardColumn
                key={lane.id}
                status={lane.id}
                label={lane.label}
                count={lane.tasks.length}
                total={lane.total}
                filtered={filter.trim().length > 0}
                onDropTask={handleDrop}
              >
                {lane.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tasks={tasks}
                    project={projects.find((p) => p.id === task.projectId)}
                    active={task.id === selectedId}
                    tabbable={task.id === focusedId}
                    dragging={task.id === draggingId}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setFocusedId(id);
                    }}
                    onEdit={openEdit}
                    onDelete={setPendingDeleteId}
                    onMove={applyMove}
                    onDragStart={setDraggingId}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
              </BoardColumn>
            ))}
          </div>
        ) : (
          <DependencyGraph
            tasks={visibleTasks}
            selected={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setFocusedId(id);
            }}
          />
        )}

        {selectedTask && <DetailAside task={selectedTask} tasks={tasks} onEdit={openEdit} onClose={() => setSelectedId(null)} />}
      </main>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
        task={editingTask}
        defaultProjectId={activeProject ?? undefined}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title={pendingDeleteTask ? `Delete ${pendingDeleteTask.id}?` : "Delete task?"}
        description="Other tasks that wait on it will lose that link."
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the board?"
        description="Every change you have made this visit goes back to the demo data."
        confirmLabel="Reset"
        onConfirm={() => {
          void resetBoard();
          setSelectedId(null);
          setResetOpen(false);
        }}
      />

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function DetailAside({
  task,
  tasks,
  onEdit,
  onClose,
}: {
  task: Task;
  tasks: Task[];
  onEdit: (id: string) => void;
  onClose: () => void;
}) {
  const waiting = blockers(tasks, task);
  const blocking = dependents(tasks, task.id);
  const progress = subtaskProgress(task);

  return (
    <aside className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
          <h2 className="text-xl font-bold">{task.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(task.id)}>
            Edit
          </Button>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{task.detail}</p>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Detail label="Owner" value={task.assignee || "Unassigned"} />
        <Detail
          label="Waiting on"
          value={
            waiting.length
              ? waiting.map((b) => `${b.id} ${b.title}`).join(", ")
              : "Nothing — ready to hop"
          }
        />
        <Detail
          label="Blocks"
          value={blocking.length ? blocking.map((b) => b.id).join(", ") : "Nothing"}
        />
      </div>

      {progress.total > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Subtasks · {progress.done}/{progress.total}
          </p>
          <ul className="mt-1.5 grid gap-1">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    subtask.status === "done" ? "bg-primary" : "bg-border"
                  )}
                />
                <span className={cn(subtask.status === "done" && "text-muted-foreground line-through")}>
                  {subtask.title}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">{subtask.assignee}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
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
