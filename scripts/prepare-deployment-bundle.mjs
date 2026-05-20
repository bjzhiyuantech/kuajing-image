#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmod, copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const DEFAULT_OUTPUT_ROOT = "dist/deployment";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_BUNDLE_PATHS = [
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "apps/api/drizzle.config.ts",
  "apps/api/src",
  "apps/extension/index.html",
  "apps/extension/manifest.json",
  "apps/extension/package.json",
  "apps/extension/public",
  "apps/extension/scripts",
  "apps/extension/src",
  "apps/extension/tsconfig.json",
  "apps/extension/vite.config.ts",
  "apps/web/index.html",
  "apps/web/install-help.html",
  "apps/web/package.json",
  "apps/web/postcss.config.cjs",
  "apps/web/public",
  "apps/web/src",
  "apps/web/tailwind.config.ts",
  "apps/web/tsconfig.json",
  "apps/web/vite.config.ts",
  "packages/shared/package.json",
  "packages/shared/src",
  "packages/shared/tsconfig.json"
];

const PROFILE_CONFIG = {
  local: {
    title: "商图 AI 单机版",
    env: "deploy/profiles/local.env.example",
    composeFiles: ["docker-compose.yml"],
    extraFiles: ["README.zh-CN.md", "scripts/deployment-preflight.mjs", "scripts/deployment-backup.mjs", "scripts/deployment-images.mjs", "scripts/deployment-rollout.mjs", "scripts/post-deploy-smoke.mjs"],
    nextSteps: [
      "复制 .env.example 为 .env，并填写模型密钥、管理员账号和本地端口。",
      "联网安装运行 node scripts/deployment-rollout.mjs install --profile local --env-file .env。",
      "离线安装先运行 node scripts/deployment-images.mjs load --archive local-images.tar，再运行 node scripts/deployment-rollout.mjs install --profile local --env-file .env --offline --skip-smoke。",
      "浏览器访问 http://127.0.0.1:8787，完成账号登录和模型/存储检查。"
    ],
    smokeExample: "node scripts/post-deploy-smoke.mjs --profile local --base-url http://127.0.0.1:8787"
  },
  "private-cloud": {
    title: "商图 AI 私有化部署版",
    env: "deploy/profiles/private-cloud.env.example",
    composeFiles: ["docker-compose.private-cloud.yml"],
    extraFiles: ["README.zh-CN.md", "scripts/deployment-preflight.mjs", "scripts/deployment-backup.mjs", "scripts/deployment-images.mjs", "scripts/deployment-rollout.mjs", "scripts/post-deploy-smoke.mjs"],
    nextSteps: [
      "复制 .env.example 为 .env，并填写客户域名、数据库、对象存储、模型和管理员账号。",
      "联网安装运行 node scripts/deployment-rollout.mjs install --profile private-cloud --env-file .env。",
      "离线安装先运行 node scripts/deployment-images.mjs load --archive private-cloud-images.tar，再运行 node scripts/deployment-rollout.mjs install --profile private-cloud --env-file .env --offline --skip-smoke。",
      "确认反向代理、证书和内网对象存储策略后，对外开放服务。"
    ],
    smokeExample: "node scripts/post-deploy-smoke.mjs --profile private-cloud --base-url http://<server-host>:8787"
  },
  saas: {
    title: "商图 AI SaaS 版",
    env: "deploy/profiles/saas.env.example",
    composeFiles: ["docker-compose.server.yml", "docker-compose.bluegreen.yml", "docker-compose.server-bluegreen.yml"],
    extraFiles: ["README.zh-CN.md", "deploy/nginx/nginx.conf", "scripts/deployment-preflight.mjs", "scripts/deployment-backup.mjs", "scripts/deployment-images.mjs", "scripts/deployment-rollout.mjs", "scripts/post-deploy-smoke.mjs", "scripts/server-release.sh", "scripts/server-bluegreen-deploy-dev.sh", "scripts/server-bluegreen-promote.sh"],
    generatedFiles: [
      {
        path: "deploy/bluegreen/active",
        content: "blue\n"
      },
      {
        path: "deploy/nginx/active-upstream.conf",
        content: "upstream active_app {\n  server app-blue:8787;\n}\n"
      },
      {
        path: "deploy/nginx/dev-upstream.conf",
        content: "upstream dev_app {\n  server app-green:8787;\n}\n"
      }
    ],
    nextSteps: [
      "复制 .env.example 为官方环境配置，并补齐生产密钥、对象存储、推送和支付配置。",
      "按现有 blue-green 流程发布到 dev/prod color。",
      "发布后运行 health、deployment-profile、插件 release 和 App release smoke test。"
    ],
    smokeExample: "API_BASE_URL=https://<saas-domain> node scripts/post-deploy-smoke.mjs --profile saas"
  }
};

