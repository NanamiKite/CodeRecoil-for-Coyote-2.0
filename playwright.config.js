const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/ui", workers: 1, reporter: "list",
  use: { headless: true, viewport: { width: 360, height: 900 },
    channel: process.platform === "win32" ? "msedge" : undefined },
});
