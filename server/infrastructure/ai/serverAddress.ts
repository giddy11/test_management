// infrastructure/ai/serverAddress.ts
// Validates a user-supplied Ollama server address before the API ever calls it.
//
// SSRF guard: the SERVER makes the request, so anyone who can save a key could
// otherwise point it at our own private network (metadata endpoints, internal
// services). In production only public https hosts are allowed; in development
// a local Ollama on http://localhost is fine.
//
// This checks the address as typed. It does not resolve DNS, so a public name
// that resolves to a private IP isn't caught here — acceptable for a settings
// field limited to authenticated users, and noted for a future hardening pass.

export const OLLAMA_CLOUD = "https://ollama.com";

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[?::1\]?$|\[?::ffff:|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

export type ServerAddressCheck = { url: string } | { problem: string };

export function checkServerAddress(raw: string, allowPrivate: boolean): ServerAddressCheck {
  let u: URL;
  try {
    u = new URL(String(raw ?? "").trim());
  } catch {
    return { problem: "Enter a full address, such as https://ollama.com" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { problem: "The address must start with https://" };
  }
  if (u.username || u.password) {
    return { problem: "Leave the user name and password out of the address" };
  }
  if (u.search || u.hash) {
    return { problem: "Leave anything after ? or # out of the address" };
  }
  if (!allowPrivate) {
    if (u.protocol !== "https:") return { problem: "The address must start with https://" };
    if (PRIVATE_HOST.test(u.hostname)) {
      return { problem: "That address is on a private network and can't be reached" };
    }
  }
  return { url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}
