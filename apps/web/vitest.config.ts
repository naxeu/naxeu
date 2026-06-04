import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only unit tests under src; Playwright specs in e2e/ are excluded.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
