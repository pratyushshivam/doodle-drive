import { defineConfig } from "vitest/config";

// A relative base lets the same build run at a domain root or under /doodle-drive/.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: { port: 5199, strictPort: true },
  preview: { port: 5198, strictPort: true },
  // The course tests drive every course from start to finish, which takes a while on a busy machine.
  test: { testTimeout: 120_000 },
});
