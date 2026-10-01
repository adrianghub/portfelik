import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "quality-matrix.spec.ts",
  testIgnore: [],
  outputDir: "test-results-matrix",
  workers: 2,
  projects: [
    {
      name: "chrome-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "chrome-small", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 740 } } },
    {
      name: "chrome-mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "chrome-landscape",
      use: { ...devices["Pixel 7"], viewport: { width: 844, height: 390 } },
    },
    {
      name: "chrome-tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
  ],
});
