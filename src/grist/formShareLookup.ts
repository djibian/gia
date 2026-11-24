type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : undefined;
}

function ownerSocketUrl(baseUrl: string, document: JsonRecord, worker: unknown, documentId: string): URL {
  const base = new URL(baseUrl);
  const info = record(worker);
  const workerUrl = typeof info?.docWorkerUrl === "string" ? new URL(info.docWorkerUrl) : new URL(base);
  if (info?.docWorkerUrl === null && typeof info.selfPrefix === "string" &&
      /^\/dw\/self\/v\/[a-zA-Z0-9_.-]{1,80}$/.test(info.selfPrefix)) {
    workerUrl.pathname = info.selfPrefix + workerUrl.pathname;
  } else if (typeof info?.docWorkerUrl !== "string" || info.selfPrefix !== null) {
    throw new Error("Grist did not advertise a supported document worker.");
  }
  if (workerUrl.origin !== base.origin || workerUrl.username || workerUrl.password ||
      workerUrl.search || workerUrl.hash) {
    throw new Error("Grist document worker is not on the configured origin.");
  }
  if (!/\/o\/[a-zA-Z0-9_-]+(?:\/|$)/.test(workerUrl.pathname)) {
    const org = record(record(document.workspace)?.org);
    const id = org?.id;
    const domain = typeof org?.domain === "string" && org.domain
      ? org.domain : typeof id === "number" && Number.isSafeInteger(id) && id > 0
        ? "docs-" + id : "";
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(domain)) {
      throw new Error("Grist did not supply a specific organization for the Form document.");
    }
    workerUrl.pathname = workerUrl.pathname.replace(/\/$/, "") + "/o/" + domain;
  }
  workerUrl.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  workerUrl.searchParams.set("clientId", "0");
  workerUrl.searchParams.set("newClient", "1");
  workerUrl.searchParams.set("doc", documentId);
  return workerUrl;
}

/** Only the fixed Grist openDoc/getShare exchange. Nothing from either reply is returned except the bound key. */
export function readOwnerFormShareKey(
  baseUrl: string, document: JsonRecord, worker: unknown, documentId: string,
  linkId: string, apiKey: string
): Promise<string> {
  if (document.id !== documentId || document.access !== "owners" || !/^[a-zA-Z0-9_-]{1,100}$/.test(linkId)) {
    throw new Error("Native Owner and a verified local Form share are required.");
  }
  const url = ownerSocketUrl(baseUrl, document, worker, documentId);
  // Node's WebSocket constructor supports handshake headers through its Undici options.
  const NodeWebSocket = WebSocket as unknown as new (
    url: URL, options: { headers: Record<string, string> }
  ) => WebSocket;
  return new Promise((resolve, reject) => {
    const socket = new NodeWebSocket(url, {
      headers: { Authorization: "Bearer " + apiKey, Origin: new URL(baseUrl).origin }
    });
    let phase = 0;
    let finished = false;
    const finish = (key?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      if (key === undefined) reject(new Error("Grist could not verify the published Form capability."));
      else resolve(key);
    };
    const timer = setTimeout(() => finish(), 10_000);
    socket.addEventListener("close", () => finish());
    socket.addEventListener("error", () => finish());
    socket.addEventListener("message", event => {
      try {
        if (typeof event.data !== "string" || event.data.length > 4_194_304) return finish();
        const reply = record(JSON.parse(event.data));
        if (phase === 0 && reply?.type === "clientConnect") {
          phase = 1;
          socket.send(JSON.stringify({ reqId: 1, method: "openDoc", args: [documentId, {}] }));
        } else if (phase === 1 && reply?.reqId === 1) {
          const fd = record(reply.data)?.docFD;
          if (reply.error || typeof fd !== "number" || !Number.isSafeInteger(fd) || fd < 0) return finish();
          phase = 2;
          socket.send(JSON.stringify({ reqId: 2, method: "getShare", args: [fd, linkId] }));
        } else if (phase === 2 && reply?.reqId === 2) {
          const share = record(reply.data);
          const key = share?.key;
          if (reply.error || share?.docId !== documentId || share.linkId !== linkId ||
              record(share.options)?.publish !== true ||
              typeof key !== "string" || key === linkId || !/^[a-zA-Z0-9_-]{1,100}$/.test(key)) {
            return finish();
          }
          finish(key);
        }
      } catch {
        finish();
      }
    });
  });
}
