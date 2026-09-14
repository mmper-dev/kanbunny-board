/**
 * Pure queries over a task list. No React, no module state, no seed data.
 *
 * Every function takes `tasks` explicitly. The original helpers defaulted to the static seed
 * array, which meant callers silently read demo data instead of live state — the bug that made
 * the board read-only. See _docs/specs.md §5.6.
 */
import { PRIORITY_RANK, type Status, type Task } from "@/lib/board-data";

export const byId = (tasks: Task[], id: string): Task | undefined => tasks.find((t) => t.id === id);

/** Unfinished dependencies — the things actually holding this task up. */
export function blockers(tasks: Task[], task: Task): Task[] {
  return task.dependsOn
    .map((d) => byId(tasks, d))
    .filter((t): t is Task => t !== undefined && t.status !== "done");
}

/** Tasks that wait on this one. */
export function dependents(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.dependsOn.includes(id));
}

export function isReady(tasks: Task[], task: Task): boolean {
  return task.status !== "done" && blockers(tasks, task).length === 0;
}

/** Layer index for the graph: longest path from a dependency-free root. */
export function depthOf(tasks: Task[], task: Task, seen: Set<string> = new Set()): number {
  if (seen.has(task.id)) return 0;
  seen.add(task.id);
  if (task.dependsOn.length === 0) return 0;
  const depths = task.dependsOn.map((d) => {
    const dep = byId(tasks, d);
    return dep ? depthOf(tasks, dep, new Set(seen)) : 0;
  });
  return depths.length ? 1 + Math.max(...depths) : 0;
}

/**
 * Would pointing `taskId`'s dependsOn at `nextDependsOn` create a cycle?
 *
 * Walks the proposed dependencies backwards; reaching `taskId` means the edge closes a loop. A
 * diamond (A→B, A→C, B→D, C→D) is not a cycle and must stay allowed.
 */
export function wouldCycle(tasks: Task[], taskId: string, nextDependsOn: string[]): boolean {
  if (nextDependsOn.includes(taskId)) return true;

  const seen = new Set<string>();
  const stack = [...nextDependsOn];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    if (current === taskId) return true;
    seen.add(current);
    const task = byId(tasks, current);
    if (task) stack.push(...task.dependsOn);
  }

  return false;
}

/** The dependency chain that most constrains delivery, ordered root → leaf. */
export function criticalPath(tasks: Task[]): Task[] {
  const memo = new Map<string, Task[]>();

  const chainEndingAt = (task: Task, visiting: Set<string>): Task[] => {
    const cached = memo.get(task.id);
    if (cached) return cached;
    if (visiting.has(task.id)) return [task]; // defensive: a cycle should be impossible

    visiting.add(task.id);
    let longest: Task[] = [];
    for (const depId of task.dependsOn) {
      const dep = byId(tasks, depId);
      if (!dep) continue;
      const candidate = chainEndingAt(dep, visiting);
      if (candidate.length > longest.length) longest = candidate;
    }
    visiting.delete(task.id);

    const chain = [...longest, task];
    memo.set(task.id, chain);
    return chain;
  };

  let best: Task[] = [];
  for (const task of tasks) {
    const chain = chainEndingAt(task, new Set());
    if (chain.length > best.length) best = chain;
  }
  return best.length > 1 ? best : [];
}

export function laneCounts(tasks: Task[]): Record<Status, number> {
  const counts: Record<Status, number> = { backlog: 0, todo: 0, doing: 0, done: 0 };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

/** Free-text filter across the fields a person would actually search by. */
export function matches(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) =>
    [t.id, t.title, t.detail, t.status, t.assignee, t.priority].join(" ").toLowerCase().includes(q)
  );
}

/** Ready work, most pressing first. */
export function readyTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => isReady(tasks, t))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.points - a.points);
}

export const subtaskProgress = (task: Task): { done: number; total: number } => ({
  done: task.subtasks.filter((s) => s.status === "done").length,
  total: task.subtasks.length,
});
