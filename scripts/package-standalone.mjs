#!/usr/bin/env node

import { copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIR = "dist/standalone";
const DEFAULT_BUNDLE_ROOT = "dist/deployment";
const PROFILE = "local";

const HELP = `Usage:
  node scripts/package-standalone.mjs [--output-dir <dir>] [--bundle-root <dir>] [--clean] [--with-images] [--image-archive <path>]

Options:
  --output-dir <dir>       Standalone package output directory. Defaults to ${DEFAULT_OUTPUT_DIR}.
  --bundle-root <dir>      Intermediate deployment bundle root. Defaults to ${DEFAULT_BUNDLE_ROOT}.
  --clean                  Remove output and local bundle directories before packaging.
  --with-images            Copy or generate Docker image archive into the standalone package.
  --image-archive <path>   Existing local image archive to include. Implies --with-images.
  --skip-zip               Do not create .zip even if zip is available.
  --help, -h               Show this help.

Examples:
  node scripts/package-standalone.mjs --clean
  node scripts/package-standalone.mjs --clean --with-images
`;

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    bundleRoot: DEFAULT_BUNDLE_ROOT,
    clean: false,
    withImages: false,
    skipZip: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--clean") {
      options.clean = true;
      continue;
    }
    if (arg === "--with-images") {
      options.withImages = true;
      continue;
    }
    if (arg === "--skip-zip") {
      options.skipZip = true;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--bundle-root=")) {
      options.bundleRoot = arg.slice("--bundle-root=".length);
      continue;
    }
    if (arg === "--bundle-root") {
      options.bundleRoot = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--image-archive=")) {
      options.imageArchive = arg.slice("--image-archive=".length);
      options.withImages = true;
      continue;
    }
    if (arg === "--image-archive") {
      options.imageArchive = readNextValue(argv, index, arg);
      options.withImages = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readNextValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "ignore" });
  return result.status === 0 || result.status === 1;
}

async function includeImageArchive(options, packageDir) {
  const imagesDir = path.join(packageDir, "images");
  await mkdir(imagesDir, { recursive: true });
  const targetArchive = path.join(imagesDir, "local-images.tar");

  if (options.imageArchive) {
    const source = resolveRepoPath(options.imageArchive);
    if (!(await fileExists(source))) {
      throw new Error(`image archive not found: ${source}`);
    }
    await copyFile(source, targetArchive);
    return "images/local-images.tar";
  }

  run(process.execPath, [
    "scripts/deployment-images.mjs",
    "save",
    "--profile",
    PROFILE,
    "--archive",
    targetArchive
  ]);
  return "images/local-images.tar";
}

function archiveTar(outputDir, packageName) {
  const result = spawnSync("tar", ["-czf", `${packageName}.tar.gz`, packageName], {
    cwd: outputDir,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`tar ${packageName}.tar.gz ${packageName} failed`);
  }
  return `${packageName}.tar.gz`;
}

function archiveZip(outputDir, packageName, zipAvailable) {
  if (!zipAvailable) return null;
  const result = spawnSync("zip", ["-qr", `${packageName}.zip`, packageName], {
    cwd: outputDir,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`zip ${packageName}.zip ${packageName} failed`);
  }
  return `${packageName}.zip`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const outputDir = resolveRepoPath(options.outputDir);
  const bundleRoot = resolveRepoPath(options.bundleRoot);
  const bundleDir = path.join(bundleRoot, PROFILE);
  const packageName = "shangtu-ai-standalone";
  const packageDir = path.join(outputDir, packageName);

  if (options.clean) {
    await rm(bundleDir, { recursive: true, force: true });
    await rm(packageDir, { recursive: true, force: true });
    await rm(path.join(outputDir, `${packageName}.tar.gz`), { force: true });
    await rm(path.join(outputDir, `${packageName}.zip`), { force: true });
  }

  await mkdir(outputDir, { recursive: true });
  run(process.execPath, [
    "scripts/prepare-deployment-bundle.mjs",
    "--profile",
    PROFILE,
    "--output-dir",
    path.relative(REPO_ROOT, bundleRoot),
    "--clean"
  ]);

  await rm(packageDir, { recursive: true, force: true });
  await cp(bundleDir, packageDir, { recursive: true, force: true });

  const includedFiles = [];
  if (options.withImages) {
    includedFiles.push(await includeImageArchive(options, packageDir));
  }

  await writeFile(
    path.join(packageDir, "STANDALONE-README.md"),
    standaloneReadme(options.withImages),
    "utf8"
  );
  includedFiles.push("STANDALONE-README.md");

  const tarArchive = `${packageName}.tar.gz`;
  const zipAvailable = !options.skipZip && commandAvailable("zip", ["--version"]);
  const zipArchive = zipAvailable ? `${packageName}.zip` : null;
  const manifest = {
    profile: PROFILE,
    generatedAt: new Date().toISOString(),
    packageDir: path.relative(REPO_ROOT, packageDir),
    archives: [tarArchive, zipArchive].filter(Boolean).map((item) => path.relative(REPO_ROOT, path.join(outputDir, item))),
    includedFiles
  };
  await writeFile(path.join(packageDir, "standalone-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  archiveTar(outputDir, packageName);
  archiveZip(outputDir, packageName, zipAvailable);
  console.log(`OK standalone package: ${path.relative(REPO_ROOT, packageDir)}`);
  console.log(`Archive: ${path.relative(REPO_ROOT, path.join(outputDir, tarArchive))}`);
  if (zipArchive) {
    console.log(`Archive: ${path.relative(REPO_ROOT, path.join(outputDir, zipArchive))}`);
  }
}

function standaloneReadme(withImages) {
  return `# 商图 AI 单机版交付包

## macOS / Linux

\`\`\`bash
cp .env.example .env
./install.sh
./smoke.sh
\`\`\`

## Windows PowerShell

\`\`\`powershell
Copy-Item .env.example .env
.\\install.ps1
.\\smoke.ps1
\`\`\`

## 离线安装

${withImages ? "本包已包含 `images/local-images.tar`。" : "先将 `local-images.tar` 放入本目录，或重新运行打包命令时加 `--with-images`。"}

\`\`\`bash
node scripts/deployment-images.mjs load --archive images/local-images.tar
./install.sh --offline --no-build --skip-smoke
\`\`\`
`;
}

main().catch((error) => {
  console.error(`Standalone package failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
