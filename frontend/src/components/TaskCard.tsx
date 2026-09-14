import { CheckSquare, GitBranch, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLUMNS, type Project, type Status, type Task } from "@/lib/board-data";
import { blockers, dependents, subtaskProgress } from "@/lib/board-queries";
import { cn } from "@/lib/utils";

const priorityStyles: Record<Task["priority"], string> = {
  high: "bg-accent/15 text-accent-strong border-accent/40",
  medium: "bg-primary/10 text-primary border-primary/25",
  low: "bg-muted text-muted-foreground border-border",
};

export function TaskCard({
  task,
  tasks,
  project,
  active,
  tabbable,
  dragging,
  onSelect,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  tasks: Task[];
  project: Project | undefined;
  active: boolean;
  /** Roving tabindex: exactly one card on the board is tabbable at a time. */
  tabbable: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const blocked = blockers(tasks, task);
  const blocking = dependents(tasks, task.id);
  const progress = subtaskProgress(task);

  return (
    <div
      role="button"
      tabIndex={tabbable ? 0 : -1}
      data-task-id={task.id}
      aria-pressed={active}
      aria-label={`${task.id} ${task.title}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(task.id);
        }
      }}
      className={cn(
        "group relative w-full cursor-grab rounded-xl border bg-card p-3 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary ring-2 ring-primary/30" : "border-border",
        dragging && "opacity-50"
      )}
      style={
        project
          ? { borderLeftWidth: 2, borderLeftColor: `oklch(0.62 0.14 ${project.hue})` }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{task.id}</span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
              priorityStyles[task.priority]
            )}
          >
            {task.priority}
          </span>

          {/* Always visible, never hover-only: on touch there is no hover, and this menu is also
              the only way to move a card without a pointer drag. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${task.id}`}
              onClick={(event) => event.stopPropagation()}
              className="-mr-1 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-secondary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onSelect={() => onEdit(task.id)}>
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {COLUMNS.map((column) => (
                    <DropdownMenuItem
                      key={column.id}
                      disabled={column.id === task.status}
                      onSelect={() => onMove(task.id, column.id)}
                    >
                      {column.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onDelete(task.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h3 className="mt-1.5 text-sm font-semibold leading-snug">{task.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.detail}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
          {task.assignee || "Unassigned"}
        </span>
        <span>{task.points} pts</span>
        {progress.total > 0 && (
          <span className="inline-flex items-center gap-1" title="Subtasks done">
            <CheckSquare className="size-3" />
            {progress.done}/{progress.total}
          </span>
        )}
        {blocking.length > 0 && (
          <span className="inline-flex items-center gap-1" title="Tasks waiting on this one">
            <GitBranch className="size-3" />
            {blocking.length}
          </span>
        )}
        {blocked.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blocked/15 px-2 py-0.5 font-medium text-blocked">
            <Lock className="size-3" />
            blocked by {blocked.map((b) => b.id).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
