import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import bunny from "@/assets/kanbunny.png";

const SUGGESTIONS = [
  "What is blocking the dependency graph work?",
  "What can Otto start right now?",
  "Explain the longest chain on the board",
];

export function ChatWindow({
  threadId,
  onFirstMessage,
}: {
  threadId: string;
  onFirstMessage: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (err: Error) => toast.error(err.message || "Kanbunny could not answer right now."),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    if (messages.length === 0) onFirstMessage(value);
    void sendMessage({ text: value });
    setInput("");
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <img src={bunny} alt="Kanbunny" width={28} height={28} className="size-7" />
        <h1 className="text-sm font-bold">Kanbunny</h1>
        <span className="text-xs text-muted-foreground">searches and explains your board</span>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<img src={bunny} alt="" width={64} height={64} className="size-16" />}
              title="Ask the bunny"
              description="Search tasks, find blockers, or get a plain-words explanation of the graph."
            >
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          )}

          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <MessageResponse key={i}>{part.text}</MessageResponse>;
                  }
                  if (part.type === "tool-searchTasks") {
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader type="Searched the board" state={part.state} />
                        <ToolContent>
                          <ToolInput input={part.input} />
                          <ToolOutput output={part.output} errorText={part.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && <Shimmer className="text-sm">Kanbunny is sniffing around…</Shimmer>}
          {error && (
            <p className="text-sm text-destructive">Kanbunny hit a snag. Try sending that again.</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-5">
        <PromptInput
          onSubmit={(message, event) => {
            event.preventDefault();
            send(message.text || input);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Ask about tasks, owners or blockers…"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() && !busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
