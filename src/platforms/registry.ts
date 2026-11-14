import type { AgentPackV2, TargetPlatform } from "../types";
import { antigravityAdapter } from "./antigravity/adapter";
import { claudeCodeAdapter } from "./claude-code/adapter";
import { codexAdapter } from "./codex/adapter";
import { chatGptPluginAdapter } from "./chatgpt-plugin/adapter";
import type { PlatformAdapter } from "./types";

export const PLATFORM_ADAPTERS: Record<TargetPlatform, PlatformAdapter> = {
  antigravity: antigravityAdapter,
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  "chatgpt-plugin": chatGptPluginAdapter,
};

export function getPlatformAdapter(target: TargetPlatform): PlatformAdapter {
  const adapter = PLATFORM_ADAPTERS[target];
  if (!adapter) {
    throw new Error(`Plataforma não suportada: ${target}`);
  }
  return adapter;
}

export function generatePackFiles(pack: AgentPackV2) {
  return getPlatformAdapter(pack.target).generate(pack);
}

