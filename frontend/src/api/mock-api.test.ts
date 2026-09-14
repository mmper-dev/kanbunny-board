import { beforeEach, describe, expect, it } from "vitest";
import { createMockBoardApi } from "@/api/mock-api";
import type { BoardApi } from "@/api/board-api";
import type { TaskInput } from "@/lib/board-data";

const draft = (over: Partial<TaskInput> = {}): TaskInput => ({
  title: "New task",
  detail: "",
  status: "backlog",
  priority: "medium",
  assignee: "Mila",
  points: 3,
  projectId: "P-1",
  dependsOn: [],
  ...over,
});

let api: BoardApi;

beforeEach(() => {
  api = createMockBoardApi();
});

describe("ids", () => {
  it("assigns a fresh task id and returns the created entity", async () => {
    const created = await api.createTask(draft());
    expect(created.id).toBe("T-10");
    expect(created.title).toBe("New task");
    expect(created.subtasks).toEqual([]);
  });

  it("does not collide when two tasks are created in a row", async () => {
    const first = await api.createTask(draft());
    const second = await api.createTask(draft());
    expect(first.id).not.toBe(second.id);
  });

  it("does not collide when two subtasks are added in a row", async () => {
    // The original store derived the id from a stale array and could hand out S-6 twice.
    await api.createSubtask("T-9", { title: "one", status: "todo", assignee: "Mila" });
    const task = await api.createSubtask("T-9", {
      title: "two",
      status: "todo",
      assignee: "Mila",
    });
    const ids = task.subtasks.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cascades", () => {
  it("prunes a deleted task from other tasks' dependsOn", async () => {
    await api.deleteTask("T-2");
    const tasks = await api.listTasks();
    expect(tasks.some((t) => t.id === "T-2")).toBe(false);
    expect(tasks.flatMap((t) => t.dependsOn)).not.toContain("T-2");
  });

  it("deletes a project's tasks and any links to them", async () => {
    await api.deleteProject("P-1");
    const [tasks, projects] = await Promise.all([api.listTasks(), api.listProjects()]);
    expect(projects.map((p) => p.id)).toEqual(["P-2"]);
    expect(tasks.every((t) => t.projectId !== "P-1")).toBe(true);
    // T-5 waited on T-4 (P-2) and T-9 waited on T-7 (P-1) — the P-1 link must be gone.
    expect(tasks.flatMap((t) => t.dependsOn)).not.toContain("T-7");
  });
});

describe("invariants", () => {
  it("refuses a dependency edge that would close a loop", async () => {
    // T-2 already waits on T-1, so T-1 waiting on T-2 is a cycle.
    await expect(api.updateTask("T-1", { dependsOn: ["T-2"] })).rejects.toThrow(/loop/i);
  });

  it("refuses a task depending on itself", async () => {
    await expect(api.updateTask("T-1", { dependsOn: ["T-1"] })).rejects.toThrow(/itself/i);
  });

  it("allows a legitimate new dependency", async () => {
    const updated = await api.updateTask("T-8", { dependsOn: ["T-1"] });
    expect(updated.dependsOn).toEqual(["T-1"]);
  });

  it("reports a missing task rather than failing silently", async () => {
    await expect(api.updateTask("T-404", { points: 1 })).rejects.toThrow(/No task/);
  });
});

describe("isolation", () => {
  it("does not expose internal state by reference", async () => {
    const tasks = await api.listTasks();
    tasks[0]!.title = "mutated locally";
    const again = await api.listTasks();
    expect(again[0]!.title).not.toBe("mutated locally");
  });

  it("restores the seed on reset", async () => {
    await api.deleteTask("T-1");
    await api.reset();
    const tasks = await api.listTasks();
    expect(tasks).toHaveLength(9);
  });

  it("gives each instance its own data", async () => {
    const other = createMockBoardApi();
    await api.deleteTask("T-1");
    expect(await other.listTasks()).toHaveLength(9);
  });
});
