/**
 * Mint a local-stack user JWT, so the Edge Function can be driven from a shell.
 *
 * Local only, and only useful there: it signs with the CLI's fixed development
 * JWT secret, which every local stack shares and no deployed project uses.
 *
 *   deno run --allow-env supabase/functions/_stub/mint-jwt.ts <user-uuid>
 */

const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

const sub = Deno.args[0];
if (!sub) {
  console.error("usage: mint-jwt.ts <user-uuid>");
  Deno.exit(1);
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const now = Math.floor(Date.now() / 1000);
const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = base64url(
  JSON.stringify({
    sub,
    aud: "authenticated",
    role: "authenticated",
    iss: "http://127.0.0.1:54321/auth/v1",
    iat: now,
    exp: now + 3600,
  }),
);

const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(LOCAL_JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const signature = await crypto.subtle.sign(
  "HMAC",
  key,
  new TextEncoder().encode(`${header}.${payload}`),
);

console.log(`${header}.${payload}.${base64url(new Uint8Array(signature))}`);