const HELP = `Usage:
  node scripts/prepare-deployment-bundle.mjs --profile <local|private-cloud|saas> [--output-dir <dir>] [--clean] [--archive]

Options:
  --profile, --edition <profile>  Deployment profile to bundle.
  --output-dir <dir>              Output root. Defaults to ${DEFAULT_OUTPUT_ROOT}.
  --clean                         Remove the profile output directory before writing.
  --archive                       Also create <profile>.tar.gz next to the bundle directory.
  --help, -h                      Show this help.

Examples:
  node scripts/prepare-deployment-bundle.mjs --profile local --clean
  node scripts/prepare-deployment-bundle.mjs --profile private-cloud --output-dir dist/deployment
`;

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_ROOT,
    clean: false
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

    if (arg === "--archive") {
      options.archive = true;
      continue;
    }

    if (arg.startsWith("--profile=") || arg.startsWith("--edition=")) {
      options.profile = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (arg === "--profile" || arg === "--edition") {
      options.profile = readNextValue(argv, index, arg);
      index += 1;
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

function repoPath(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function outputPath(outputRoot, profile, relativePath) {
  return path.join(outputRoot, profile, relativePath);
}

async function copyIntoBundle(outputRoot, profile, sourceRelativePath, targetRelativePath = sourceRelativePath) {
  const source = repoPath(sourceRelativePath);
  await ensureFile(source, sourceRelativePath);
  const target = outputPath(outputRoot, profile, targetRelativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return targetRelativePath;
}

async function copySourceIntoBundle(outputRoot, profile, sourceRelativePath) {
  const source = repoPath(sourceRelativePath);
  await ensurePath(source, sourceRelativePath);
  const target = outputPath(outputRoot, profile, sourceRelativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: (item) => !isIgnoredSourcePath(item)
  });
  return sourceRelativePath;
}

async function ensureFile(absolutePath, label) {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new Error(`${label} is not a file`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Required file not found: ${label}`);
    }
    throw error;
  }
}

async function ensurePath(absolutePath, label) {
  try {
    await stat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Required path not found: ${label}`);
    }
    throw error;
  }
}

function isIgnoredSourcePath(item) {
  const relative = path.relative(REPO_ROOT, item).replace(/\\/gu, "/");
  return (
    relative === ".git" ||
    relative === "node_modules" ||
    relative === "dist" ||
    relative === "build" ||
    relative.endsWith("/node_modules") ||
    relative.endsWith("/dist") ||
    relative.endsWith("/build")
  );
}

function shellScript(profile, command) {
  if (command === "backup") {
    return `#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it before using this environment."
fi

node scripts/deployment-backup.mjs backup --env-file "\${ENV_FILE:-.env}" "$@"
`;
  }

  if (command === "smoke") {
    return `#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it before using this environment."
fi

PORT_VALUE="\${PORT:-8787}"
BASE_URL_VALUE="\${BASE_URL:-http://127.0.0.1:\${PORT_VALUE}}"
node scripts/post-deploy-smoke.mjs --profile ${profile} --base-url "\${BASE_URL_VALUE}" "$@"
`;
  }

  return `#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review it before using this environment."
fi

node scripts/deployment-rollout.mjs ${command} --profile ${profile} --env-file "\${ENV_FILE:-.env}" "$@"
`;
}

function powershellScript(profile, command) {
  const common = `$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (!(Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Review it before using this environment."
}

$EnvFileValue = if ($env:ENV_FILE) { $env:ENV_FILE } else { ".env" }
`;

  if (command === "backup") {
    return `${common}
& node "scripts/deployment-backup.mjs" "backup" "--env-file" $EnvFileValue @args
exit $LASTEXITCODE
`;
  }

  if (command === "smoke") {
    return `${common}
if ($env:BASE_URL) {
  $BaseUrlValue = $env:BASE_URL
} else {
  $PortValue = if ($env:PORT) { $env:PORT } else { "8787" }
  $BaseUrlValue = "http://127.0.0.1:$PortValue"
}

& node "scripts/post-deploy-smoke.mjs" "--profile" "${profile}" "--base-url" $BaseUrlValue @args
exit $LASTEXITCODE
`;
  }

  return `${common}
& node "scripts/deployment-rollout.mjs" "${command}" "--profile" "${profile}" "--env-file" $EnvFileValue @args
exit $LASTEXITCODE
`;
}

async function writeHelperScripts(outputRoot, profile) {
  const scripts = [
    ["install.sh", shellScript(profile, "install")],
    ["upgrade.sh", shellScript(profile, "upgrade")],
    ["status.sh", shellScript(profile, "status")],
    ["backup.sh", shellScript(profile, "backup")],
    ["rollback.sh", shellScript(profile, "rollback")],
    ["smoke.sh", shellScript(profile, "smoke")],
    ["install.ps1", powershellScript(profile, "install")],
    ["upgrade.ps1", powershellScript(profile, "upgrade")],
    ["status.ps1", powershellScript(profile, "status")],
    ["backup.ps1", powershellScript(profile, "backup")],
    ["rollback.ps1", powershellScript(profile, "rollback")],
    ["smoke.ps1", powershellScript(profile, "smoke")]
  ];
  const written = [];
  for (const [fileName, content] of scripts) {
    const target = outputPath(outputRoot, profile, fileName);
    await writeFile(target, content, "utf8");
    if (fileName.endsWith(".sh")) {
      await chmod(target, 0o755);
    }
    written.push(fileName);
  }
  return written;
}

function bundleReadme(profile, config, copiedFiles) {
  return `# ${config.title}

This directory is a generated deployment starter bundle for \`${profile}\`.

## Included Files

${copiedFiles.map((file) => `- \`${file}\``).join("\n")}

