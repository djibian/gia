import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { openDisposableGrist, type DisposableGrist, type QualificationStatus } from "./authorization-qualification.js";
import {
  applyActions,
  assertThat,
  callTool,
  createTestApiKey,
  freePort,
  gristApi,
  startBridge,
  stopBridge,
  waitForUrl
} from "./grist-harness.js";

// Independent browser acceptance of native web-only user.LinkKey context.
// Disposable GRIST_TEST_LOGIN instance only. No real URL, token or record data.
const ownerEmail = "linkkey-acceptance-owner@getgrist.com";
const viewerEmail = "linkkey-acceptance-viewer@getgrist.com";
const visibleA = "LINKKEY_VISIBLE_ALPHA_ONLY";
const visibleB = "LINKKEY_VISIBLE_BETA_ONLY";
const visibleControl = "LINKKEY_CONTROL_ROW";
const tableId = "LinkKeyRows";

interface OrgInfo { id: number | string; domain?: string }
interface DriverState { text: string; url: string }

function docIdFrom(value: unknown): string {
  const candidate = (value && typeof value === "object")
    ? (value as { id?: unknown; urlId?: unknown }).id ??
      (value as { urlId?: unknown }).urlId
    : value;
  assertThat((typeof candidate === "string" || typeof candidate === "number") &&
    String(candidate).length > 0, "web_acceptance_doc_id_missing");
  return String(candidate);
}

function webUrl(baseUrl: string, orgDomain: string, documentId: string, token?: string): string {
  const url = new URL("/o/" + encodeURIComponent(orgDomain) +
    "/doc/" + encodeURIComponent(documentId), baseUrl);
  if (token !== undefined) url.searchParams.set("Gate_", token);
  return url.toString();
}

function driverBinary(): string {
  if (process.env.CHROMEDRIVER_BIN) return process.env.CHROMEDRIVER_BIN;
  if (process.env.CHROMEWEBDRIVER) return process.env.CHROMEWEBDRIVER + "/chromedriver";
  return "chromedriver";
}

async function driverRequest(driverBase: string, method: string, path: string, payload?: unknown): Promise<unknown> {
  const response = await fetch(driverBase + path, {
    method,
    ...(payload === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }),
    signal: AbortSignal.timeout(25_000)
  });
  const message = await response.json() as {
    value?: unknown; sessionId?: string
  };
  const value = message.value;
  if (!response.ok ||
      (value && typeof value === "object" && "error" in value)) {
    throw new Error("webdriver_request_failed");
  }
  return value;
}

async function startBrowser(): Promise<{ driver: ChildProcess; driverBase: string; sessionId: string }> {
  const driverPort = await freePort();
  const driverBase = "http://127.0.0.1:" + driverPort;
  const driver = spawn(driverBinary(), ["--port=" + driverPort], {
    stdio: "ignore"
  });
  try {
    await new Promise<void>((resolve, reject) => {
      driver.once("spawn", resolve);
      driver.once("error", reject);
    });
    await waitForUrl(driverBase + "/status", 50);
    const session = await driverRequest(driverBase, "POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
              "--window-size=1440,900", "--no-proxy-server"]
          }
        }
      }
    }) as { sessionId?: unknown };
    assertThat(typeof session?.sessionId === "string", "webdriver_session_missing");
    return { driver, driverBase, sessionId: session.sessionId };
  } catch (error) {
    driver.kill("SIGTERM");
    throw error;
  }
}

async function navigate(driverBase: string, sessionId: string, url: string): Promise<void> {
  await driverRequest(driverBase, "POST", "/session/" + sessionId + "/url", { url });
}

