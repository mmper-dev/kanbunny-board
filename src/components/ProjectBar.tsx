import { useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

  const count = (id: string | null) =>
    id ? tasks.filter((t) => t.projectId === id).length : tasks.length;

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
                if (e.key === "Enter") {
                  renameProject(p.id, draftName.trim() || p.name);
                  setEditing(null);
                }
                if (e.key === "Escape") setEditing(null);
              }}
              className="h-8 w-40 text-xs"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                renameProject(p.id, draftName.trim() || p.name);
                setEditing(null);
              }}
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
            className={cn(
              "group flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
              active === p.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground"
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
              onClick={() => {
                if (active === p.id) onChange(null);
                deleteProject(p.id);
              }}
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
              if (e.key === "Enter" && newName.trim()) {
                addProject(newName.trim());
                setNewName("");
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            className="h-8 w-40 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              if (newName.trim()) addProject(newName.trim());
              setNewName("");
              setAdding(false);
            }}
          >
            Add
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Project
        </Button>
      )}
    </div>
  );
}
