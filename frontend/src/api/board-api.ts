/**
 * The board's data contract.
 *
 * Everything the UI knows about data access is this interface. Today it is backed by an in-memory
 * mock (mock-api.ts); later it will be backed by the Python service over HTTP (http-api.ts) with
 * no change to any caller. See _docs/specs.md §5.
 *
 * Three rules keep that swap free:
 *   1. Every method is async, from the first commit. Callers already await.
 *   2. The API returns the created or updated entity — the client never invents an id, because a
 *      database will own id generation.
 *   3. Subtask mutations return the parent Task, so callers never merge partial results.
 */
import type { Project, SubtaskInput, Task, TaskInput } from "@/lib/board-data";

export interface BoardApi {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string }): Promise<Project>;
  updateProject(id: string, patch: Partial<Omit<Project, "id">>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  createSubtask(taskId: string, input: SubtaskInput): Promise<Task>;
  updateSubtask(taskId: string, subtaskId: string, patch: Partial<SubtaskInput>): Promise<Task>;
  deleteSubtask(taskId: string, subtaskId: string): Promise<Task>;

  /** Restore the mockup dataset. Goes away when a real backend owns the data. */
  reset(): Promise<void>;
}

/** Thrown for anything the API refuses. The store surfaces `message` in a toast. */
export class BoardApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardApiError";
  }
}
