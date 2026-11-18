import { spawn, type ChildProcess } from "node:child_process";
import {
  applyActions,
  assertThat,
  callTool,
  createTestApiKey,
  gristApi,
  startBridge,
  stopBridge,
  waitForUrl
} from "./grist-harness.js";

// Independent browser acceptance of native web-only user.LinkKey context.
// Disposable GRIST_TEST_LOGIN instance only. No real URL, token or record data.
const baseUrl = process.env.GRIST_COMPAT_BASE_URL?.trim();
const ownerEmail = "linkkey-acceptance-owner@getgrist.com";
const viewerEmail = "linkkey-acceptance-viewer@getgrist.com";
const visibleA = "LINKKEY_VISIBLE_ALPHA_ONLY";
const visibleB = "LINKKEY_VISIBLE_BETA_ONLY";
const tokenA = "synthetic-compat-alpha-001";
const tokenB = "synthetic-compat-beta-002";
const tableId = "LinkKeyRows";
const driverPort = 9515;
const driverBase = "http://127.0.0.1:" + driverPort;

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

function webUrl(orgDomain: string, documentId: string, token?: string): string {
  assertThat(baseUrl, "missing_grist_compat_base_url");
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

async function driverRequest(method: string, path: string, payload?: unknown): Promise<unknown> {
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
    throw new Error("webdriver_" + method + "_" + path + ":" +
      JSON.stringify(value).slice(0, 800));
  }
  return value;
}

async function startBrowser(): Promise<{ driver: ChildProcess; sessionId: string }> {
  const driver = spawn(driverBinary(), ["--port=" + driverPort], {
    stdio: ["ignore", "inherit", "inherit"]
  });
  try {
    await waitForUrl(driverBase + "/status", 50);
    const session = await driverRequest("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
              "--window-size=1440,900"]
          }
        }
      }
    }) as { sessionId?: unknown };
    assertThat(typeof session?.sessionId === "string", "webdriver_session_missing");
    return { driver, sessionId: session.sessionId };
  } catch (error) {
    driver.kill("SIGTERM");
    throw error;
  }
}

async function navigate(sessionId: string, url: string): Promise<void> {
  await driverRequest("POST", "/session/" + sessionId + "/url", { url });
}

async function inspectPage(sessionId: string): Promise<DriverState> {
  const value = await driverRequest("POST",
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
async function selectTablePage(sessionId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const selected = await driverRequest("POST",
      "/session/" + sessionId + "/execute/sync", {
        script: `const link = [...document.querySelectorAll('a,[role="link"],.test-treeview-item')]
          .find(el => el.textContent?.trim() === arguments[0]);
          if (!link) return false;
          link.click();
          return true;`,
        args: [tableId]
      }) as boolean;
    if (selected) {
      await delay(900);
      const page = await inspectPage(sessionId);
      assertThat(page.url.includes("/doc/"), "linkkey_page_navigation_invalid");
      return page.url;
    }
    await delay(500);
  }
  throw new Error("linkkey_table_page_not_found");
}

async function assertPage(
  sessionId: string,
  url: string,
  expected: "alpha" | "beta" | "none"
): Promise<void> {
  await navigate(sessionId, url);
  let last: DriverState = { text: "", url: "" };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    last = await inspectPage(sessionId);
    const a = last.text.includes(visibleA);
    const b = last.text.includes(visibleB);
    if (expected !== "none" && last.text.includes(tableId) &&
        (expected === "alpha" ? a && !b : b && !a)) return;
    if (expected === "none" && attempt >= 8 && !a && !b &&
        last.url.includes("/doc/") && last.text.length > 50) {
      // A denied table can disappear from the native navigation altogether.
      // Confirm absence again after a settle interval, not on a blank page.
      await delay(1500);
      const settled = await inspectPage(sessionId);
      if (!settled.text.includes(visibleA) && !settled.text.includes(visibleB) &&
          settled.url.includes("/doc/") && settled.text.length > 50) return;
    }
    await delay(500);
  }
  throw new Error("linkkey_web_" + expected + "_not_observed:" +
    last.url + ":" + last.text.slice(0, 800));
}

async function run(): Promise<void> {
  assertThat(baseUrl, "missing_grist_compat_base_url");
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
      { id: "Label", type: "Text" }
    ]],
    ["AddRecord", tableId, 1, { Gate: tokenA, Label: visibleA }],
    ["AddRecord", tableId, 2, { Gate: tokenB, Label: visibleB }]
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

    const { driver, sessionId } = await startBrowser();
    try {
      const login = new URL("/test/login", baseUrl);
      login.searchParams.set("username", viewerEmail);
      login.searchParams.set("name", "LinkKey Viewer");
      await navigate(sessionId, login.toString());
      await navigate(sessionId, webUrl(orgDomain, documentId, tokenA));
      const pageUrl = new URL(await selectTablePage(sessionId));
      const urlFor = (token?: string): string => {
        const url = new URL(pageUrl);
        url.searchParams.delete("Gate_");
        if (token !== undefined) url.searchParams.set("Gate_", token);
        return url.toString();
      };
      await assertPage(sessionId, urlFor(tokenA), "alpha");
      await assertPage(sessionId, urlFor(tokenB), "beta");
      await assertPage(sessionId, urlFor(), "none");
      await assertPage(sessionId, urlFor("synthetic-unrecognized-token"), "none");
      console.log("LinkKey web acceptance: PASS (two allowed rows, absent/wrong keys denied)");
    } finally {
      await driverRequest("DELETE", "/session/" + sessionId).catch(() => {});
      driver.kill("SIGTERM");
    }
  } finally {
    await stopBridge(bridge.child);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
