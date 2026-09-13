import "dotenv/config";
import { defineConfig } from "@playwright/test";

// End-to-end tests run a production build on port 3200 against TEST_DATABASE_URL,
// so they never touch your development data. Run with `pnpm e2e`.
// (3200, not A-Class's 3100, so both projects' suites can run side by side.)
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: "tsx server.ts",
    url: `http://localhost:${PORT}/api/menu`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
