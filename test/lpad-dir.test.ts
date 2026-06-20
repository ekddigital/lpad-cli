import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectProject } from "../src/detect.js";
import {
  buildManifest,
  manifestPath,
  readManifest,
  writeLpadDir,
} from "../src/lpad-dir.js";
import { lpadDirExists, scaffoldLpadDir } from "../src/scaffold.js";

function tempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lpad-cli-test-"));
}

function writeJson(root: string, rel: string, data: unknown): void {
  const filePath = path.join(root, rel);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

test("writeLpadDir creates .lpad/manifest.json and README", () => {
  const root = tempProjectDir();
  const detected = detectProject(root);
  const manifest = buildManifest({
    slug: "demo-app",
    apiUrl: "https://lpad.ekddigital.com",
    detected,
    projectRoot: root,
  });

  const result = writeLpadDir(root, manifest);
  assert.equal(result.created, true);
  assert.equal(lpadDirExists(root), true);
  assert.equal(fs.existsSync(path.join(root, ".lpad", "README.md")), true);

  const saved = readManifest(root);
  assert.equal(saved?.project.slug, "demo-app");
  assert.equal(saved?.deploy?.platformDomain, "demo-app.lpad.ekddigital.com");
  assert.ok(saved?.project.type);
  assert.ok(saved?.deploy?.framework);
});

test("buildManifest for Next.js includes Prisma and NextAuth env hints", () => {
  const root = tempProjectDir();
  writeJson(root, "package.json", {
    scripts: { build: "next build", start: "next start" },
    dependencies: {
      next: "16.0.0",
      "next-auth": "^4.0.0",
      "@prisma/client": "^7.0.0",
    },
  });

  const manifest = buildManifest({
    slug: "my-app",
    apiUrl: "https://lpad.ekddigital.com",
    productionDomain: "app.example.com",
    projectRoot: root,
  });

  const keys = manifest.env?.hints?.map((h) => h.key) ?? [];
  assert.ok(keys.includes("DATABASE_URL"));
  assert.ok(keys.includes("NEXTAUTH_URL"));
  assert.ok(keys.includes("NEXTAUTH_SECRET"));
  assert.equal(manifest.project.type, "nextjs");
  assert.equal(manifest.deploy?.framework, "Next.js");
});

test("buildManifest for Python does not assume Next.js nginx routes", () => {
  const root = tempProjectDir();
  fs.writeFileSync(
    path.join(root, "requirements.txt"),
    "fastapi\n",
    "utf8",
  );

  const manifest = buildManifest({
    slug: "api-service",
    apiUrl: "https://lpad.ekddigital.com",
    includeAssets: false,
    projectRoot: root,
  });

  assert.equal(manifest.project.type, "python");
  assert.equal(manifest.deploy?.runtime, "python");
  assert.ok(
    manifest.nginx?.routes?.some((r) => r.path === "/docs"),
    "Python API should include /docs route hint",
  );
  assert.equal(
    manifest.nginx?.routes?.some((r) =>
      r.description?.includes("Next.js"),
    ),
    false,
  );
});

test("writeLpadDir merge is idempotent and preserves env hints", () => {
  const root = tempProjectDir();
  const first = buildManifest({
    slug: "demo-app",
    apiUrl: "https://lpad.ekddigital.com",
    envHints: [{ key: "CUSTOM_KEY", required: true }],
    projectRoot: root,
  });
  writeLpadDir(root, first);

  const second = buildManifest({
    slug: "demo-app",
    apiUrl: "https://lpad.ekddigital.com",
    productionDomain: "demo.example.com",
    projectRoot: root,
  });
  const result = writeLpadDir(root, second);
  assert.equal(result.created, false);
  assert.equal(result.updated, true);

  const merged = readManifest(root);
  assert.equal(merged?.deploy?.productionDomain, "demo.example.com");
  assert.ok(
    merged?.env?.hints?.some((hint) => hint.key === "CUSTOM_KEY"),
    "existing env hints should be preserved when not replaced",
  );
});

test("scaffoldLpadDir works offline without token", async () => {
  const root = tempProjectDir();
  const result = await scaffoldLpadDir({
    config: {},
    slug: "offline-app",
    apiUrl: "https://lpad.ekddigital.com",
    cwd: root,
    fetchFromServer: false,
    updateConfig: false,
  });

  assert.equal(result.created, true);
  assert.equal(fs.existsSync(manifestPath(root)), true);
});

test("lpadDirExists returns false before scaffold", () => {
  const root = tempProjectDir();
  assert.equal(lpadDirExists(root), false);
});

test("README warns against manual creation", () => {
  const root = tempProjectDir();
  writeJson(root, "package.json", {
    dependencies: { next: "16.0.0" },
    scripts: { start: "next start" },
  });
  const manifest = buildManifest({
    slug: "readme-test",
    apiUrl: "https://lpad.ekddigital.com",
    projectRoot: root,
  });
  writeLpadDir(root, manifest);

  const readme = fs.readFileSync(path.join(root, ".lpad", "README.md"), "utf8");
  assert.match(readme, /Do not create or edit these files manually/);
  assert.match(readme, /Next\.js/);
});
