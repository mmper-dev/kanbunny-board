import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useThreads } from "@/lib/threads";
import { ChatWindow } from "@/components/ChatWindow";

export const Route = createFileRoute("/kanbunny/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat with Kanbunny" },
      {
        name: "description",
        content: "Ask the bunny to find tasks, list blockers, or explain the dependency chain.",
      },
      { property: "og:title", content: "Chat with Kanbunny" },
      {
        property: "og:description",
        content: "Ask the bunny to find tasks, list blockers, or explain the dependency chain.",
      },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = useParams({ from: "/kanbunny/$threadId" });
  const { ensureThread, renameThread } = useThreads();

  useEffect(() => {
    ensureThread(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      onFirstMessage={(text) => renameThread(threadId, text.slice(0, 32))}
    />
  );
}
