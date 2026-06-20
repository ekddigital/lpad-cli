import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectProject } from "../src/detect.js";

function tempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lpad-detect-test-"));
}

function writeJson(root: string, rel: string, data: unknown): void {
  const filePath = path.join(root, rel);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

test("detectProject identifies Next.js with Prisma and NextAuth", () => {
  const root = tempProjectDir();
  writeJson(root, "package.json", {
    scripts: { build: "prisma generate && next build", start: "next start" },
    dependencies: {
      next: "16.0.0",
      "next-auth": "^4.0.0",
      "@prisma/client": "^7.0.0",
    },
  });
  fs.mkdirSync(path.join(root, "prisma"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "prisma", "schema.prisma"),
    'datasource db { provider = "postgresql" }',
    "utf8",
  );

  const detected = detectProject(root);
  assert.equal(detected.type, "nextjs");
  assert.equal(detected.framework, "Next.js");
  assert.equal(detected.deployMode, "pm2");
  assert.equal(detected.hasPrisma, true);
  assert.equal(detected.hasNextAuth, true);
});

test("detectProject identifies FastAPI Python project", () => {
  const root = tempProjectDir();
  fs.writeFileSync(
    path.join(root, "requirements.txt"),
    "fastapi\nuvicorn\n",
    "utf8",
  );

  const detected = detectProject(root);
  assert.equal(detected.type, "python");
  assert.equal(detected.framework, "FastAPI");
  assert.equal(detected.deployMode, "process");
  assert.equal(detected.runtime, "python");
});

test("detectProject identifies Go project", () => {
  const root = tempProjectDir();
  fs.writeFileSync(path.join(root, "go.mod"), "module example.com/app\n", "utf8");

  const detected = detectProject(root);
  assert.equal(detected.type, "go");
  assert.equal(detected.framework, "Go");
  assert.equal(detected.runtime, "go");
});

test("detectProject identifies Docker project", () => {
  const root = tempProjectDir();
  fs.writeFileSync(path.join(root, "Dockerfile"), "FROM node:20\n", "utf8");

  const detected = detectProject(root);
  assert.equal(detected.type, "docker");
  assert.equal(detected.deployMode, "docker");
});

test("detectProject identifies static HTML site", () => {
  const root = tempProjectDir();
  fs.writeFileSync(path.join(root, "index.html"), "<html></html>", "utf8");

  const detected = detectProject(root);
  assert.equal(detected.type, "static");
  assert.equal(detected.deployMode, "static");
});

test("detectProject reads lpad.config.json script deploy mode", () => {
  const root = tempProjectDir();
  writeJson(root, "lpad.config.json", {
    type: "api",
    deployMode: "script",
    runtime: "binary",
    deployScript: "deploy-production.sh",
  });

  const detected = detectProject(root);
  assert.equal(detected.type, "binary");
  assert.equal(detected.deployMode, "script");
  assert.equal(detected.runtime, "binary");
});
