#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_DIR = "dist/deployment-images";

const PROFILE_DEFAULTS = {
  local: {
    envFile: "deploy/profiles/local.env.example",
    composeFiles: ["docker-compose.yml"]
  },
  "private-cloud": {
    envFile: "deploy/profiles/private-cloud.env.example",
    composeFiles: ["docker-compose.private-cloud.yml"]
  },
  saas: {
    envFile: "deploy/profiles/saas.env.example",
    composeFiles: ["docker-compose.server-bluegreen.yml"]
  }
};

const HELP = `Usage:
  node scripts/deployment-images.mjs list --profile <local|private-cloud|saas> [--env-file <path>] [--compose-file <path>]
  node scripts/deployment-images.mjs build --profile <local|private-cloud|saas> [--env-file <path>] [--compose-file <path>]
  node scripts/deployment-images.mjs save --profile <local|private-cloud|saas> [--output-dir <dir>] [--archive <path>] [--skip-build]
  node scripts/deployment-images.mjs load --archive <path>

Options:
  --profile, --edition <profile>  Deployment profile.
  --env-file <path>               Env file for compose interpolation. Defaults to .env when present, otherwise the profile template.
  --compose-file <path>           Compose file to inspect/build. Can be repeated.
  --output-dir <dir>              Directory for image archives. Defaults to ${DEFAULT_OUTPUT_DIR}.
  --archive <path>                Archive path for save/load. Defaults to <output-dir>/<profile>-images.tar for save.
  --skip-build                    Save existing local images without running docker compose build first.
  --no-pull                       Do not pull missing external images before docker save.
  --help, -h                      Show this help.

Examples:
  node scripts/deployment-images.mjs save --profile local
  node scripts/deployment-images.mjs load --archive dist/deployment-images/local-images.tar
`;

function parseArgs(argv) {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }
  if (argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const [command, ...rest] = argv;
  const options = {
    command,
    composeFiles: [],
    outputDir: DEFAULT_OUTPUT_DIR,
    skipBuild: false,
    noPull: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }
    if (arg === "--no-pull") {
      options.noPull = true;
      continue;
    }
    if (arg.startsWith("--profile=") || arg.startsWith("--edition=")) {
      options.profile = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--profile" || arg === "--edition") {
      options.profile = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--compose-file=")) {
      options.composeFiles.push(arg.slice("--compose-file=".length));
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFiles.push(readNextValue(rest, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--archive=")) {
      options.archive = arg.slice("--archive=".length);
      continue;
    }
    if (arg === "--archive") {
      options.archive = readNextValue(rest, index, arg);
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
    const item = await stat(filePath);
    return item.isFile();
  } catch {
    return false;
  }
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 || result.status === 1;
}

async function resolveProfileOptions(options) {
  if (!VALID_PROFILES.has(options.profile)) {
    throw new Error(`Missing or invalid --profile. Expected one of: ${[...VALID_PROFILES].join(", ")}`);
  }
  const defaults = PROFILE_DEFAULTS[options.profile];
  const envFile = resolveRepoPath(options.envFile || ((await fileExists(resolveRepoPath(".env"))) ? ".env" : defaults.envFile));
  const composeFiles = (options.composeFiles.length > 0 ? options.composeFiles : defaults.composeFiles).map(resolveRepoPath);
  return { envFile, composeFiles };
}

function composeArgs(composeFiles, envFile, command, extraArgs = []) {
  const args = ["compose"];
  for (const composeFile of composeFiles) {
    args.push("-f", composeFile);
  }
  if (envFile) {
    args.push("--env-file", envFile);
  }
  args.push(command, ...extraArgs);
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0) {
    const details = options.capture ? `\n${(result.stderr || result.stdout).trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${details}`);
  }
  return result.stdout || "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readComposeImages(composeFiles, envFile) {
  const output = run("docker", composeArgs(composeFiles, envFile, "config", ["--images"]), { capture: true });
  return unique(output.split(/\r?\n/u).map((line) => line.trim()));
}

function imageExists(image) {
  const result = spawnSync("docker", ["image", "inspect", image], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function pullMissingImages(images, noPull) {
  for (const image of images) {
    if (imageExists(image)) continue;
    if (noPull) {
      throw new Error(`Docker image is missing locally and --no-pull was set: ${image}`);
    }
    console.log(`Pulling missing image: ${image}`);
    run("docker", ["pull", image]);
  }
}

async function build(options) {
  const { envFile, composeFiles } = await resolveProfileOptions(options);
  console.log(`Building ${options.profile} images...`);
  run("docker", composeArgs(composeFiles, envFile, "build"));
  const images = readComposeImages(composeFiles, envFile);
  pullMissingImages(images, options.noPull);
  console.log(`Images ready for ${options.profile}:`);
  for (const image of images) console.log(`- ${image}`);
  return { envFile, composeFiles, images };
}

async function list(options) {
  const { envFile, composeFiles } = await resolveProfileOptions(options);
  const images = readComposeImages(composeFiles, envFile);
  for (const image of images) console.log(image);
}

async function save(options) {
  const { envFile, composeFiles } = options.skipBuild ? await resolveProfileOptions(options) : await build(options);
  const images = readComposeImages(composeFiles, envFile);
  pullMissingImages(images, options.noPull);

  const outputDir = resolveRepoPath(options.outputDir);
  const archive = resolveRepoPath(options.archive || path.join(options.outputDir, `${options.profile}-images.tar`));
  await mkdir(path.dirname(archive), { recursive: true });
  console.log(`Saving ${images.length} image(s) to ${path.relative(REPO_ROOT, archive)}...`);
  run("docker", ["save", "-o", archive, ...images]);

  const manifest = {
    profile: options.profile,
    createdAt: new Date().toISOString(),
    archive: path.relative(REPO_ROOT, archive),
    envFile: path.relative(REPO_ROOT, envFile),
    composeFiles: composeFiles.map((composeFile) => path.relative(REPO_ROOT, composeFile)),
    images
  };
  await mkdir(outputDir, { recursive: true });
  const manifestPath = `${archive}.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`OK image archive: ${path.relative(REPO_ROOT, archive)}`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, manifestPath)}`);
}

async function load(options) {
  if (!options.archive) throw new Error("load requires --archive");
  const archive = resolveRepoPath(options.archive);
  if (!(await fileExists(archive))) throw new Error(`image archive not found: ${archive}`);
  run("docker", ["load", "-i", archive]);
  console.log(`OK loaded image archive: ${path.relative(REPO_ROOT, archive)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    process.stdout.write(HELP);
    return;
  }
  if (!commandExists("docker")) {
    throw new Error("docker CLI is not available");
  }
  if (options.command === "list") {
    await list(options);
    return;
  }
  if (options.command === "build") {
    await build(options);
    return;
  }
  if (options.command === "save") {
    await save(options);
    return;
  }
  if (options.command === "load") {
    await load(options);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(`Deployment image command failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
