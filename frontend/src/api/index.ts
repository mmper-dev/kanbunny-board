/**
 * Which BoardApi the app runs against.
 *
 *   VITE_API_MODE=mock   in-memory demo data, no backend needed (default)
 *   VITE_API_MODE=http   the FastAPI service, with sign-in
 *
 * Mock is the default so the app runs with nothing else installed. Copy .env.example to .env and
 * set http once the backend is up.
 */
import { createHttpBoardApi } from "./http-api";
import { createMockBoardApi } from "./mock-api";
import type { BoardApi } from "./board-api";

const MODE = (import.meta.env["VITE_API_MODE"] ?? "mock").toLowerCase();

/** True when the board is running on local demo data with no backend and no sign-in. */
export const IS_DEMO_MODE = MODE !== "http";

export const boardApi: BoardApi = IS_DEMO_MODE ? createMockBoardApi() : createHttpBoardApi();

export { BoardApiError } from "./board-api";
export type { BoardApi } from "./board-api";
