import { blockers, dependents, type Task } from "@/lib/board-data";
import { cn } from "@/lib/utils";
import { Lock, GitBranch } from "lucide-react";

const priorityStyles: Record<Task["priority"], string> = {
  high: "bg-accent/15 text-accent-foreground/90 border-accent/40",
  medium: "bg-primary/10 text-primary border-primary/25",
  low: "bg-muted text-muted-foreground border-border",
};

export function TaskCard({
  task,
  active,
  onSelect,
}: {
  task: Task;
  active?: boolean;
  onSelect?: (id: string) => void;
}) {
  const blocked = blockers(task);
  const blocking = dependents(task.id);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(task.id)}
      className={cn(
        "w-full rounded-xl border bg-card p-3 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary ring-2 ring-primary/30" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{task.id}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
            priorityStyles[task.priority]
          )}
        >
          {task.priority}
        </span>
      </div>

      <h3 className="mt-1.5 text-sm font-semibold leading-snug">{task.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.detail}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
          {task.assignee}
        </span>
        <span>{task.points} pts</span>
        {blocking.length > 0 && (
          <span className="inline-flex items-center gap-1">
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
    </button>
  );
}
