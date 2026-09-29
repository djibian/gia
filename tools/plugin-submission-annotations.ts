import { buildSubmissionToolAnnotations } from "../src/operations/submissionAnnotations.js";

console.log(
  JSON.stringify(
    {
      generatedFrom: "src/mcp/leanRegistry.ts",
      tools: buildSubmissionToolAnnotations()
    },
    null,
    2
  )
);
