import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { createDoc, createWorkspace } from "./application-fixtures.js";
import { applyActions, createTestApiKey, gristApi, recordsFrom } from "./grist-harness.js";

const supportedVersion = /^1\.7\.(16|17|18|19|20)$/;
const containerIdPattern = /^[a-f0-9]{64}$/;
const fixtureLabel = "com.gia.disposable-grist";
const imagePrefix = "gristlabs/grist-oss:";
const tableId = "QualificationItems";

export type QualificationStatus = "PASS" | "FAIL" | "UNKNOWN" | "NOT_TESTED" | "UNSUPPORTED";
type Decision = "allow" | "deny";
type Operation = "read" | "create" | "update" | "delete";

interface Observation {
  decision?: Decision;
  contradictoryEffect?: boolean;
}

export interface DisposableGrist {
  baseUrl: string;
  version: string;
}

/** Scope is deliberately derived from the local, job-owned container. */
export function disposableGristFromInspection(raw: string, expectedVersion: string): DisposableGrist {
  const fields = raw.trimEnd().split("\n");
  const expectedImage = imagePrefix + expectedVersion;
  if (!supportedVersion.test(expectedVersion) || fields.length !== 7 ||
      JSON.parse(fields[0]!) !== expectedImage || fields[1] !== "true" ||
      fields[2] !== "true" || fields[3] !== "test-login" || fields[4] !== "[]" ||
      (fields[5] !== "default" && fields[5] !== "bridge")) {
    throw new Error("disposable_grist_container_required");
  }
  const ports: unknown = JSON.parse(fields[6]!);
  if (!Array.isArray(ports) || ports.length !== 1 ||
      ports[0]?.HostIp !== "127.0.0.1" || !/^\d{1,5}$/.test(ports[0]?.HostPort) ||
      +ports[0].HostPort < 1 || +ports[0].HostPort > 65535) {
    throw new Error("disposable_grist_loopback_binding_required");
  }
  return { baseUrl: `http://127.0.0.1:${ports[0].HostPort}`, version: expectedVersion };
}

export function requireDirectNodeHttp(
  options: readonly string[] = process.execArgv,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_USE_ENV_PROXY === "1" ||
      [...options, env.NODE_OPTIONS ?? ""].some((option) => /--use[-_]env[-_]proxy\b/.test(option))) {
    throw new Error("disposable_grist_direct_http_required");
  }
}

export async function openDisposableGrist(containerId: string, expectedVersion: string): Promise<DisposableGrist> {
  requireDirectNodeHttp();
  if (!containerIdPattern.test(containerId) || !supportedVersion.test(expectedVersion)) {
    throw new Error("disposable_grist_container_required");
  }
  const format = [
    "{{json .Config.Image}}",
    "{{.State.Running}}",
    `{{eq (index .Config.Labels "${fixtureLabel}") "true"}}`,
    '{{range .Config.Env}}{{if eq . "GRIST_TEST_LOGIN=1"}}test-login{{end}}{{end}}',
    "{{json .Mounts}}",
    "{{.HostConfig.NetworkMode}}",
    '{{json (index .NetworkSettings.Ports "8484/tcp")}}'
  ].join("\n");
  const { stdout } = await promisify(execFile)("docker", [
    "--host", "unix:///var/run/docker.sock", "inspect",
    "--type", "container", "--format", format, containerId
  ], { timeout: 10_000, maxBuffer: 16_384 });
  return disposableGristFromInspection(stdout, expectedVersion);
}

export function qualificationStatus(expected: Decision, observation: Observation): QualificationStatus {
  if (observation.contradictoryEffect) return "FAIL";
  if (!observation.decision) return "UNKNOWN";
  return observation.decision === expected ? "PASS" : "FAIL";
}

/** Recognize the native access-rule response as well as the independently read effect. */
export function mutationObservation(
  operation: Exclude<Operation, "read">,
  status: number,
  errorMessage: unknown,
  effectApplied: boolean,
  stateUnchanged: boolean
): Observation {
  if (status >= 200 && status < 300) {
    return effectApplied ? { decision: "allow" } : { contradictoryEffect: true };
  }
  if (!stateUnchanged) return { contradictoryEffect: true };
  const aclDenial = new RegExp(`^Blocked by (row|column|table|full) ${operation} access rules$`);
  return status === 403 && typeof errorMessage === "string" && aclDenial.test(errorMessage)
    ? { decision: "deny" } : {};
}

interface Fixture {
  owner: string;
  alpha: { email: string; key: string };
  beta: { email: string; key: string };
  recordsPath: string;
}

async function fixture(baseUrl: string): Promise<Fixture> {
  const suffix = randomUUID();
  const alphaEmail = `native-alpha-${suffix}@example.invalid`;
  const betaEmail = `native-beta-${suffix}@example.invalid`;
  const owner = await createTestApiKey(baseUrl, `native-owner-${suffix}@example.invalid`, "Qualification Owner");
  const alphaKey = await createTestApiKey(baseUrl, alphaEmail, "Qualification Alpha");
  const betaKey = await createTestApiKey(baseUrl, betaEmail, "Qualification Beta");
  const workspaceId = await createWorkspace(baseUrl, owner, "Disposable authorization qualification");
  await gristApi(baseUrl, owner, `/api/workspaces/${workspaceId}/access`, {
    method: "PATCH", redirect: "error",
    body: JSON.stringify({ delta: { users: { [alphaEmail]: "editors", [betaEmail]: "editors" } } })
  });
  const documentId = await createDoc(baseUrl, owner, workspaceId, "Synthetic policy cases");
  await applyActions(baseUrl, owner, documentId, [
    ["AddTable", tableId, [{ id: "Principal", type: "Text" }, { id: "Value", type: "Text" }]],
    ["AddRecord", tableId, 1, { Principal: alphaEmail, Value: "initial-alpha" }],
    ["AddRecord", tableId, 2, { Principal: betaEmail, Value: "initial-beta" }],
    ["AddRecord", tableId, 3, { Principal: alphaEmail, Value: "control-alpha" }],
    ["AddRecord", tableId, 4, { Principal: betaEmail, Value: "control-beta" }],
    ["AddRecord", "_grist_ACLResources", -1, { tableId, colIds: "*" }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "user.Access == OWNER", permissionsText: "+RCUD"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "rec.Principal == user.Email", permissionsText: "+RCUD"
    }],
    ["AddRecord", "_grist_ACLRules", null, {
      resource: -1, aclFormula: "", permissionsText: "-RCUD"
    }]
  ]);
  return {
    owner, alpha: { email: alphaEmail, key: alphaKey }, beta: { email: betaEmail, key: betaKey },
    recordsPath: `/api/docs/${encodeURIComponent(documentId)}/tables/${tableId}/records`
  };
}

