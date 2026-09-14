import { useState, type ReactNode } from "react";
import { LANE_EMPTY_COPY, type Status } from "@/lib/board-data";
import { cn } from "@/lib/utils";

export function BoardColumn({
  status,
  label,
  count,
  total,
  filtered,
  onDropTask,
  children,
}: {
  status: Status;
  label: string;
  /** Cards currently shown (after filtering). */
  count: number;
  /** Cards in this lane ignoring the filter. */
  total: number;
  filtered: boolean;
  onDropTask: (taskId: string, status: Status) => void;
  children: ReactNode;
}) {
  // A plain boolean flickers: dragging over a child fires dragleave on the lane. Counting
  // enter/leave pairs keeps the affordance steady.
  const [depth, setDepth] = useState(0);
  const over = depth > 0;

  return (
    <section
      aria-label={`${label} lane, ${count} ${count === 1 ? "task" : "tasks"}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((d) => d + 1);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={() => setDepth((d) => Math.max(0, d - 1))}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        const taskId = event.dataTransfer.getData("text/plain");
        if (taskId) onDropTask(taskId, status);
      }}
      className={cn(
        "min-h-24 rounded-2xl bg-lane p-3 transition-shadow",
        over && "bg-lane/80 ring-2 ring-primary/40"
      )}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
          {filtered ? `${count} / ${total}` : count}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
            {filtered && total > 0 ? "Nothing matches the filter here." : LANE_EMPTY_COPY[status]}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