async function inspectPage(driverBase: string, sessionId: string): Promise<DriverState> {
  const value = await driverRequest(driverBase, "POST",
    "/session/" + sessionId + "/execute/sync", {
      script: "return {text: document.body ? document.body.innerText : '', url: location.href};",
      args: []
    }) as DriverState;
  assertThat(typeof value?.text === "string" && typeof value.url === "string",
    "webdriver_dom_snapshot_invalid");
  return value;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Select the actual native table page; a newly created doc starts on Table1. */
async function selectTablePage(driverBase: string, sessionId: string, baseUrl: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const selected = await driverRequest(driverBase, "POST",
      "/session/" + sessionId + "/execute/sync", {
        script: `const labels = [...document.querySelectorAll('*')]
          .filter(el => el.childElementCount === 0 &&
            el.textContent?.trim() === arguments[0]);
          const label = labels[0];
          if (!label) return false;
          label.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
          return true;`,
        args: [tableId]
      }) as boolean;
    if (selected) {
      await delay(900);
      const page = await inspectPage(driverBase, sessionId);
      assertThat(new URL(page.url).origin === new URL(baseUrl).origin, "linkkey_page_navigation_invalid");
      return page.url;
    }
    await delay(500);
  }
  throw new Error("linkkey_table_page_not_found");
}

type VisibleRows = "alpha" | "beta" | "both" | "none";
const surface = "web";
const scope = "authenticated_viewer_link_key_row_visibility";

export function linkKeyVisibilityStatus(
  expected: Exclude<VisibleRows, "both">,
  observed?: VisibleRows
): QualificationStatus {
  if (observed === undefined) return "UNKNOWN";
  return observed === expected ? "PASS" : "FAIL";
}

async function observePage(driverBase: string, sessionId: string, url: string): Promise<VisibleRows | undefined> {
  await navigate(driverBase, sessionId, url);
  const intended = new URL(url);
  let previous: VisibleRows | undefined;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const page = await inspectPage(driverBase, sessionId);
    const current = new URL(page.url);
    const confirmedTarget = current.origin === intended.origin &&
      current.pathname === intended.pathname &&
      current.searchParams.get("Gate_") === intended.searchParams.get("Gate_") &&
      page.text.includes(tableId) && page.text.includes(visibleControl);
    if (confirmedTarget) {
      const alpha = page.text.includes(visibleA);
      const beta = page.text.includes(visibleB);
      const observed = alpha ? (beta ? "both" : "alpha") : (beta ? "beta" : "none");
      if (previous === observed) return observed;
      previous = observed;
    } else {
      previous = undefined;
    }
    await delay(750);
  }
}

