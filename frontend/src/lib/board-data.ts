/**
 * The board's domain model.
 *
 * These field names are the wire contract for the future Python service — do not rename them.
 * Seed data lives in src/api/seed.ts; pure queries live in src/lib/board-queries.ts.
 */

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

/** Everything needed to create or patch a task. The id and subtasks are owned by the API. */
export type TaskInput = Omit<Task, "id" | "subtasks">;

/** Everything needed to create or patch a subtask. The id is owned by the API. */
export type SubtaskInput = Omit<Subtask, "id">;

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

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

/** Per-lane empty copy. Templating off the label reads badly ("Nothing in the harvested yet"). */
export const LANE_EMPTY_COPY: Record<Status, string> = {
  backlog: "The burrow is empty.",
  todo: "Nothing queued up next.",
  doing: "Nothing in motion.",
  done: "Nothing harvested yet.",
};

/** Sort weight for "what should I do first" ordering. */
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Background tint for a project chip, derived from its hue. */
export const projectTint = (hue: number, lightness = 0.93, chroma = 0.06) =>
  `oklch(${lightness} ${chroma} ${hue})`;
