import { getSystemSetting, saveSystemSetting } from "./system-settings.js";
import type {
  EcommerceGenerationConcurrencyConfigResponse,
  SaveEcommerceGenerationConcurrencyConfigRequest
} from "./contracts.js";

export const ECOMMERCE_GENERATION_CONCURRENCY_SETTINGS_KEY = "ecommerce.generationConcurrency";

const DEFAULT_GLOBAL_CONCURRENCY = 6;
const DEFAULT_JOB_CONCURRENCY = 3;
const MAX_CONCURRENCY = 32;

interface StoredEcommerceGenerationConcurrencyConfig {
  version: 1;
  globalConcurrency: number;
  jobConcurrency: number;
}

interface ConcurrencyPermit {
  release(): void;
}

interface ConcurrencyWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  aborted: boolean;
  onAbort?: () => void;
}

class ConcurrencyLimiter {
  private limit: number;
  private active = 0;
  private waiters: ConcurrencyWaiter[] = [];

  constructor(limit: number) {
    this.limit = normalizeConcurrency(limit, DEFAULT_GLOBAL_CONCURRENCY);
  }

  setLimit(limit: number): void {
    this.limit = normalizeConcurrency(limit, DEFAULT_GLOBAL_CONCURRENCY);
    this.drain();
  }

  async acquire(signal?: AbortSignal): Promise<ConcurrencyPermit> {
    if (signal?.aborted) {
      throw createAbortError();
    }

    return await new Promise<ConcurrencyPermit>((resolve, reject) => {
      const waiter: ConcurrencyWaiter = {
        resolve: () => {
          this.active += 1;
          let released = false;
          resolve({
            release: () => {
              if (released) {
                return;
              }
              released = true;
              this.active = Math.max(0, this.active - 1);
              this.drain();
            }
          });
        },
        reject,
        signal,
        aborted: false
      };

      if (this.active < this.limit) {
        waiter.resolve();
        return;
      }

      this.waiters.push(waiter);
      if (signal) {
        waiter.onAbort = () => {
          waiter.aborted = true;
          this.removeWaiter(waiter);
          reject(createAbortError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
    });
  }

  private drain(): void {
    while (this.active < this.limit && this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) {
        continue;
      }
      if (waiter.aborted || waiter.signal?.aborted) {
        waiter.aborted = true;
        continue;
      }
      if (waiter.onAbort && waiter.signal) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
        waiter.onAbort = undefined;
      }
      waiter.resolve();
    }
  }

  private removeWaiter(waiter: ConcurrencyWaiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) {
      this.waiters.splice(index, 1);
    }
  }
}

const imageGenerationLimiter = new ConcurrencyLimiter(DEFAULT_GLOBAL_CONCURRENCY);
let cachedConcurrencyConfig: EcommerceGenerationConcurrencyConfigResponse | undefined;

export async function initializeEcommerceGenerationConcurrency(): Promise<void> {
  cachedConcurrencyConfig = await loadEcommerceGenerationConcurrencyConfig();
  imageGenerationLimiter.setLimit(cachedConcurrencyConfig.globalConcurrency);
}

export async function getEcommerceGenerationConcurrencyConfig(): Promise<EcommerceGenerationConcurrencyConfigResponse> {
  if (cachedConcurrencyConfig) {
    return cachedConcurrencyConfig;
  }
  cachedConcurrencyConfig = await loadEcommerceGenerationConcurrencyConfig();
  imageGenerationLimiter.setLimit(cachedConcurrencyConfig.globalConcurrency);
  return cachedConcurrencyConfig;
}

export async function saveEcommerceGenerationConcurrencyConfig(
  input: SaveEcommerceGenerationConcurrencyConfigRequest
): Promise<EcommerceGenerationConcurrencyConfigResponse> {
  const resolved = normalizeEcommerceGenerationConcurrencyConfig(input, "saved");
  const stored: StoredEcommerceGenerationConcurrencyConfig = {
    version: 1,
    globalConcurrency: resolved.globalConcurrency,
    jobConcurrency: resolved.jobConcurrency
  };
  await saveSystemSetting(ECOMMERCE_GENERATION_CONCURRENCY_SETTINGS_KEY, stored);
  cachedConcurrencyConfig = resolved;
  imageGenerationLimiter.setLimit(resolved.globalConcurrency);
  return resolved;
}

export async function withEcommerceGenerationSlot<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const permit = await imageGenerationLimiter.acquire(signal);
  try {
    return await run();
  } finally {
    permit.release();
  }
}

async function loadEcommerceGenerationConcurrencyConfig(): Promise<EcommerceGenerationConcurrencyConfigResponse> {
  const row = await getSystemSetting(ECOMMERCE_GENERATION_CONCURRENCY_SETTINGS_KEY);
  const stored = parseStoredConfig(row?.valueJson);
  if (stored) {
    return {
      ...stored,
      source: "saved"
    };
  }

  return {
    globalConcurrency: DEFAULT_GLOBAL_CONCURRENCY,
    jobConcurrency: DEFAULT_JOB_CONCURRENCY,
    source: "default"
  };
}

function parseStoredConfig(valueJson: string | undefined): Omit<EcommerceGenerationConcurrencyConfigResponse, "source"> | undefined {
  if (!valueJson) {
    return undefined;
  }

  try {
    const body = JSON.parse(valueJson) as Record<string, unknown>;
    if (typeof body.globalConcurrency !== "undefined" || typeof body.jobConcurrency !== "undefined" || body.version === 1) {
      return normalizeEcommerceGenerationConcurrencyConfig(body, "saved");
    }
    if (typeof body.totalThreads !== "undefined" || typeof body.taskThreads !== "undefined" || typeof body.sceneThreads !== "undefined") {
      return normalizeEcommerceGenerationConcurrencyConfig(
        {
          globalConcurrency: body.totalThreads,
          jobConcurrency: body.taskThreads ?? body.sceneThreads
        },
        "saved"
      );
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeEcommerceGenerationConcurrencyConfig(
  input: { globalConcurrency?: unknown; jobConcurrency?: unknown },
  source: "saved" | "default"
): EcommerceGenerationConcurrencyConfigResponse {
  const globalConcurrency = normalizeConcurrency(input.globalConcurrency, DEFAULT_GLOBAL_CONCURRENCY);
  const jobConcurrency = Math.min(normalizeConcurrency(input.jobConcurrency, DEFAULT_JOB_CONCURRENCY), globalConcurrency);
  return {
    globalConcurrency,
    jobConcurrency,
    source
  };
}

function normalizeConcurrency(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_CONCURRENCY);
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}