## Quick Commands

\`\`\`bash
cp .env.example .env
./install.sh
./status.sh
./smoke.sh
./upgrade.sh
./backup.sh
./rollback.sh --backup-dir backups/<timestamp>
\`\`\`

Windows PowerShell:

\`\`\`powershell
Copy-Item .env.example .env
.\\install.ps1
.\\status.ps1
.\\smoke.ps1
.\\upgrade.ps1
.\\backup.ps1
.\\rollback.ps1 --backup-dir backups/<timestamp>
\`\`\`

For offline installs, place the image archive next to this directory and run:

\`\`\`bash
node scripts/deployment-images.mjs load --archive ${profile}-images.tar
./install.sh --offline --no-build --skip-smoke
\`\`\`

## Next Steps

${config.nextSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Smoke Test

\`\`\`bash
${config.smokeExample}
\`\`\`

Generated by:

\`\`\`bash
node scripts/prepare-deployment-bundle.mjs --profile ${profile}
\`\`\`
`;
}

function writeArchive(outputRoot, profile) {
  const result = spawnSync("tar", ["-czf", `${profile}.tar.gz`, profile], {
    cwd: outputRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`tar archive failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return `${profile}.tar.gz`;
}

async function writeBundleManifest(outputRoot, profile, copiedFiles) {
  const manifestPath = outputPath(outputRoot, profile, "MANIFEST.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        profile,
        generatedAt: new Date().toISOString(),
        files: copiedFiles
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return "MANIFEST.json";
}

async function writeGeneratedFile(outputRoot, profile, file) {
  const target = outputPath(outputRoot, profile, file.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.content, "utf8");
  return file.path;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!VALID_PROFILES.has(options.profile)) {
    throw new Error(`Missing or invalid --profile. Expected one of: ${[...VALID_PROFILES].join(", ")}`);
  }

  const profile = options.profile;
  const config = PROFILE_CONFIG[profile];
  const outputRoot = path.resolve(REPO_ROOT, options.outputDir);
  const bundleDir = path.join(outputRoot, profile);

  if (options.clean) {
    await rm(bundleDir, { recursive: true, force: true });
  }
  await mkdir(bundleDir, { recursive: true });

  const copiedFiles = [];
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, config.env, ".env.example"));
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, "Dockerfile"));
  for (const sourcePath of SOURCE_BUNDLE_PATHS) {
    copiedFiles.push(await copySourceIntoBundle(outputRoot, profile, sourcePath));
  }
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, "scripts/check-deployment-profile.mjs"));
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, "docs/deployment-modes-task-breakdown.md"));

  for (const composeFile of config.composeFiles) {
    copiedFiles.push(await copyIntoBundle(outputRoot, profile, composeFile));
  }

  for (const extraFile of config.extraFiles) {
    copiedFiles.push(await copyIntoBundle(outputRoot, profile, extraFile));
  }

  for (const generatedFile of config.generatedFiles || []) {
    copiedFiles.push(await writeGeneratedFile(outputRoot, profile, generatedFile));
  }

  copiedFiles.push(...(await writeHelperScripts(outputRoot, profile)));
  const readmePath = outputPath(outputRoot, profile, "README.md");
  await writeFile(readmePath, bundleReadme(profile, config, copiedFiles), "utf8");
  copiedFiles.push("README.md");
  copiedFiles.push(await writeBundleManifest(outputRoot, profile, copiedFiles));

  console.log(`OK ${profile}: ${path.relative(REPO_ROOT, bundleDir)}`);
  for (const file of copiedFiles) {
    console.log(`- ${file}`);
  }
  if (options.archive) {
    const archive = writeArchive(outputRoot, profile);
    console.log(`Archive: ${path.relative(REPO_ROOT, path.join(outputRoot, archive))}`);
  }
}

main().catch((error) => {
  console.error(`Deployment bundle preparation failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
