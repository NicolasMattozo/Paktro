import type { CommonMcpServer } from "../../types";

export function activeMcpServers(servers: CommonMcpServer[]): CommonMcpServer[] {
  return servers.filter((m) => m.enabled);
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function isInsecureHttpRemoteUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "http:" &&
      u.hostname !== "localhost" &&
      u.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

