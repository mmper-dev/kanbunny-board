import { useMemo } from "react";
import { TASKS, depthOf, type Task } from "@/lib/board-data";
import { cn } from "@/lib/utils";

const NODE_W = 168;
const NODE_H = 58;
const GAP_X = 84;
const GAP_Y = 26;

type Placed = Task & { x: number; y: number };

export function DependencyGraph({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes, width, height } = useMemo(() => {
    const layers = new Map<number, Task[]>();
    for (const t of TASKS) {
      const d = depthOf(t);
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
      width: (Math.max(...depths) + 1) * (NODE_W + GAP_X) + 32,
      height: maxRows * (NODE_H + GAP_Y) + 32,
    };
  }, []);

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
    return Boolean(sel?.dependsOn.includes(id)) || Boolean(pos.get(id)?.dependsOn.includes(selected));
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card/70 p-2">
      <svg width={width} height={height} className="min-w-full">
        <defs>
          <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-muted-foreground" />
          </marker>
          <marker id="arrow-lit" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="currentColor" className="text-accent" />
          </marker>
        </defs>

        {edges.map(({ from, to }) => {
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          const lit = isLit(from.id) && isLit(to.id);
          return (
            <path
              key={`${from.id}-${to.id}`}
              d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
              fill="none"
              strokeWidth={lit ? 2.5 : 1.5}
              markerEnd={`url(#${lit ? "arrow-lit" : "arrow"})`}
              className={cn(
                "transition-colors",
                lit ? "stroke-accent" : "stroke-border",
                selected && !lit ? "opacity-40" : ""
              )}
            />
          );
        })}

        {nodes.map((n) => {
          const lit = isLit(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => onSelect(n.id)}
              className="cursor-pointer"
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={12}
                className={cn(
                  "transition-all",
                  n.status === "done" ? "fill-secondary" : "fill-card",
                  lit ? "stroke-accent" : "stroke-border",
                  selected && !lit ? "opacity-50" : ""
                )}
                strokeWidth={n.id === selected ? 2.5 : 1.2}
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
  );
}
