import { useMemo, useState } from "react";
import type { Task } from "@/lib/board-data";
import { criticalPath, depthOf } from "@/lib/board-queries";
import { cn } from "@/lib/utils";

const NODE_W = 168;
const NODE_H = 58;
const GAP_X = 84;
const GAP_Y = 26;

type Placed = Task & { x: number; y: number };

export function DependencyGraph({
  tasks,
  selected,
  onSelect,
}: {
  tasks: Task[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  const { nodes, width, height } = useMemo(() => {
    const layers = new Map<number, Task[]>();
    for (const t of tasks) {
      const d = depthOf(tasks, t);
      layers.set(d, [...(layers.get(d) ?? []), t]);
    }
    const placed: Placed[] = [];
    let maxRows = 0;
    for (const [depth, items] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      maxRows = Math.max(maxRows, items.length);
      items.forEach((t, i) => {
        placed.push({
          ...t,
          x: depth * (NODE_W + GAP_X) + 16,
          y: i * (NODE_H + GAP_Y) + 16,
        });
      });
    }
    const depths = [...layers.keys()];
    return {
      nodes: placed,
      width: depths.length ? (Math.max(...depths) + 1) * (NODE_W + GAP_X) + 32 : 0,
      height: maxRows * (NODE_H + GAP_Y) + 32,
    };
  }, [tasks]);

  const path = useMemo(
    () => (showCriticalPath ? criticalPath(tasks) : []),
    [showCriticalPath, tasks]
  );
  const pathIds = useMemo(() => new Set(path.map((t) => t.id)), [path]);
  const pathEdges = useMemo(() => {
    const edges = new Set<string>();
    for (let i = 1; i < path.length; i += 1) {
      const from = path[i - 1];
      const to = path[i];
      if (from && to) edges.add(`${from.id}-${to.id}`);
    }
    return edges;
  }, [path]);

  const pos = new Map(nodes.map((n) => [n.id, n]));

  const edges = nodes.flatMap((n) =>
    n.dependsOn
      .map((d) => pos.get(d))
      .filter((p): p is Placed => Boolean(p))
      .map((from) => ({ from, to: n }))
  );

  const isLit = (id: string) => {
    if (!selected) return false;
    if (id === selected) return true;
    const sel = pos.get(selected);
    return (
      Boolean(sel?.dependsOn.includes(id)) || Boolean(pos.get(id)?.dependsOn.includes(selected))
    );
  };

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/70 p-12 text-center">
        <p className="text-sm text-muted-foreground">No tasks to map here yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        {showCriticalPath && path.length > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-0.5 w-4 rounded-full bg-blocked" />
            longest chain · {path.length} tasks
          </span>
        )}
        <button
          onClick={() => setShowCriticalPath((v) => !v)}
          aria-pressed={showCriticalPath}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            showCriticalPath
              ? "border-blocked bg-blocked/15 text-blocked"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          Critical path
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card/70 p-2">
        <svg width={width} height={height} className="min-w-full">
          <defs>
            <marker
              id="arrow"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-muted-foreground" />
            </marker>
            <marker
              id="arrow-lit"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-accent" />
            </marker>
            <marker
              id="arrow-critical"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-blocked" />
            </marker>
          </defs>

          {edges.map(({ from, to }) => {
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            const lit = isLit(from.id) && isLit(to.id);
            const critical = pathEdges.has(`${from.id}-${to.id}`);
            return (
              <path
                key={`${from.id}-${to.id}`}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                fill="none"
                strokeWidth={critical ? 3 : lit ? 2.5 : 1.5}
                markerEnd={`url(#${critical ? "arrow-critical" : lit ? "arrow-lit" : "arrow"})`}
                className={cn(
                  "transition-colors",
                  critical ? "stroke-blocked" : lit ? "stroke-accent" : "stroke-border",
                  selected && !lit && !critical ? "opacity-40" : ""
                )}
              />
            );
          })}

          {nodes.map((n) => {
            const lit = isLit(n.id);
            const critical = pathIds.has(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${n.id} ${n.title}`}
                onClick={() => onSelect(n.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(n.id);
                  }
                }}
                className="cursor-pointer focus-visible:outline-none"
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  className={cn(
                    "transition-all",
                    n.status === "done" ? "fill-secondary" : "fill-card",
                    critical ? "stroke-blocked" : lit ? "stroke-accent" : "stroke-border",
                    selected && !lit && !critical ? "opacity-50" : ""
                  )}
                  strokeWidth={n.id === selected ? 2.5 : critical ? 2 : 1.2}
                />
                <text x={12} y={22} className="fill-muted-foreground text-[10px]">
                  {n.id} · {n.status}
                </text>
                <text x={12} y={40} className="fill-foreground text-[12px] font-medium">
                  {n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
