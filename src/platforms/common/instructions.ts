import type { InstructionActivation, Rule } from "../../types";
import { parsePatterns } from "./paths";

export function legacyTriggerToActivation(
  trigger: Rule["trigger"],
  globs: string,
  description = "",
): InstructionActivation {
  switch (trigger) {
    case "always_on":
      return { type: "always" };
    case "model_decision":
      return { type: "automatic", description };
    case "glob":
      return { type: "path", patterns: parsePatterns(globs) };
    case "manual":
      return { type: "manual" };
  }
}

export function activationToLegacyTrigger(
  activation: InstructionActivation,
): { trigger: Rule["trigger"]; globs: string } {
  switch (activation.type) {
    case "always":
      return { trigger: "always_on", globs: "" };
    case "automatic":
      return { trigger: "model_decision", globs: "" };
    case "path":
      return { trigger: "glob", globs: activation.patterns.join(", ") };
    case "manual":
      return { trigger: "manual", globs: "" };
  }
}

export function activationLabel(activation: InstructionActivation): string {
  switch (activation.type) {
    case "always":
      return "Sempre ativa";
    case "automatic":
      return "Quando a IA julgar útil";
    case "path":
      return `Por arquivos (${activation.patterns.join(", ") || "sem padrão"})`;
    case "manual":
      return "Sob pedido manual";
  }
}

