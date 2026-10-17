import { defineConfig } from "vitest/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Match the tsconfig "@/*" path alias so tests can import app modules.
    alias: { "@": root },
  },
  test: {
    environment: "node",
    // Preserve the existing suite's mock lifetime when upgrading to Vitest 5.
    clearMocks: false,
    include: ["lib/**/*.test.ts"],
  },
});
