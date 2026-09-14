import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { ThreadProvider, useThreads } from "@/lib/threads";
import bunny from "@/assets/kanbunny.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kanbunny")({
  component: () => (
    <ThreadProvider>
      <KanbunnyLayout />
    </ThreadProvider>
  ),
});

function KanbunnyLayout() {
  const { threads, createThread, removeThread } = useThreads();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-lane p-3 md:flex">
        <Link to="/" className="mb-4 flex items-center gap-2 px-1">
          <img src={bunny} alt="Kanbunny mascot" width={32} height={32} className="size-8" />
          <span className="font-display text-sm font-bold">Back to board</span>
        </Link>

        <button
          onClick={() => {
            const t = createThread();
            navigate({ to: "/kanbunny/$threadId", params: { threadId: t.id } });
          }}
          className="mb-3 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" /> New chat
        </button>

        <div className="flex flex-col gap-1 overflow-y-auto">
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                params.threadId === t.id ? "bg-card font-medium" : "hover:bg-card/60"
              )}
            >
              <Link
                to="/kanbunny/$threadId"
                params={{ threadId: t.id }}
                className="line-clamp-1 flex-1 text-left"
              >
                {t.title}
              </Link>
              <button
                aria-label="Delete chat"
                onClick={() => {
                  removeThread(t.id);
                  if (params.threadId === t.id) navigate({ to: "/kanbunny" });
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
          {threads.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">No chats yet this visit.</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
