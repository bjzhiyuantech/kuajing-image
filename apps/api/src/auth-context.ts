import { authConfig } from "./runtime.js";

export const DEMO_USER_ID = "demo-user";
export const DEMO_WORKSPACE_ID = "demo-workspace";

export interface RequestTenant {
  userId: string;
  workspaceId: string;
}

export function resolveRequestTenant(headers: Headers): RequestTenant | undefined {
  if (!authConfig.allowDemoAuth) {
    return undefined;
  }

  return {
    userId: cleanHeaderId(headers.get("x-user-id")) ?? DEMO_USER_ID,
    workspaceId: cleanHeaderId(headers.get("x-workspace-id")) ?? DEMO_WORKSPACE_ID
  };
}

function cleanHeaderId(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 64);
}
