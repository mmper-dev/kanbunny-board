/**
 * The board's single source of truth.
 *
 * Holds the canonical task and project arrays and is the only place that mutates them. Every
 * mutation goes through `boardApi`, so the day the Python service exists this file changes and
 * nothing else does. See _docs/specs.md §5.4.
 *
 * Actions resolve to the affected entity, or to `null` when the API refused — they never reject,
 * so fire-and-forget callers (drag-and-drop, keyboard moves) cannot produce unhandled rejections.
 * Failures are surfaced as a toast here, once.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { boardApi } from "@/api/mock-api";
import type { Project, Status, SubtaskInput, Task, TaskInput } from "@/lib/board-data";

type BoardContextValue = {
  tasks: Task[];
  projects: Project[];
  loading: boolean;

  addTask: (input: TaskInput) => Promise<Task | null>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<boolean>;
  moveTask: (id: string, status: Status) => Promise<Task | null>;

  addSubtask: (taskId: string, input: SubtaskInput) => Promise<Task | null>;
  updateSubtask: (
    taskId: string,
    subtaskId: string,
    patch: Partial<SubtaskInput>
  ) => Promise<Task | null>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<Task | null>;

  addProject: (name: string) => Promise<Project | null>;
  renameProject: (id: string, name: string) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;

  resetBoard: () => Promise<void>;
};

const BoardContext = createContext<BoardContextValue | null>(null);

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong on the board.";

export function BoardProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const [nextTasks, nextProjects] = await Promise.all([
      boardApi.listTasks(),
      boardApi.listProjects(),
    ]);
    if (!mounted.current) return;
    setTasks(nextTasks);
    setProjects(nextProjects);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (error) {
        toast.error(message(error));
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
  }, [refresh]);

  /** Runs an API call, reports failure once, and never rejects. */
  const guard = useCallback(async <T,>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      toast.error(message(error));
      return fallback;
    }
  }, []);

  const replaceTask = useCallback((updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  // --- tasks ---------------------------------------------------------------

  const addTask = useCallback(
    (input: TaskInput) =>
      guard(async () => {
        const created = await boardApi.createTask(input);
        setTasks((prev) => [...prev, created]);
        return created;
      }, null),
    [guard]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<TaskInput>) =>
      guard(async () => {
        const updated = await boardApi.updateTask(id, patch);
        replaceTask(updated);
        return updated;
      }, null),
    [guard, replaceTask]
  );

  const deleteTask = useCallback(
    (id: string) =>
      guard(async () => {
        await boardApi.deleteTask(id);
        // The API prunes this id from every other task's dependsOn; re-read rather than
        // reimplementing the cascade on the client.
        await refresh();
        return true;
      }, false),
    [guard, refresh]
  );

  const moveTask = useCallback(
    (id: string, status: Status) => updateTask(id, { status }),
    [updateTask]
  );

  // --- subtasks ------------------------------------------------------------

  const addSubtask = useCallback(
    (taskId: string, input: SubtaskInput) =>
      guard(async () => {
        const updated = await boardApi.createSubtask(taskId, input);
        replaceTask(updated);
        return updated;
      }, null),
    [guard, replaceTask]
  );

  const updateSubtask = useCallback(
    (taskId: string, subtaskId: string, patch: Partial<SubtaskInput>) =>
      guard(async () => {
        const updated = await boardApi.updateSubtask(taskId, subtaskId, patch);
        replaceTask(updated);
        return updated;
      }, null),
    [guard, replaceTask]
  );

  const deleteSubtask = useCallback(
    (taskId: string, subtaskId: string) =>
      guard(async () => {
        const updated = await boardApi.deleteSubtask(taskId, subtaskId);
        replaceTask(updated);
        return updated;
      }, null),
    [guard, replaceTask]
  );

  // --- projects ------------------------------------------------------------

  const addProject = useCallback(
    (name: string) =>
      guard(async () => {
        const created = await boardApi.createProject({ name });
        setProjects((prev) => [...prev, created]);
        return created;
      }, null),
    [guard]
  );

  const renameProject = useCallback(
    (id: string, name: string) =>
      guard(async () => {
        const updated = await boardApi.updateProject(id, { name });
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }, null),
    [guard]
  );

  const deleteProject = useCallback(
    (id: string) =>
      guard(async () => {
        await boardApi.deleteProject(id);
        // Cascades to tasks and their inbound dependency links.
        await refresh();
        return true;
      }, false),
    [guard, refresh]
  );

  const resetBoard = useCallback(async () => {
    await guard(async () => {
      await boardApi.reset();
      await refresh();
      return true;
    }, false);
  }, [guard, refresh]);

  const value = useMemo<BoardContextValue>(
    () => ({
      tasks,
      projects,
      loading,
      addTask,
      updateTask,
      deleteTask,
      moveTask,
      addSubtask,
      updateSubtask,
      deleteSubtask,
      addProject,
      renameProject,
      deleteProject,
      resetBoard,
    }),
    [
      tasks,
      projects,
      loading,
      addTask,
      updateTask,
      deleteTask,
      moveTask,
      addSubtask,
      updateSubtask,
      deleteSubtask,
      addProject,
      renameProject,
      deleteProject,
      resetBoard,
    ]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside BoardProvider");
  return ctx;
}
