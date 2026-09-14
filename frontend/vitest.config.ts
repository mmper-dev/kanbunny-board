// Kept separate from vite.config.ts: that one is the Lovable/TanStack Start pipeline, which the
// test runner has no business booting. These tests cover pure logic and the mock API, so a plain
// Vite config with the @/* alias is all they need.
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
