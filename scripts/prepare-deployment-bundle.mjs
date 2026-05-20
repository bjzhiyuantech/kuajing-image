#!/usr/bin/env node

import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const DEFAULT_OUTPUT_ROOT = "dist/deployment";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROFILE_CONFIG = {
  local: {
    title: "商图 AI 单机版",
    env: "deploy/profiles/local.env.example",
    composeFiles: ["docker-compose.yml"],
    extraFiles: ["README.zh-CN.md"],
    nextSteps: [
      "复制 .env.example 为 .env，并填写模型密钥、管理员账号和本地端口。",
      "运行 docker compose --env-file .env up -d --build。",
      "浏览器访问 http://127.0.0.1:8787，完成账号登录和模型/存储检查。"
    ],
    smokeExample: "node scripts/check-deployment-profile.mjs --profile local --base-url http://127.0.0.1:8787"
  },
  "private-cloud": {
    title: "商图 AI 私有化部署版",
    env: "deploy/profiles/private-cloud.env.example",
    composeFiles: ["docker-compose.private-cloud.yml"],
    extraFiles: ["README.zh-CN.md"],
    nextSteps: [
      "复制 .env.example 为 .env，并填写客户域名、数据库、对象存储、模型和管理员账号。",
      "运行 docker compose -f docker-compose.private-cloud.yml --env-file .env up -d --build。",
      "确认反向代理、证书和内网对象存储策略后，对外开放服务。"
    ],
    smokeExample: "node scripts/check-deployment-profile.mjs --profile private-cloud --base-url http://<server-host>:8787"
  },
  saas: {
    title: "商图 AI SaaS 版",
    env: "deploy/profiles/saas.env.example",
    composeFiles: ["docker-compose.server.yml", "docker-compose.bluegreen.yml", "docker-compose.server-bluegreen.yml"],
    extraFiles: ["README.zh-CN.md", "scripts/server-release.sh", "scripts/server-bluegreen-deploy-dev.sh", "scripts/server-bluegreen-promote.sh"],
    nextSteps: [
      "复制 .env.example 为官方环境配置，并补齐生产密钥、对象存储、推送和支付配置。",
      "按现有 blue-green 流程发布到 dev/prod color。",
      "发布后运行 health、deployment-profile、插件 release 和 App release smoke test。"
    ],
    smokeExample: "API_BASE_URL=https://<saas-domain> node scripts/check-deployment-profile.mjs --profile saas"
  }
};

const HELP = `Usage:
  node scripts/prepare-deployment-bundle.mjs --profile <local|private-cloud|saas> [--output-dir <dir>] [--clean]

Options:
  --profile, --edition <profile>  Deployment profile to bundle.
  --output-dir <dir>              Output root. Defaults to ${DEFAULT_OUTPUT_ROOT}.
  --clean                         Remove the profile output directory before writing.
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

function bundleReadme(profile, config, copiedFiles) {
  return `# ${config.title}

This directory is a generated deployment starter bundle for \`${profile}\`.

## Included Files

${copiedFiles.map((file) => `- \`${file}\``).join("\n")}

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
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, "scripts/check-deployment-profile.mjs"));
  copiedFiles.push(await copyIntoBundle(outputRoot, profile, "docs/deployment-modes-task-breakdown.md"));

  for (const composeFile of config.composeFiles) {
    copiedFiles.push(await copyIntoBundle(outputRoot, profile, composeFile));
  }

  for (const extraFile of config.extraFiles) {
    copiedFiles.push(await copyIntoBundle(outputRoot, profile, extraFile));
  }

  const readmePath = outputPath(outputRoot, profile, "README.md");
  await writeFile(readmePath, bundleReadme(profile, config, copiedFiles), "utf8");
  copiedFiles.push("README.md");
  copiedFiles.push(await writeBundleManifest(outputRoot, profile, copiedFiles));

  console.log(`OK ${profile}: ${path.relative(REPO_ROOT, bundleDir)}`);
  for (const file of copiedFiles) {
    console.log(`- ${file}`);
  }
}

main().catch((error) => {
  console.error(`Deployment bundle preparation failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
