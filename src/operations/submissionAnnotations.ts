import {
  LEAN_TOOL_REGISTRY,
  type LeanToolDefinition
} from "../mcp/leanRegistry.js";

export interface SubmissionAnnotationJustifications {
  readOnlyHint: string;
  destructiveHint: string;
  openWorldHint: string;
}

export interface SubmissionToolAnnotations {
  name: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: false;
  };
  justifications: SubmissionAnnotationJustifications;
}

export interface SubmissionArtifactTool {
  annotations: SubmissionToolAnnotations["annotations"];
  justifications: {
    read_only_justification: string;
    open_world_justification: string;
    destructive_justification: string;
  };
}

export function buildSubmissionAnnotationJustifications(
  tool: LeanToolDefinition
): SubmissionAnnotationJustifications {
  const readOnlyHint = tool.readOnly
    ? `${tool.title} only retrieves or computes Grist information and does not change Grist user state.`
    : `${tool.title} changes Grist user state, so it is not read-only.`;

  const destructiveHint = tool.readOnly
    ? `${tool.title} performs no write and therefore cannot destructively change Grist user state.`
    : tool.destructive
      ? `${tool.title} can overwrite, rename, clear, reconfigure, or delete explicitly targeted Grist state, so the change may be destructive or require explicit confirmation.`
      : `${tool.title} only adds new Grist state and does not overwrite or delete existing user state.`;

  const openWorldHint = `${tool.title} is confined to the configured Grist deployment and the principal's bounded documents or workspaces; it does not access arbitrary public Internet entities.`;

  return {
    readOnlyHint,
    destructiveHint,
    openWorldHint
  };
}

export function buildSubmissionToolAnnotations(): SubmissionToolAnnotations[] {
  return LEAN_TOOL_REGISTRY.map((tool) => ({
    name: tool.name,
    annotations: {
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive,
      openWorldHint: false
    },
    justifications: buildSubmissionAnnotationJustifications(tool)
  }));
}

export function buildSubmissionArtifactTools(): Record<string, SubmissionArtifactTool> {
  return Object.fromEntries(
    buildSubmissionToolAnnotations().map((tool) => [
      tool.name,
      {
        annotations: tool.annotations,
        justifications: {
          read_only_justification: tool.justifications.readOnlyHint,
          open_world_justification: tool.justifications.openWorldHint,
          destructive_justification: tool.justifications.destructiveHint
        }
      }
    ])
  );
}
