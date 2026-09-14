import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { Task } from "@/lib/board-data";
import { subtaskProgress } from "@/lib/board-queries";
import { useBoard } from "@/lib/board-store";

/**
 * Subtasks commit straight to the store rather than joining the dialog's draft — they are their
 * own entities with their own ids, and the API exposes them that way.
 *
 * The model carries all four lane statuses per subtask; the UI deliberately exposes only
 * done / not-done. Four lanes per subtask is more ceremony than a mini board needs.
 */
export function SubtaskList({ task }: { task: Task }) {
  const { addSubtask, updateSubtask, deleteSubtask } = useBoard();
  const [draft, setDraft] = useState("");
  const { done, total } = subtaskProgress(task);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    void addSubtask(task.id, { title, status: "todo", assignee: task.assignee });
    setDraft("");
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Subtasks</Label>
        {total > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {done}/{total}
          </span>
        )}
      </div>

      {total > 0 && <Progress value={(done / total) * 100} className="h-1" />}

      <div className="grid gap-1 rounded-xl border border-border p-2">
        {total === 0 && <p className="p-1 text-xs text-muted-foreground">No subtasks yet.</p>}

        {task.subtasks.map((subtask) => (
          <div key={subtask.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
            <Checkbox
              checked={subtask.status === "done"}
              aria-label={`Mark ${subtask.title} done`}
              onCheckedChange={(checked) =>
                void updateSubtask(task.id, subtask.id, { status: checked ? "done" : "todo" })
              }
            />
            <Input
              value={subtask.title}
              onChange={(event) =>
                void updateSubtask(task.id, subtask.id, { title: event.target.value })
              }
              aria-label="Subtask title"
              className="h-8 flex-1 border-transparent bg-transparent text-sm shadow-none focus-visible:border-input"
            />
            <Input
              value={subtask.assignee}
              onChange={(event) =>
                void updateSubtask(task.id, subtask.id, { assignee: event.target.value })
              }
              aria-label="Subtask owner"
              placeholder="Owner"
              className="h-8 w-24 text-xs"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${subtask.title}`}
              onClick={() => void deleteSubtask(task.id, subtask.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2 px-1.5 pt-1">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Add a subtask…"
            className="h-8 flex-1 text-sm"
          />
          <Button size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
