/**
 * In-memory implementation of BoardApi.
 *
 * Stands in for the Python service so the whole app runs with no backend. It deliberately behaves
 * like a remote service rather than a local array:
 *   - it owns id generation,
 *   - it clones on the way in and out, so callers cannot mutate its state by reference,
 *   - it enforces the same invariants the server will (missing entities, dependency cycles),
 *   - it is async, and can simulate latency via VITE_MOCK_LATENCY.
 *
 * Swapping in http-api.ts should therefore surface no new failure modes. See _docs/specs.md §5.3.
 */
import type { Project, Subtask, SubtaskInput, Task, TaskInput } from "@/lib/board-data";
import { wouldCycle } from "@/lib/board-queries";
import { BoardApiError, type BoardApi } from "./board-api";
import { SEED_PROJECTS, SEED_TASKS } from "./seed";

const clone = <T>(value: T): T => structuredClone(value);

const latency = (() => {
  const raw = Number(import.meta.env["VITE_MOCK_LATENCY"] ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
})();

const settle = async <T>(value: T): Promise<T> => {
  if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
  return value;
};

/** `T-7` after `T-6` — max numeric suffix + 1, so ids stay stable and readable. */
const nextId = (prefix: string, existing: string[]): string => {
  const nums = existing
    .map((id) => Number(id.slice(prefix.length + 1)))
    .filter((n) => Number.isFinite(n));
  return `${prefix}-${(nums.length ? Math.max(...nums) : 0) + 1}`;
};

class MockBoardApi implements BoardApi {
  private tasks: Task[] = clone(SEED_TASKS);
  private projects: Project[] = clone(SEED_PROJECTS);

  // --- helpers -------------------------------------------------------------

  private task(id: string): Task {
    const found = this.tasks.find((t) => t.id === id);
    if (!found) throw new BoardApiError(`No task ${id}`);
    return found;
  }

  private project(id: string): Project {
    const found = this.projects.find((p) => p.id === id);
    if (!found) throw new BoardApiError(`No project ${id}`);
    return found;
  }

  private assertNoCycle(taskId: string, dependsOn: string[]): void {
    if (dependsOn.includes(taskId)) {
      throw new BoardApiError(`${taskId} cannot wait on itself.`);
    }
    if (wouldCycle(this.tasks, taskId, dependsOn)) {
      throw new BoardApiError(`That would make a loop in the dependency graph.`);
    }
  }

  // --- projects ------------------------------------------------------------

  async listProjects(): Promise<Project[]> {
    return settle(clone(this.projects));
  }

  async createProject(input: { name: string }): Promise<Project> {
    const created: Project = {
      id: nextId("P", this.projects.map((p) => p.id)),
      name: input.name.trim() || "Untitled project",
      // Spread the palette so adjacent projects stay visually distinct.
      hue: (this.projects.length * 67 + 24) % 360,
    };
    this.projects.push(created);
    return settle(clone(created));
  }

  async updateProject(id: string, patch: Partial<Omit<Project, "id">>): Promise<Project> {
    const project = this.project(id);
    Object.assign(project, patch);
    return settle(clone(project));
  }

  async deleteProject(id: string): Promise<void> {
    this.project(id);
    const orphaned = new Set(this.tasks.filter((t) => t.projectId === id).map((t) => t.id));
    this.projects = this.projects.filter((p) => p.id !== id);
    this.tasks = this.tasks
      .filter((t) => t.projectId !== id)
      .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => !orphaned.has(d)) }));
    return settle(undefined);
  }

  // --- tasks ---------------------------------------------------------------

  async listTasks(): Promise<Task[]> {
    return settle(clone(this.tasks));
  }

  async createTask(input: TaskInput): Promise<Task> {
    const created: Task = {
      ...clone(input),
      id: nextId("T", this.tasks.map((t) => t.id)),
      subtasks: [],
    };
    // A brand new task has no dependents, so it can only cycle through a bad `dependsOn` list.
    created.dependsOn = created.dependsOn.filter((d) => this.tasks.some((t) => t.id === d));
    this.tasks.push(created);
    return settle(clone(created));
  }

  async updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const task = this.task(id);
    if (patch.dependsOn) this.assertNoCycle(id, patch.dependsOn);
    Object.assign(task, clone(patch));
    return settle(clone(task));
  }

  async deleteTask(id: string): Promise<void> {
    this.task(id);
    this.tasks = this.tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }));
    return settle(undefined);
  }

  // --- subtasks ------------------------------------------------------------

  async createSubtask(taskId: string, input: SubtaskInput): Promise<Task> {
    const task = this.task(taskId);
    const allSubtaskIds = this.tasks.flatMap((t) => t.subtasks.map((s) => s.id));
    const created: Subtask = { ...input, id: nextId("S", allSubtaskIds) };
    task.subtasks.push(created);
    return settle(clone(task));
  }

  async updateSubtask(
    taskId: string,
    subtaskId: string,
    patch: Partial<SubtaskInput>
  ): Promise<Task> {
    const task = this.task(taskId);
    const subtask = task.subtasks.find((s) => s.id === subtaskId);
    if (!subtask) throw new BoardApiError(`No subtask ${subtaskId} on ${taskId}`);
    Object.assign(subtask, patch);
    return settle(clone(task));
  }

  async deleteSubtask(taskId: string, subtaskId: string): Promise<Task> {
    const task = this.task(taskId);
    task.subtasks = task.subtasks.filter((s) => s.id !== subtaskId);
    return settle(clone(task));
  }

  // --- demo affordance -----------------------------------------------------

  async reset(): Promise<void> {
    this.tasks = clone(SEED_TASKS);
    this.projects = clone(SEED_PROJECTS);
    return settle(undefined);
  }
}

/** src/api/index.ts decides whether this or the HTTP client is the one the app uses. */
export const createMockBoardApi = (): BoardApi => new MockBoardApi();
