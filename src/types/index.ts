export type {
  AgentConfig,
  Rule,
  Skill,
  McpServer,
  Backup,
} from "../schemas/config";
export type GeneratedFile = {
  path: string;
  content: string;
  kind: "agent" | "rule" | "skill" | "mcp" | "backup" | "guide";
};
