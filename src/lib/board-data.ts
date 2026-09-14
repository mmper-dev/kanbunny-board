export type Status = "backlog" | "todo" | "doing" | "done";

export type Task = {
  id: string;
  title: string;
  detail: string;
  status: Status;
  priority: "low" | "medium" | "high";
  assignee: string;
  points: number;
  /** ids of tasks that must finish before this one */
  dependsOn: string[];
};

export const COLUMNS: { id: Status; label: string }[] = [
  { id: "backlog", label: "Burrow" },
  { id: "todo", label: "Next hop" },
  { id: "doing", label: "In motion" },
  { id: "done", label: "Harvested" },
];

export const TASKS: Task[] = [
  {
    id: "T-1",
    title: "Define carrot schema",
    detail: "Shape the core data model for crops, plots and harvest cycles.",
    status: "done",
    priority: "high",
    assignee: "Mila",
    points: 5,
    dependsOn: [],
  },
  {
    id: "T-2",
    title: "Seed sample plots",
    detail: "Fill the demo board with realistic plots so the graph has depth.",
    status: "done",
    priority: "medium",
    assignee: "Otto",
    points: 3,
    dependsOn: ["T-1"],
  },
  {
    id: "T-3",
    title: "Plot detail drawer",
    detail: "Side panel with owner, notes and blocking relationships.",
    status: "doing",
    priority: "high",
    assignee: "Mila",
    points: 8,
    dependsOn: ["T-1", "T-2"],
  },
  {
    id: "T-4",
    title: "Dependency graph view",
    detail: "Layered graph that shows what blocks what across the board.",
    status: "doing",
    priority: "high",
    assignee: "Ines",
    points: 8,
    dependsOn: ["T-2"],
  },
  {
    id: "T-5",
    title: "Critical path highlight",
    detail: "Trace the longest blocking chain and mark it on the graph.",
    status: "todo",
    priority: "medium",
    assignee: "Ines",
    points: 5,
    dependsOn: ["T-4"],
  },
  {
    id: "T-6",
    title: "Kanbunny answers",
    detail: "Let the bunny search tasks and explain blockers in plain words.",
    status: "todo",
    priority: "high",
    assignee: "Otto",
    points: 8,
    dependsOn: ["T-3", "T-4"],
  },
  {
    id: "T-7",
    title: "Weekly harvest digest",
    detail: "Summarise moved cards and newly unblocked work every Friday.",
    status: "backlog",
    priority: "low",
    assignee: "Mila",
    points: 3,
    dependsOn: ["T-6"],
  },
  {
    id: "T-8",
    title: "Board keyboard shortcuts",
    detail: "Hop between columns and cards without touching the mouse.",
    status: "backlog",
    priority: "low",
    assignee: "Ines",
    points: 2,
    dependsOn: [],
  },
  {
    id: "T-9",
    title: "Burrow analytics",
    detail: "Throughput, cycle time and blocked-time per lane.",
    status: "backlog",
    priority: "medium",
    assignee: "Otto",
    points: 5,
    dependsOn: ["T-5", "T-7"],
  },
];

export const byId = (id: string) => TASKS.find((t) => t.id === id);

/** tasks blocked by an unfinished dependency */
export function blockers(task: Task): Task[] {
  return task.dependsOn
    .map(byId)
    .filter((t): t is Task => Boolean(t) && t!.status !== "done");
}

export function dependents(id: string): Task[] {
  return TASKS.filter((t) => t.dependsOn.includes(id));
}

/** simple layered layout: depth = longest path from a root */
export function depthOf(task: Task, seen = new Set<string>()): number {
  if (seen.has(task.id)) return 0;
  seen.add(task.id);
  if (task.dependsOn.length === 0) return 0;
  return (
    1 +
    Math.max(
      ...task.dependsOn.map((d) => {
        const dep = byId(d);
        return dep ? depthOf(dep, new Set(seen)) : 0;
      })
    )
  );
}

export function boardSummary() {
  return TASKS.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    points: t.points,
    dependsOn: t.dependsOn,
    blockedBy: blockers(t).map((b) => b.id),
    blocks: dependents(t.id).map((b) => b.id),
  }));
}
