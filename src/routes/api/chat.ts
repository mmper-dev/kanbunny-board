import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { boardSummary } from "@/lib/board-data";

type ChatRequestBody = { messages?: unknown };

const SYSTEM = `You are Kanbunny, a cheerful but concise rabbit assistant living inside a kanban board.
You help the team search tasks, explain what blocks what, and suggest what to hop on next.
Use the searchTasks tool whenever a question touches the board's content.
Keep answers short, use markdown lists, and refer to tasks by id and title (e.g. T-4 Dependency graph view).
A light rabbit pun now and then is welcome; never more than one per answer.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);

        const result = streamText({
          model: gateway("google/gemini-3.8-flash"),
          system: SYSTEM,
          messages: await convertToModelMessages(messages as UIMessage[]),
          stopWhen: stepCountIs(50),
          tools: {
            searchTasks: tool({
              description:
                "Search the kanban board. Returns matching tasks with status, owner, dependencies and blockers. Use an empty query to get the whole board.",
              inputSchema: z.object({
                query: z.string().describe("free text: title words, assignee, status or task id"),
              }),
              execute: async ({ query }) => {
                const all = boardSummary();
                const q = query.trim().toLowerCase();
                if (!q) return { matches: all };
                const matches = all.filter((t) =>
                  [t.id, t.title, t.detail, t.status, t.assignee, t.priority]
                    .join(" ")
                    .toLowerCase()
                    .includes(q)
                );
                return { matches: matches.length ? matches : all };
              },
            }),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
