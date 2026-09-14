/**
 * BoardApi over HTTP, against the FastAPI service.
 *
 * Paths are relative by default — `/api/tasks`, not `http://localhost:8000/api/tasks` — so in
 * development the browser calls its own origin and Vite proxies `/api` to the backend. Nothing is
 * cross-origin, so CORS never enters into it. For a deployed build, set `VITE_API_BASE_URL` to the
 * API's origin; that request *is* cross-origin, and the backend's CORS list has to include the
 * site's origin for the browser to allow it.
 *
 * See _docs/specs.md §5 and openapi.yaml.
 */
import type { Project, SubtaskInput, Task, TaskInput } from "@/lib/board-data";
import { BoardApiError, type BoardApi } from "./board-api";
import { getToken, setToken } from "./token";

const BASE = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");

/** The shape every error response uses — see the `Error` schema in openapi.yaml. */
type ErrorBody = { code?: string; message?: string; details?: Record<string, unknown> };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    // fetch only rejects when the request never got an answer: the service is down, DNS failed,
    // or the browser blocked it. A CORS refusal also lands here, with nothing readable to report.
    throw new BoardApiError("Could not reach the board service. Is the backend running?");
  }

  if (response.status === 401) {
    // The token is gone or stale. Dropping it here flips the app back to the sign-in screen
    // rather than leaving every later request to fail the same way.
    setToken(null);
  }

  if (!response.ok) {
    let body: ErrorBody = {};
    try {
      body = (await response.json()) as ErrorBody;
    } catch {
      // A proxy or a crash can produce a non-JSON error page; fall through to a generic message.
    }
    throw new BoardApiError(body.message || `The board service returned ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const body = (value: unknown) => JSON.stringify(value);

export function createHttpBoardApi(): BoardApi {
  return {
    listProjects: () => request<Project[]>("/api/projects"),
    createProject: (input) =>
      request<Project>("/api/projects", { method: "POST", body: body(input) }),
    updateProject: (id, patch) =>
      request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: body(patch),
      }),
    deleteProject: (id) =>
      request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),

    listTasks: () => request<Task[]>("/api/tasks"),
    createTask: (input: TaskInput) =>
      request<Task>("/api/tasks", { method: "POST", body: body(input) }),
    updateTask: (id, patch) =>
      request<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: body(patch),
      }),
    deleteTask: (id) =>
      request<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),

    createSubtask: (taskId, input: SubtaskInput) =>
      request<Task>(`/api/tasks/${encodeURIComponent(taskId)}/subtasks`, {
        method: "POST",
        body: body(input),
      }),
    updateSubtask: (taskId, subtaskId, patch) =>
      request<Task>(
        `/api/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`,
        { method: "PATCH", body: body(patch) }
      ),
    deleteSubtask: (taskId, subtaskId) =>
      request<Task>(
        `/api/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`,
        { method: "DELETE" }
      ),

    reset: () => {
      // Deliberately absent from the contract: restoring demo data is a property of the mock, not
      // something a real service should expose.
      throw new BoardApiError("Resetting the board is only available in demo mode.");
    },
  };
}

// --- auth -------------------------------------------------------------------------------------

type TokenResponse = { accessToken: string; tokenType: string; expiresIn: number };

export async function login(username: string, password: string): Promise<string> {
  const result = await request<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: body({ username, password }),
  });
  return result.accessToken;
}

export async function fetchCurrentUser(): Promise<{ id: string; username: string }> {
  return request<{ id: string; username: string }>("/api/auth/me");
}
