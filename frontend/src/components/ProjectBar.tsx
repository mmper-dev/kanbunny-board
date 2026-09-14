import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { projectTint } from "@/lib/board-data";
import { useBoard } from "@/lib/board-store";
import { cn } from "@/lib/utils";

export function ProjectBar({
  active,
  onChange,
}: {
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  const { projects, tasks, addProject, renameProject, deleteProject } = useBoard();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const count = (id: string | null) =>
    id ? tasks.filter((t) => t.projectId === id).length : tasks.length;

  const project = projects.find((p) => p.id === pendingDelete);

  const commitRename = (id: string, fallback: string) => {
    void renameProject(id, draftName.trim() || fallback);
    setEditing(null);
  };

  const commitAdd = () => {
    if (newName.trim()) void addProject(newName.trim());
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        onClick={() => onChange(null)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs transition-colors",
          active === null
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        )}
      >
        All projects · {count(null)}
      </button>

      {projects.map((p) =>
        editing === p.id ? (
          <span key={p.id} className="flex items-center gap-1">
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(p.id, p.name);
                if (e.key === "Escape") setEditing(null);
              }}
              className="h-8 w-40 text-xs"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => commitRename(p.id, p.name)}
              aria-label="Save project name"
            >
              <Check className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditing(null)}
              aria-label="Cancel rename"
            >
              <X className="size-4" />
            </Button>
          </span>
        ) : (
          <span
            key={p.id}
            style={active === p.id ? undefined : { backgroundColor: projectTint(p.hue) }}
            className={cn(
              "group flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
              active === p.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80"
            )}
          >
            <button onClick={() => onChange(p.id)} className="py-0.5">
              {p.name} · {count(p.id)}
            </button>
            <button
              onClick={() => {
                setEditing(p.id);
                setDraftName(p.name);
              }}
              aria-label={`Rename ${p.name}`}
              className="opacity-60 hover:opacity-100"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={() => setPendingDelete(p.id)}
              aria-label={`Delete ${p.name}`}
              className="opacity-60 hover:opacity-100"
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        )
      )}

      {adding ? (
        <span className="flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) commitAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            className="h-8 w-40 text-xs"
          />
          <Button size="sm" onClick={commitAdd}>
            Add
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Project
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={project ? `Delete ${project.name}?` : "Delete project?"}
        description={
          project
            ? `This also removes ${count(project.id)} task(s) and any links to them.`
            : "This also removes its tasks and any links to them."
        }
        onConfirm={() => {
          if (!pendingDelete) return;
          if (active === pendingDelete) onChange(null);
          void deleteProject(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
