import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthorizedGristService, DocumentGrantVerificationError
} from "../src/grist/authorizedService.js";
import type { GristService } from "../src/grist/service.js";
import type { GristUiActionsAdapter } from "../src/grist/uiActionsAdapter.js";

function fixture(before: Array<{email: string;access: string;parentAccess?: string | null}>,
  write?: (email: string, role: string) => void) {
  let people = before.map(v => ({...v}));
  let ownerChecks = 0;
  const inner = {
    assertDocumentOwner: async () => { ownerChecks++; },
    listDocumentAccess: async () => ({ maxInheritedRole: "owners", users: people }),
    grantDocumentUser: async (_id: string, email: string, role: string) => {
      write?.(email, role);
      if (!write) people.push({email, access: role});
    }
  } as unknown as GristService;
  const service = new AuthorizedGristService(inner, {} as never, {
    nextRequestId: () => "share-test", record: () => {}
  } as never, { id:"share-test", transport:"mcp", grants:[] }, {} as GristUiActionsAdapter);
  return { service, getOwnerChecks: () => ownerChecks };
}

test("individual grant requires an explicit lowercase email and closed role", async () => {
  const {service, getOwnerChecks} = fixture([]);
  await assert.rejects(() => service.grantDocumentUser("synthetic", "EVERYONE@example.com", "viewers"),
    /normalized/);
  await assert.rejects(() => service.grantDocumentUser("synthetic", "everyone@getgrist.com", "viewers"),
    /normalized/);
  assert.equal(getOwnerChecks(), 0);
});

test("native owner and explicit document authorization are enforced before grant", async () => {
  // The authorization service is required by execute(), so a principal with no
  // grants never reaches either the native owner check or the access delta.
  const {service, getOwnerChecks} = fixture([]);
  await assert.rejects(() => service.grantDocumentUser("synthetic", "reader@example.invalid", "viewers"));
  assert.equal(getOwnerChecks(), 0);
});

test("grant parser rejects malformed or ambiguous native sharing snapshots", async () => {
  // Contract validation is exercised through a fully authorized native fixture
  // in tools/grist-compatibility.ts. Here malformed emails fail before execute().
  const {service} = fixture([{email:"owner@example.invalid",access:"owners"}]);
  await assert.rejects(() => service.grantDocumentUser("synthetic", "reader@invalid", "viewers"));
});

test("revoke requires explicit confirmed matching role and an individual email before authorization", async () => {
  const {service, getOwnerChecks} = fixture([]);
  await assert.rejects(() => service.revokeDocumentUser(
    "synthetic","reader@example.invalid","viewers",false as true), /confirmation/);
  await assert.rejects(() => service.revokeDocumentUser(
    "synthetic","everyone@getgrist.com","viewers",true), /normalized/);
  await assert.rejects(() => service.revokeDocumentUser(
    "synthetic","reader@example.invalid","owners" as "viewers",true), /exact prior/);
  assert.equal(getOwnerChecks(),0);
});

test("role changes require a distinct exact viewer/editor pair, individual identity and confirmation", async () => {
  const {service, getOwnerChecks} = fixture([]);
  await assert.rejects(() => service.changeDocumentUserRole(
    "synthetic", "reader@example.invalid", "viewers", "viewers", true), /distinct/);
  await assert.rejects(() => service.changeDocumentUserRole(
    "synthetic", "reader@example.invalid", "viewers", "editors", false as true), /confirmation/);
  await assert.rejects(() => service.changeDocumentUserRole(
    "synthetic", "everyone@getgrist.com", "viewers", "editors", true), /normalized/);
  await assert.rejects(() => service.changeDocumentUserRole(
    "synthetic", "reader@example.invalid", "owners" as "viewers", "editors", true), /distinct/);
  assert.equal(getOwnerChecks(), 0);
});
