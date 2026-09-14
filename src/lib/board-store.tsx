import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PROJECTS, TASKS, type Project, type Subtask, type Task } from "@/lib/board-data";

type TaskDraft = Omit<Task, "id" | "subtasks"> & { subtasks?: Subtask[] };

type BoardContextValue = {
  tasks: Task[];
  projects: Project[];
  addTask: (draft: TaskDraft) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, "id">>) => void;
  deleteTask: (id: string) => void;
  addSubtask: (taskId: string, draft: Omit<Subtask, "id">) => void;
  updateSubtask: (taskId: string, subtaskId: string, patch: Partial<Omit<Subtask, "id">>) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  addProject: (name: string) => string;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
};

const BoardContext = createContext<BoardContextValue | null>(null);

const nextId = (prefix: string, existing: string[]) => {
  const nums = existing
    .map((id) => Number(id.replace(`${prefix}-`, "")))
    .filter((n) => Number.isFinite(n));
  return `${prefix}-${(nums.length ? Math.max(...nums) : 0) + 1}`;
};

export function BoardProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [projects, setProjects] = useState<Project[]>(PROJECTS);

  const addTask = useCallback((draft: TaskDraft) => {
    const id = nextId("T", tasksIds(draft));
    setTasks((prev) => {
      const newId = nextId("T", prev.map((t) => t.id));
      return [...prev, { ...draft, subtasks: draft.subtasks ?? [], id: newId }];
    });
    return id;
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Omit<Task, "id">>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev
        .filter((t) => t.id !== id)
        .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }))
    );
  }, []);

  const addSubtask = useCallback((taskId: string, draft: Omit<Subtask, "id">) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: [
                ...t.subtasks,
                { ...draft, id: nextId("S", prev.flatMap((x) => x.subtasks.map((s) => s.id))) },
              ],
            }
          : t
      )
    );
  }, []);

  const updateSubtask = useCallback(
    (taskId: string, subtaskId: string, patch: Partial<Omit<Subtask, "id">>) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, ...patch } : s)),
              }
            : t
        )
      );
    },
    []
  );

  const deleteSubtask = useCallback((taskId: string, subtaskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) } : t
      )
    );
  }, []);

  const addProject = useCallback((name: string) => {
    let created = "";
    setProjects((prev) => {
      const id = nextId("P", prev.map((p) => p.id));
      created = id;
      return [...prev, { id, name, hue: (prev.length * 67 + 24) % 360 }];
    });
    return created;
  }, []);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTasks((prev) => {
      const removed = new Set(prev.filter((t) => t.projectId === id).map((t) => t.id));
      return prev
        .filter((t) => t.projectId !== id)
        .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => !removed.has(d)) }));
    });
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      projects,
      addTask,
      updateTask,
      deleteTask,
      addSubtask,
      updateSubtask,
      deleteSubtask,
      addProject,
      renameProject,
      deleteProject,
    }),
    [
      tasks,
      projects,
      addTask,
      updateTask,
      deleteTask,
      addSubtask,
      updateSubtask,
      deleteSubtask,
      addProject,
      renameProject,
      deleteProject,
    ]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

function tasksIds(_draft: TaskDraft) {
  return [] as string[];
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside BoardProvider");
  return ctx;
}
