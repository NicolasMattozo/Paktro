import type { CommonSkill } from "../../types";
import {
  parseFrontmatterMarkdown,
  renderFrontmatterMarkdown,
} from "./frontmatter";

export function renderSkillMarkdown(
  skill: CommonSkill,
  extraFrontmatter?: Record<string, unknown>,
): string {
  return renderFrontmatterMarkdown(
    {
      name: skill.id,
      description: skill.description,
      ...extraFrontmatter,
    },
    skill.content,
  );
}

export function parseSkillMarkdown(
  skillIdFallback: string,
  content: string,
): { skill: CommonSkill; disableModelInvocation?: boolean } {
  const { metadata, body } = parseFrontmatterMarkdown(content);
  const id =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : skillIdFallback;
  const description =
    typeof metadata.description === "string"
      ? metadata.description
      : "Skill importada.";
  const firstHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const disableModelInvocation = metadata["disable-model-invocation"] === true;

  return {
    skill: {
      id,
      name: firstHeading || id,
      description,
      content: body || `Procedimento ${id}.`,
      enabled: true,
    },
    disableModelInvocation,
  };
}

