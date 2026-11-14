import type { ModelId } from "../templates/models";
import type { ToolName } from "../templates/tools";

export type TargetPlatform =
  | "antigravity"
  | "claude-code"
  | "codex"
  | "chatgpt-plugin";

export type InstructionActivation =
  | { type: "always" }
  | { type: "automatic"; description: string }
  | { type: "path"; patterns: string[] }
  | { type: "manual" };

export type CapabilityIntent =
  | "read-files"
  | "search-files"
  | "edit-files"
  | "run-commands"
  | "use-web"
  | "delegate"
  | "use-mcp";

// Legacy Antigravity v1 shapes preserved for retrocompatibility
export type Rule = {
  id: string;
  name: string;
  description: string;
  content: string;
  trigger: "always_on" | "model_decision" | "glob" | "manual";
  globs: string;
  enabled: boolean;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
};

export type McpServer = {
  id: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  serverUrl: string;
  enabled: boolean;
};

export type CommonRule = {
  id: string;
  name: string;
  description: string;
  content: string;
  activation: InstructionActivation;
  enabled: boolean;
};

export type CommonSkill = Skill;
export type CommonMcpServer = McpServer;

export type CommonAgentPack = {
  id: string;
  name: string;
  slug: string;
  description: string;
  specialty: string;
  goal: string;
  instructions: string;
  capabilityIntents: CapabilityIntent[];
  rules: CommonRule[];
  skills: CommonSkill[];
  mcpServers: CommonMcpServer[];
  tags: string[];
  updatedAt: string;
};

export type AntigravityTargetConfig = {
  model: ModelId;
  mainAgent: boolean;
  subagent: boolean;
  tools: ToolName[];
  commandExecutionPolicy: "sandbox" | "off" | "auto" | "eager";
};

export type ClaudeCodeToolName =
  | "Read"
  | "Edit"
  | "Write"
  | "Glob"
  | "Grep"
  | "Bash"
  | "WebFetch"
  | "WebSearch"
  | "Agent";

export type ClaudeCodeModel =
  | "inherit"
  | "sonnet"
  | "opus"
  | "haiku"
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "claude-haiku-4-5";

export type ClaudeCodeEffort =
  | "inherit"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type ClaudeCodePermissionMode =
  | "default"
  | "acceptEdits"
  | "auto"
  | "dontAsk"
  | "bypassPermissions"
  | "plan";

export type ClaudeCodeTargetConfig = {
  exposure: "main" | "subagent" | "both";
  model: ClaudeCodeModel;
  effort: ClaudeCodeEffort;
  tools: ClaudeCodeToolName[];
  disallowedTools: ClaudeCodeToolName[];
  permissionMode: ClaudeCodePermissionMode;
  isolation: "none" | "worktree";
  includeClaudeMd: boolean;
  referenceAgentsMd: boolean;
  disableModelInvocationSkills: string[];
};

export type CodexModel =
  | "inherit"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex"
  | "gpt-5-codex";

export type CodexReasoningEffort =
  | "inherit"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type CodexTargetConfig = {
  exposure: "root" | "subagent" | "both";
  model: CodexModel;
  reasoningEffort: CodexReasoningEffort;
  shellTool: "inherit" | "disabled";
  includeAgentsMd: boolean;
};

export type ChatGptPluginTargetConfig = {
  version: string;
};

export type AgentTargetsMap = {
  antigravity?: AntigravityTargetConfig;
  claudeCode?: ClaudeCodeTargetConfig;
  codex?: CodexTargetConfig;
  chatgptPlugin?: ChatGptPluginTargetConfig;
};

export type AgentPack = {
  schemaVersion: 2;
  target: TargetPlatform;
  common: CommonAgentPack;
  targets: AgentTargetsMap;
};

export type AgentPackV2 = AgentPack;

export type AgentConfig = {
  id: string;
  name: string;
  slug: string;
  description: string;
  specialty: string;
  goal: string;
  instructions: string;
  model: ModelId;
  mainAgent: boolean;
  subagent: boolean;
  tools: ToolName[];
  commandExecutionPolicy: "sandbox" | "off" | "auto" | "eager";
  rules: Rule[];
  skills: Skill[];
  mcpServers: McpServer[];
  tags: string[];
  updatedAt: string;
};

export type GeneratedFile = {
  path: string;
  content: string;
  kind: "agent" | "rule" | "skill" | "mcp" | "backup" | "guide" | "manifest";
};
