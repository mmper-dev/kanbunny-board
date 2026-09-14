import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useThreads } from "@/lib/threads";
import bunny from "@/assets/kanbunny.png";

export const Route = createFileRoute("/kanbunny/")({
  head: () => ({
    meta: [
      { title: "Ask Kanbunny — board assistant" },
      {
        name: "description",
        content: "Chat with Kanbunny to search tasks and understand what blocks what on the board.",
      },
      { property: "og:title", content: "Ask Kanbunny" },
      {
        property: "og:description",
        content: "A rabbit assistant that searches your kanban board and explains blockers.",
      },
    ],
  }),
  component: KanbunnyStart,
});

function KanbunnyStart() {
  const { createThread } = useThreads();
  const navigate = useNavigate();

  useEffect(() => {
    const t = createThread();
    void navigate({ to: "/kanbunny/$threadId", params: { threadId: t.id }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center">
      <img src={bunny} alt="" width={72} height={72} className="size-16 animate-pulse" />
    </div>
  );
}
