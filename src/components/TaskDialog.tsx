import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMNS, STATUS_LABEL, type Priority, type Status, type Task } from "@/lib/board-data";
import { useBoard } from "@/lib/board-store";

type Draft = {
  title: string;
  detail: string;
  status: Status;
  priority: Priority;
  assignee: string;
  points: number;
  projectId: string;
  dependsOn: string[];
};

const empty = (projectId: string): Draft => ({
  title: "",
  detail: "",
  status: "backlog",
  priority: "medium",
  assignee: "",
  points: 3,
  projectId,
  dependsOn: [],
});

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;
  defaultProjectId?: string;
}) {
  const { tasks, projects, addTask, updateTask } = useBoard();
  const fallbackProject = defaultProjectId ?? projects[0]?.id ?? "";
  const [draft, setDraft] = useState<Draft>(empty(fallbackProject));

  useEffect(() => {
    if (!open) return;
    setDraft(
      task
        ? {
            title: task.title,
            detail: task.detail,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee,
            points: task.points,
            projectId: task.projectId,
            dependsOn: task.dependsOn,
          }
        : empty(fallbackProject)
    );
  }, [open, task, fallbackProject]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    const payload = { ...draft, title: draft.title.trim() || "Untitled task" };
    if (task) updateTask(task.id, payload);
    else addTask(payload);
    onOpenChange(false);
  };

  const candidates = tasks.filter((t) => t.id !== task?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? `Edit ${task.id}` : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What needs doing?"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-detail">Notes</Label>
            <Textarea
              id="task-detail"
              value={draft.detail}
              onChange={(e) => set("detail", e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Project</Label>
              <Select value={draft.projectId} onValueChange={(v) => set("projectId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Lane</Label>
              <Select value={draft.status} onValueChange={(v) => set("status", v as Status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={draft.priority} onValueChange={(v) => set("priority", v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-owner">Owner</Label>
              <Input
                id="task-owner"
                value={draft.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                placeholder="Who hops on it?"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="task-points">Points</Label>
              <Input
                id="task-points"
                type="number"
                min={0}
                value={draft.points}
                onChange={(e) => set("points", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Waiting on</Label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-2">
              {candidates.length === 0 && (
                <p className="p-1 text-xs text-muted-foreground">No other tasks yet.</p>
              )}
              {candidates.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-secondary"
                >
                  <Checkbox
                    checked={draft.dependsOn.includes(t.id)}
                    onCheckedChange={(c) =>
                      set(
                        "dependsOn",
                        c ? [...draft.dependsOn, t.id] : draft.dependsOn.filter((d) => d !== t.id)
                      )
                    }
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">{t.id}</span>
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {STATUS_LABEL[t.status]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{task ? "Save changes" : "Add task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