interface NativeCase {
  id: string;
  operation: Operation;
  expected: Decision;
  run: () => Promise<Observation>;
}

function nativeCases(baseUrl: string, { owner, alpha, beta, recordsPath }: Fixture): NativeCase[] {
  const read = async (key: string) => recordsFrom(await gristApi(baseUrl, key, recordsPath, { redirect: "error" }));
  const valueAt = async (id: number) => (await read(owner)).find((entry) => entry.id === id)?.fields.Value;
  const readRow = async (key: string, target: number, control: number): Promise<Observation> => {
    if (await valueAt(target) === undefined) return {};
    const visible = await read(key);
    if (!visible.some(({ id }) => id === control)) return {};
    return { decision: visible.some(({ id }) => id === target) ? "allow" : "deny" };
  };

  type Rows = Awaited<ReturnType<typeof read>>;
  const mutate = async (operation: Exclude<Operation, "read">, key: string,
    path: string, method: string, body: unknown, applied: (rows: Rows) => boolean): Promise<Observation> => {
    const before = await read(owner);
    if (applied(before)) return {};
    const response = await fetch(new URL(path, baseUrl), {
      method, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const error = response.status === 403
      ? await response.json().catch(() => undefined) as { error?: unknown } | undefined
      : undefined;
    if (response.status !== 403) await response.arrayBuffer();
    const after = await read(owner);
    return mutationObservation(operation, response.status, error?.error, applied(after), isDeepStrictEqual(before, after));
  };

  const create = (key: string, principal: string, value: string) => mutate(
    "create", key, recordsPath, "POST", { records: [{ fields: { Principal: principal, Value: value } }] },
    (rows) => rows.filter(({ fields }) => fields.Value === value && fields.Principal === principal).length === 1
  );
  const update = (key: string, id: number, value: string) => mutate(
    "update", key, recordsPath, "PATCH", { records: [{ id, fields: { Value: value } }] },
    (rows) => rows.some((entry) => entry.id === id && entry.fields.Value === value)
  );
  const remove = (key: string, id: number) => mutate(
    "delete", key, recordsPath + "/delete", "POST", [id], (rows) => rows.every((entry) => entry.id !== id)
  );

  return [
    { id: "read-allowed-own-row", operation: "read", expected: "allow", run: () => readRow(alpha.key, 1, 3) },
    { id: "read-denied-other-row", operation: "read", expected: "deny", run: () => readRow(beta.key, 1, 4) },
    { id: "create-allowed-own-row", operation: "create", expected: "allow", run: () =>
      create(alpha.key, alpha.email, "created-alpha") },
    { id: "create-denied-other-row", operation: "create", expected: "deny", run: () =>
      create(beta.key, alpha.email, "refused-create") },
    { id: "update-allowed-own-row", operation: "update", expected: "allow", run: () =>
      update(beta.key, 2, "updated-beta") },
    { id: "update-denied-other-row", operation: "update", expected: "deny", run: () =>
      update(alpha.key, 2, "refused-update") },
    { id: "delete-denied-other-row", operation: "delete", expected: "deny", run: () => remove(beta.key, 1) },
    { id: "delete-allowed-own-row", operation: "delete", expected: "allow", run: () => remove(alpha.key, 1) }
  ];
}

async function main(): Promise<void> {
  const version = process.env.GRIST_COMPAT_VERSION ?? "";
  const scope = { surface: "api", scope: "disposable_synthetic_row_policy" };
  if (!supportedVersion.test(version)) {
    console.log(JSON.stringify({ ...scope, status: "UNSUPPORTED", stage: "version" }));
    process.exitCode = 1;
    return;
  }
  let target: DisposableGrist;
  try {
    target = await openDisposableGrist(process.env.GIA_QUALIFICATION_CONTAINER ?? "", version);
  } catch {
    console.log(JSON.stringify({ ...scope, version, status: "NOT_TESTED", stage: "disposable_provenance" }));
    process.exitCode = 1;
    return;
  }

  let cases: NativeCase[];
  try {
    cases = nativeCases(target.baseUrl, await fixture(target.baseUrl));
  } catch {
    console.log(JSON.stringify({ ...scope, version, status: "NOT_TESTED", stage: "synthetic_fixture" }));
    process.exitCode = 1;
    return;
  }
  for (const { id, operation, expected, run } of cases) {
    const observation = await run().catch(() => ({} as Observation));
    const status = qualificationStatus(expected, observation);
    console.log(JSON.stringify({ ...scope, version, id, operation, expected,
      observed: observation.decision ?? "UNKNOWN",
      ...(observation.contradictoryEffect ? { effect: "CONTRADICTORY" } : {}), status }));
    if (status !== "PASS") process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
