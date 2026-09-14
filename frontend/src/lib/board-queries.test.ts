import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/board-data";
import {
  blockers,
  criticalPath,
  dependents,
  depthOf,
  isReady,
  laneCounts,
  matches,
  wouldCycle,
} from "@/lib/board-queries";
import { SEED_TASKS } from "@/api/seed";

const task = (id: string, dependsOn: string[] = [], over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  detail: "",
  status: "todo",
  priority: "medium",
  assignee: "Mila",
  points: 1,
  projectId: "P-1",
  subtasks: [],
  dependsOn,
  ...over,
});

describe("blockers / dependents", () => {
  it("counts only unfinished dependencies as blockers", () => {
    const tasks = [task("A", [], { status: "done" }), task("B"), task("C", ["A", "B"])];
    const c = tasks[2]!;
    expect(blockers(tasks, c).map((t) => t.id)).toEqual(["B"]);
  });

  it("ignores dependency ids that no longer exist", () => {
    const tasks = [task("C", ["ghost"])];
    expect(blockers(tasks, tasks[0]!)).toEqual([]);
  });

  it("finds the tasks waiting on one", () => {
    const tasks = [task("A"), task("B", ["A"]), task("C", ["A"])];
    expect(dependents(tasks, "A").map((t) => t.id)).toEqual(["B", "C"]);
  });
});

describe("isReady", () => {
  it("is true with no unfinished dependencies", () => {
    const tasks = [task("A", [], { status: "done" }), task("B", ["A"])];
    expect(isReady(tasks, tasks[1]!)).toBe(true);
  });

  it("is false for work already harvested", () => {
    const tasks = [task("A", [], { status: "done" })];
    expect(isReady(tasks, tasks[0]!)).toBe(false);
  });
});

describe("wouldCycle", () => {
  it("rejects a task depending on itself", () => {
    const tasks = [task("A")];
    expect(wouldCycle(tasks, "A", ["A"])).toBe(true);
  });

  it("rejects a direct back-edge", () => {
    const tasks = [task("A"), task("B", ["A"])];
    expect(wouldCycle(tasks, "A", ["B"])).toBe(true);
  });

  it("rejects a transitive back-edge", () => {
    const tasks = [task("A"), task("B", ["A"]), task("C", ["B"])];
    expect(wouldCycle(tasks, "A", ["C"])).toBe(true);
  });

  it("allows a diamond", () => {
    // A → B, A → C, B → D, C → D is not a cycle and must stay selectable.
    const tasks = [task("A"), task("B", ["A"]), task("C", ["A"]), task("D", ["B"])];
    expect(wouldCycle(tasks, "D", ["B", "C"])).toBe(false);
  });

  it("allows an unrelated dependency", () => {
    const tasks = [task("A"), task("B"), task("C")];
    expect(wouldCycle(tasks, "A", ["B", "C"])).toBe(false);
  });
});

describe("depthOf", () => {
  it("counts the longest path from a root", () => {
    const tasks = [task("A"), task("B", ["A"]), task("C", ["A", "B"])];
    expect(depthOf(tasks, tasks[0]!)).toBe(0);
    expect(depthOf(tasks, tasks[1]!)).toBe(1);
    expect(depthOf(tasks, tasks[2]!)).toBe(2);
  });
});

describe("criticalPath", () => {
  it("returns one continuous chain, root first", () => {
    const path = criticalPath(SEED_TASKS);
    expect(path.length).toBeGreaterThan(1);
    path.forEach((node, i) => {
      if (i === 0) return;
      expect(node.dependsOn).toContain(path[i - 1]!.id);
    });
  });

  it("is empty when nothing depends on anything", () => {
    expect(criticalPath([task("A"), task("B")])).toEqual([]);
  });
});

describe("laneCounts / matches", () => {
  it("counts every lane, including empty ones", () => {
    const counts = laneCounts([task("A", [], { status: "doing" })]);
    expect(counts).toEqual({ backlog: 0, todo: 0, doing: 1, done: 0 });
  });

  it("matches on id, title and assignee, case-insensitively", () => {
    const tasks = [task("T-1", [], { title: "Define carrot schema", assignee: "Mila" })];
    expect(matches(tasks, "carrot")).toHaveLength(1);
    expect(matches(tasks, "t-1")).toHaveLength(1);
    expect(matches(tasks, "mila")).toHaveLength(1);
    expect(matches(tasks, "otto")).toHaveLength(0);
  });

  it("returns everything for an empty query", () => {
    const tasks = [task("A"), task("B")];
    expect(matches(tasks, "   ")).toHaveLength(2);
  });
});