async function run({ baseUrl, version }: DisposableGrist): Promise<void> {
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const ownerKey = await createTestApiKey(baseUrl, ownerEmail, "LinkKey Owner");
  await createTestApiKey(baseUrl, viewerEmail, "LinkKey Viewer");
  const orgs = await gristApi(baseUrl, ownerKey, "/api/orgs") as OrgInfo[];
  assertThat(Array.isArray(orgs) && orgs.length > 0, "linkkey_org_missing");
  const org = orgs[0]!;
  assertThat(org.id !== undefined, "linkkey_org_id_missing");
  const orgDomain = org.domain || "docs";

  const workspace = await gristApi(baseUrl, ownerKey,
    "/api/orgs/" + encodeURIComponent(String(org.id)) + "/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Disposable LinkKey Web Acceptance" })
    });
  assertThat(typeof workspace === "number", "linkkey_workspace_create_failed");
  const created = await gristApi(baseUrl, ownerKey,
    "/api/workspaces/" + workspace + "/docs", {
      method: "POST",
      body: JSON.stringify({ name: "LinkKey Browser Acceptance" })
    });
  const documentId = docIdFrom(created);

  await applyActions(baseUrl, ownerKey, documentId, [
    ["AddTable", tableId, [
      { id: "Gate", type: "Text" },
      { id: "Label", type: "Text" },
      { id: "PublicControl", type: "Bool" }
    ]],
    ["AddRecord", tableId, 1, { Gate: tokenA, Label: visibleA }],
    ["AddRecord", tableId, 2, { Gate: tokenB, Label: visibleB }],
    ["AddRecord", tableId, 3, { Label: visibleControl, PublicControl: true }]
  ]);

  const bridge = await startBridge({
    baseUrl, apiKey: ownerKey, documentIds: [documentId]
  });
  try {
    const createdPolicy = await callTool(bridge.baseUrl, "grist_change_structure", {
      action: "access_rule_group",
      documentId,
      mode: "create",
      target: { tableId },
      rules: [
        {
          condition: { kind: "user_access", operator: "equals", role: "owner" },
          permissions: { read: "allow", update: "allow", create: "allow", delete: "allow" }
        },
        {
          condition: { kind: "all", conditions: [
            { kind: "match_boolean", columnId: "PublicControl", operator: "equals", value: true },
            { kind: "user_access", operator: "equals", role: "viewer" },
            { kind: "user_login_status", operator: "equals", value: true }
          ] },
          permissions: { read: "allow", update: "unspecified", create: "unspecified", delete: "unspecified" }
        },
        {
          condition: {
            kind: "match_link_key", operator: "equals",
            columnId: "Gate", linkKeyName: "Gate"
          },
          permissions: { read: "allow", update: "unspecified",
            create: "unspecified", delete: "unspecified" }
        },
        {
          condition: { kind: "everyone" },
          permissions: { read: "deny", update: "deny", create: "deny", delete: "deny" }
        }
      ]
    }) as { persistedDefinitionVerified?: unknown };
    assertThat(createdPolicy?.persistedDefinitionVerified === true,
      "linkkey_native_policy_not_persisted");

    await gristApi(baseUrl, ownerKey,
      "/api/docs/" + encodeURIComponent(documentId) + "/access", {
        method: "PATCH",
        body: JSON.stringify({ delta: { users: { [viewerEmail]: "viewers" } } })
      });

    const { driver, driverBase, sessionId } = await startBrowser();
    try {
      const login = new URL("/test/login", baseUrl);
      login.searchParams.set("username", viewerEmail);
      login.searchParams.set("name", "LinkKey Viewer");
      await navigate(driverBase, sessionId, login.toString());
      await navigate(driverBase, sessionId, webUrl(baseUrl, orgDomain, documentId, tokenA));
      const pageUrl = new URL(await selectTablePage(driverBase, sessionId, baseUrl));
      const urlFor = (token?: string): string => {
        const url = new URL(pageUrl);
        url.searchParams.delete("Gate_");
        if (token !== undefined) url.searchParams.set("Gate_", token);
        return url.toString();
      };
      const cases = [
        { id: "correct-key-first-row", expected: "alpha", token: tokenA },
        { id: "correct-key-second-row", expected: "beta", token: tokenB },
        { id: "missing-key", expected: "none", token: undefined },
        { id: "wrong-key", expected: "none", token: randomUUID() }
      ] as const;
      for (const { id, expected, token } of cases) {
        const observed = await observePage(driverBase, sessionId, urlFor(token)).catch(() => undefined);
        const status = linkKeyVisibilityStatus(expected, observed);
        console.log(JSON.stringify({ version, surface, scope, id, expected,
          observed: observed ?? "UNKNOWN", status }));
        if (status !== "PASS") process.exitCode = 1;
      }
    } finally {
      await driverRequest(driverBase, "DELETE", "/session/" + sessionId).catch(() => {});
      driver.kill("SIGTERM");
    }
  } finally {
    await stopBridge(bridge.child);
  }
}

async function main(): Promise<void> {
  let target: DisposableGrist;
  try {
    target = await openDisposableGrist(
      process.env.GIA_QUALIFICATION_CONTAINER ?? "", process.env.GRIST_COMPAT_VERSION ?? ""
    );
  } catch {
    console.log(JSON.stringify({ surface, scope, stage: "disposable_provenance", status: "NOT_TESTED" }));
    process.exitCode = 1;
    return;
  }
  await run(target).catch(() => {
    console.log(JSON.stringify({ version: target.version, surface, scope,
      stage: "synthetic_browser_setup", status: "NOT_TESTED" }));
    process.exitCode = 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
