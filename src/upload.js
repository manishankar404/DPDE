import * as Client from '@web3-storage/w3up-client'
import { CID } from "multiformats/cid";
import { importDAG } from "@ucanto/core/delegation";
import { CarReader } from "@ipld/car";
import { Buffer } from "buffer";

let clientPromise = null
const DEBUG_W3UP = Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_W3UP_DEBUG || "") === "true";

function debugLog(...args) {
  if (!DEBUG_W3UP) return;
  // eslint-disable-next-line no-console
  console.log("[w3up]", ...args);
}

function debugGroup(label, details = null) {
  if (!DEBUG_W3UP) return { end: () => {} };
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[w3up] ${label}`);
  if (details) {
    // eslint-disable-next-line no-console
    console.log(details);
  }
  return {
    end: () => {
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  };
}

function decodeBase64ToBytes(base64) {
  const normalized = String(base64 || "")
    .trim()
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  if (!normalized) return new Uint8Array();
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const withPadding = `${normalized}${padding}`;
  return Uint8Array.from(Buffer.from(withPadding, "base64"));
}

async function parseDelegationProof(base64Car) {
  const bytes = decodeBase64ToBytes(base64Car);
  if (!bytes.length) {
    throw new Error("VITE_W3UP_PROOF is set but empty/invalid.");
  }

  const blocks = [];
  const reader = await CarReader.fromBytes(bytes);
  // eslint-disable-next-line no-restricted-syntax
  for await (const block of reader.blocks()) {
    blocks.push(block);
  }
  return importDAG(blocks);
}

function isExpiredAuthError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes('"can":"access/claim"') ||
    /has expired/i.test(message) ||
    /not authorized/i.test(message)
  );
}

async function initializeClient({ forceReauth = false } = {}) {
  const group = debugGroup("initializeClient()", { forceReauth });
  const client = await Client.create();
  debugLog("agent:did", client.did());

  const proofBase64 = String(import.meta.env.VITE_W3UP_PROOF || "").trim();
  if (proofBase64) {
    debugLog("proof:using-env");
    try {
      const proof = await parseDelegationProof(proofBase64);
      const space = await client.addSpace(proof);
      await client.setCurrentSpace(space.did());
      debugLog("proof:space:selected", space.did());
      debugLog("client:ready", { did: client.did(), hasCurrentSpace: Boolean(client.currentSpace()) });
      group.end();
      return client;
    } catch (error) {
      debugLog("proof:error", error);
      group.end();
      throw error;
    }
  }

  const email = String(import.meta.env.VITE_WEB3_EMAIL || "").trim();
  if (!email) {
    group.end();
    throw new Error("Configure `VITE_W3UP_PROOF` (recommended) or `VITE_WEB3_EMAIL` for Storacha auth.");
  }

  if (!client.currentSpace() || forceReauth) {
    debugLog("auth:start", { hasCurrentSpace: Boolean(client.currentSpace()), email });
    try {
      await client.login(email);
      debugLog("auth:login:ok");
    } catch (error) {
      debugLog("auth:login:error", error);
      group.end();
      throw error;
    }

    try {
      const delegations = await client.capability.access.claim();
      debugLog("auth:claim:ok", { delegations: Array.isArray(delegations) ? delegations.length : 0 });
    } catch (error) {
      debugLog("auth:claim:error", error);
      group.end();
      throw error;
    }

    const spaces = await client.spaces();
    const current = client.currentSpace();
    const space = current || spaces[0];
    if (!space) {
      throw new Error("No Web3.Storage space found for this account.");
    }
    await client.setCurrentSpace(space.did());
    debugLog("space:selected", space.did());
  }

  debugLog("client:ready", { did: client.did(), hasCurrentSpace: Boolean(client.currentSpace()) });
  group.end();
  return client;
}

async function getClient(options = {}) {
  if (!clientPromise) {
    clientPromise = initializeClient(options);
  }
  return clientPromise;
}

export async function uploadToIPFS(blob) {
  const file = new File([blob], 'encrypted-file')

  try {
    debugLog("upload:start", { size: blob?.size ?? null });
    const client = await getClient()
    const cid = await client.uploadFile(file)
    debugLog("upload:ok", { cid: cid?.toString?.() });
    return cid.toString()
  } catch (error) {
    debugLog("upload:error", error);
    if (isExpiredAuthError(error)) {
      debugLog("upload:reauth:triggered");
      clientPromise = null;
      const client = await getClient({ forceReauth: true })
      const cid = await client.uploadFile(file)
      debugLog("upload:reauth:ok", { cid: cid?.toString?.() });
      return cid.toString()
    }
    throw error
  }
}

export async function removeFromIPFS(cid, options = {}) {
  const value = String(cid || "").trim();
  if (!value) throw new Error("cid is required");

  const link = CID.parse(value);

  try {
    debugLog("remove:start", { cid: value });
    const client = await getClient();
    await client.remove(link, { shards: true, ...options });
    debugLog("remove:ok", { cid: value });
    return true;
  } catch (error) {
    debugLog("remove:error", error);
    if (isExpiredAuthError(error)) {
      debugLog("remove:reauth:triggered");
      clientPromise = null;
      try {
        const client = await getClient({ forceReauth: true });
        await client.remove(link, { shards: true, ...options });
        debugLog("remove:reauth:ok", { cid: value });
      } catch (reauthError) {
        debugLog("remove:reauth:error", reauthError);
        const hint =
          "Storacha/Web3.Storage auth failed. Best fix: set `VITE_W3UP_PROOF` (base64 CAR delegation from w3cli) so the app doesn't rely on email login. " +
          "If you still use email auth, verify `VITE_WEB3_EMAIL` and check inbox/spam.";
        throw new Error(`${String(reauthError?.message || reauthError || "Reauth failed")}\\n\\n${hint}`);
      }
      return true;
    }
    throw error;
  }
}
