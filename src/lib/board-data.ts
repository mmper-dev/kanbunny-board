export type Status = "backlog" | "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";

export type Subtask = {
  id: string;
  title: string;
  status: Status;
  assignee: string;
};

export type Task = {
  id: string;
  title: string;
  detail: string;
  status: Status;
  priority: Priority;
  assignee: string;
  points: number;
  projectId: string;
  subtasks: Subtask[];
  /** ids of tasks that must finish before this one */
  dependsOn: string[];
};

export type Project = {
  id: string;
  name: string;
  hue: number;
};

export const COLUMNS: { id: Status; label: string }[] = [
  { id: "backlog", label: "Burrow" },
  { id: "todo", label: "Next hop" },
  { id: "doing", label: "In motion" },
  { id: "done", label: "Harvested" },
];

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Burrow",
  todo: "Next hop",
  doing: "In motion",
  done: "Harvested",
};

export const PROJECTS: Project[] = [
  { id: "P-1", name: "Carrot Ops", hue: 24 },
  { id: "P-2", name: "Meadow Platform", hue: 142 },
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
    projectId: "P-1",
    subtasks: [
      { id: "S-1", title: "Draft ERD", status: "done", assignee: "Mila" },
      { id: "S-2", title: "Review with Otto", status: "done", assignee: "Otto" },
    ],
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
    projectId: "P-1",
    subtasks: [],
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
    projectId: "P-1",
    subtasks: [
      { id: "S-3", title: "Layout pass", status: "done", assignee: "Mila" },
      { id: "S-4", title: "Blocker list", status: "doing", assignee: "Mila" },
    ],
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
    projectId: "P-2",
    subtasks: [{ id: "S-5", title: "Edge routing", status: "doing", assignee: "Ines" }],
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
    projectId: "P-2",
    subtasks: [],
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
    projectId: "P-2",
    subtasks: [],
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
    projectId: "P-1",
    subtasks: [],
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
    projectId: "P-2",
    subtasks: [],
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
    projectId: "P-1",
    subtasks: [],
    dependsOn: ["T-5", "T-7"],
  },
];

export const byId = (id: string, tasks: Task[] = TASKS) => tasks.find((t) => t.id === id);

/** unfinished dependencies of a task */
export function blockers(task: Task, tasks: Task[] = TASKS): Task[] {
  return task.dependsOn
    .map((d) => byId(d, tasks))
    .filter((t): t is Task => Boolean(t) && t!.status !== "done");
}

export function dependents(id: string, tasks: Task[] = TASKS): Task[] {
  return tasks.filter((t) => t.dependsOn.includes(id));
}

/** simple layered layout: depth = longest path from a root */
export function depthOf(task: Task, tasks: Task[] = TASKS, seen = new Set<string>()): number {
  if (seen.has(task.id)) return 0;
  seen.add(task.id);
  if (task.dependsOn.length === 0) return 0;
  const depths = task.dependsOn.map((d) => {
    const dep = byId(d, tasks);
    return dep ? depthOf(dep, tasks, new Set(seen)) : 0;
  });
  return depths.length ? 1 + Math.max(...depths) : 0;
}

export function boardSummary(tasks: Task[] = TASKS) {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    points: t.points,
    dependsOn: t.dependsOn,
    subtasks: t.subtasks.map((s) => `${s.title} (${s.status})`),
    blockedBy: blockers(t, tasks).map((b) => b.id),
    blocks: dependents(t.id, tasks).map((b) => b.id),
  }));
}
