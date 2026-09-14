import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Move around",
    items: [
      ["← →  or  h l", "Previous / next lane"],
      ["↑ ↓  or  j k", "Previous / next card"],
      ["Home / End", "First / last card in the lane"],
      ["Enter", "Select the focused card"],
    ],
  },
  {
    title: "Move cards",
    items: [
      ["1 2 3 4", "Send to Burrow / Next hop / In motion / Harvested"],
      ["⇧ ← →", "Nudge one lane left or right"],
    ],
  },
  {
    title: "Work",
    items: [
      ["n", "New task"],
      ["e", "Edit the focused card"],
      ["Delete", "Delete the focused card"],
      ["/", "Search the board"],
    ],
  },
  {
    title: "View",
    items: [
      ["b / g", "Board / graph"],
      ["Esc", "Close, then clear the filter, then clear the selection"],
      ["?", "This list"],
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Hop around the board without touching the mouse.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
              <dl className="grid gap-1">
                {group.items.map(([keys, description]) => (
                  <div key={keys} className="flex items-baseline justify-between gap-3">
                    <dt>
                      <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
                        {keys}
                      </kbd>
                    </dt>
                    <dd className="flex-1 text-right text-xs text-muted-foreground">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
