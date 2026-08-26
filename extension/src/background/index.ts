/**
 * Owns the Supabase session. The web-app bridge content script hands us
 * tokens whenever it sees them change; every other script asks us for a
 * fresh access token rather than touching storage or the refresh endpoint
 * itself, so a token refresh never races across multiple open tabs.
 *
 * Also proxies allowlisted HTTP for content scripts (page CORS would block
 * Greenhouse → Supabase / Vercel from the panel otherwise), and drives the
 * sign-in → return-to-job-tab flow.
 */
import { apiBaseUrl, authUrl, isConfigured, signInUrl, supabaseKey, supabaseUrl, trustedAppOrigins } from "../lib/config";
import type { ExtensionMessage, GetSessionResponse, ProxyFetchResponse, StartSignInResponse } from "../lib/messages";
import type { BridgeSession } from "../lib/types";

const STORAGE_KEY = "pfm_session";
const PENDING_SIGN_IN_KEY = "pfm_pending_sign_in";
/** Refresh this far ahead of expiry so a slow network doesn't cost a request a 401. */
const REFRESH_SKEW_SECONDS = 90;

interface PendingSignIn {
  returnTabId: number;
  loginTabId: number;
  startedAt: number;
}

async function readSession(): Promise<BridgeSession | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as BridgeSession | undefined) ?? null;
}

async function writeSession(session: BridgeSession | null): Promise<void> {
  if (session) {
    await chrome.storage.local.set({ [STORAGE_KEY]: session });
  } else {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
}

async function readPendingSignIn(): Promise<PendingSignIn | null> {
  const stored = await chrome.storage.local.get(PENDING_SIGN_IN_KEY);
  return (stored[PENDING_SIGN_IN_KEY] as PendingSignIn | undefined) ?? null;
}

async function writePendingSignIn(pending: PendingSignIn | null): Promise<void> {
  if (pending) {
    await chrome.storage.local.set({ [PENDING_SIGN_IN_KEY]: pending });
  } else {
    await chrome.storage.local.remove(PENDING_SIGN_IN_KEY);
  }
}

let refreshInFlight: Promise<BridgeSession | null> | null = null;

async function refresh(session: BridgeSession): Promise<BridgeSession | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: supabaseKey },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
        user?: { email?: string | null };
      };
      if (!body.access_token || !body.refresh_token) return null;
      const next: BridgeSession = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: body.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        userEmail: body.user?.email ?? session.userEmail,
      };
      await writeSession(next);
      return next;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Content scripts are NOT re-injected into already-open tabs when the
 * extension reloads. Pull the session directly so a signed-in PrepFor.Me
 * tab still works without the user refreshing it.
 */
async function pullSessionFromAppTabs(): Promise<BridgeSession | null> {
  const urlPatterns = trustedAppOrigins.map((origin) => `${origin.replace(/\/+$/, "")}/*`);
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({ url: urlPatterns });
  } catch {
    return null;
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const [{ result } = { result: null }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const SESSION_KEY_PATTERN = /^sb-.*-auth-token$/;
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key) continue;
            if (!SESSION_KEY_PATTERN.test(key) && key !== "supabase.auth.token") continue;
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw) as {
                access_token?: string;
                refresh_token?: string;
                expires_at?: number;
                user?: { email?: string | null };
                currentSession?: {
                  access_token?: string;
                  refresh_token?: string;
                  expires_at?: number;
                  user?: { email?: string | null };
                };
              };
              const session = parsed.access_token ? parsed : parsed.currentSession;
              if (!session?.access_token || !session.refresh_token) continue;
              return {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                userEmail: session.user?.email ?? null,
              };
            } catch {
              // keep looking
            }
          }
          return null;
        },
      });
      if (result?.accessToken && result.refreshToken) {
        const session: BridgeSession = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
          userEmail: result.userEmail,
        };
        await writeSession(session);
        return session;
      }
    } catch {
      // Tab may be restricted or still loading.
    }
  }
  return null;
}

async function getSession(): Promise<GetSessionResponse> {
  let session = await readSession();
  if (!session) {
    session = await pullSessionFromAppTabs();
  }
  if (!session) return { ok: false, reason: "not_signed_in" };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expiresAt - nowSeconds > REFRESH_SKEW_SECONDS) {
    return { ok: true, accessToken: session.accessToken, userEmail: session.userEmail };
  }

  const refreshed = await refresh(session);
  if (!refreshed) {
    // Stale storage — try the live PrepFor.Me tab before giving up.
    const pulled = await pullSessionFromAppTabs();
    if (pulled && pulled.expiresAt - nowSeconds > REFRESH_SKEW_SECONDS) {
      return { ok: true, accessToken: pulled.accessToken, userEmail: pulled.userEmail };
    }
    if (pulled) {
      const retried = await refresh(pulled);
      if (retried) {
        return { ok: true, accessToken: retried.accessToken, userEmail: retried.userEmail };
      }
    }
    return { ok: false, reason: "refresh_failed" };
  }
  return { ok: true, accessToken: refreshed.accessToken, userEmail: refreshed.userEmail };
}

function isAllowedProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabase = new URL(supabaseUrl);
    const api = new URL(apiBaseUrl);
    return (
      (parsed.origin === supabase.origin && parsed.protocol === "https:") ||
      (parsed.origin === api.origin &&
        (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

async function proxyFetch(message: Extract<ExtensionMessage, { type: "PROXY_FETCH" }>): Promise<ProxyFetchResponse> {
  if (!isConfigured) {
    return {
      ok: false,
      error:
        "Extension isn't configured. Add extension/.env.local (same Supabase values as the main app), run npm run build, and reload the unpacked extension.",
    };
  }
  if (!isAllowedProxyUrl(message.url)) {
    return { ok: false, error: "That request isn't allowed from the extension." };
  }

  try {
    const response = await fetch(message.url, {
      method: message.method ?? "GET",
      headers: message.headers,
      body: message.body,
    });
    const contentType = response.headers.get("content-type");
    if (message.responseType === "base64") {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return { ok: true, status: response.status, body: btoa(binary), contentType };
    }
    return { ok: true, status: response.status, body: await response.text(), contentType };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "network error";
    return {
      ok: false,
      error: `Couldn't reach PrepFor.Me's servers (${detail}). Check your connection, then reload the extension.`,
    };
  }
}

function signInUrlWithFlag(): string {
  const url = new URL(signInUrl);
  url.searchParams.set("from", "extension");
  return url.toString();
}

async function broadcastSessionReady(email: string | null): Promise<void> {
  const message = { type: "SESSION_READY", email } satisfies ExtensionMessage;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // No content script on this tab.
      }
    }),
  );
}

async function completeSignInReturn(session: BridgeSession): Promise<void> {
  const pending = await readPendingSignIn();
  if (!pending) {
    await broadcastSessionReady(session.userEmail);
    return;
  }

  await writePendingSignIn(null);

  try {
    await chrome.tabs.update(pending.returnTabId, { active: true });
    const returnTab = await chrome.tabs.get(pending.returnTabId);
    if (returnTab.windowId != null) {
      await chrome.windows.update(returnTab.windowId, { focused: true });
    }
  } catch {
    // Return tab may have been closed — still broadcast so any open panel updates.
  }

  if (pending.loginTabId !== pending.returnTabId) {
    try {
      await chrome.tabs.remove(pending.loginTabId);
    } catch {
      // Login tab already closed.
    }
  }

  await broadcastSessionReady(session.userEmail);
}

async function startSignIn(returnTabId?: number): Promise<StartSignInResponse> {
  const jobTabId = returnTabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!jobTabId) {
    return { ok: false, error: "Couldn't find the job tab to return to." };
  }

  const existing = await readPendingSignIn();
  if (existing?.loginTabId) {
    try {
      await chrome.tabs.update(existing.loginTabId, { active: true, url: signInUrlWithFlag() });
      await writePendingSignIn({ ...existing, returnTabId: jobTabId, startedAt: Date.now() });
      return { ok: true };
    } catch {
      // recreate below
    }
  }

  const loginTab = await chrome.tabs.create({ url: signInUrlWithFlag(), active: true });
  if (!loginTab.id) {
    return { ok: false, error: "Couldn't open PrepFor.Me." };
  }
  await writePendingSignIn({
    returnTabId: jobTabId,
    loginTabId: loginTab.id,
    startedAt: Date.now(),
  });
  return { ok: true };
}

async function onSessionFromWebapp(session: BridgeSession | null): Promise<void> {
  await writeSession(session);
  if (session) {
    await completeSignInReturn(session);
  }
}

/**
 * Reach every frame of the tab. Greenhouse company embeds put the Apply form
 * in a cross-origin iframe — the top-frame panel cannot read that DOM.
 * Prefer messaging the dedicated Greenhouse content script; fall back to
 * executeScript injection.
 */
async function autofillAllFrames(
  tabId: number,
  message: Extract<ExtensionMessage, { type: "AUTOFILL_ALL_FRAMES" }>,
): Promise<{
  ok: true;
  filled: string[];
  flagged: string[];
  inputsSeen?: number;
  sawGreenhouseForm?: boolean;
} | { ok: false; error: string }> {
  const filled: string[] = [];
  const flagged: string[] = [];
  let inputsSeen = 0;
  let sawGreenhouseForm = false;

  const merge = (report: {
    filled?: string[];
    flagged?: string[];
    inputsSeen?: number;
    sawGreenhouseForm?: boolean;
  }) => {
    for (const label of report.filled ?? []) {
      if (!filled.includes(label)) filled.push(label);
    }
    for (const label of report.flagged ?? []) {
      if (!flagged.includes(label)) flagged.push(label);
    }
    inputsSeen += report.inputsSeen ?? 0;
    if (report.sawGreenhouseForm) sawGreenhouseForm = true;
  };

  const frameMessage = {
    type: "AUTOFILL_THIS_FRAME" as const,
    ats: message.ats,
    fields: message.fields,
    profile: message.profile,
    resumePdfBase64: message.resumePdfBase64 ?? null,
    resumeFileName: message.resumeFileName ?? null,
  };

  let frames: chrome.webNavigation.GetAllFrameResultDetails[] | null = null;
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (frames) {
      await Promise.all(
        frames.map(async (frame) => {
          try {
            const response = (await chrome.tabs.sendMessage(tabId, frameMessage, {
              frameId: frame.frameId,
            })) as { ok?: boolean; report?: {
              filled: string[];
              flagged: string[];
              inputsSeen?: number;
              sawGreenhouseForm?: boolean;
            } } | undefined;
            if (response?.report) merge(response.report);
          } catch {
            // No content script in this frame.
          }
        }),
      );
    }
  } catch {
    // webNavigation unavailable — fall through to executeScript.
  }

  if (
    filled.length > 0 &&
    filled.includes("Phone") &&
    (!message.resumePdfBase64 || filled.includes("Resume"))
  ) {
    return { ok: true, filled, flagged, inputsSeen, sawGreenhouseForm };
  }

  try {
    // Use explicit frameIds instead of allFrames to avoid MAIN world.
    const targetFrameIds: number[] = [];
    if (frames) {
      const topOrigin = frames.find((f) => f.frameId === 0)?.url;
      const topOriginObj = topOrigin ? new URL(topOrigin) : null;
      for (const frame of frames) {
        try {
          const frameUrl = new URL(frame.url);
          // Include frames matching top origin or known ATS hosts.
          if (
            (topOriginObj && frameUrl.origin === topOriginObj.origin) ||
            /greenhouse\.io$/i.test(frameUrl.hostname)
          ) {
            targetFrameIds.push(frame.frameId);
          }
        } catch {
          // Invalid URL, skip.
        }
      }
    }

    const results = await chrome.scripting.executeScript({
      target: targetFrameIds.length > 0 ? { tabId, frameIds: targetFrameIds } : { tabId },
      args: [
        message.ats,
        message.fields,
        message.profile,
        message.resumePdfBase64 ?? null,
        message.resumeFileName ?? null,
      ] as const,
      func: (ats, fields, profile, resumePdfBase64, resumeFileName) => {
        const filledLocal: string[] = [];
        const flaggedLocal: string[] = [];
        let inputsSeenLocal = 0;
        let sawForm = false;

        try {
          const links = Array.isArray(fields?.links) ? fields.links : [];
          const splitName = (fullName: string | null | undefined) => {
            const trimmed = (fullName ?? "").trim();
            if (!trimmed) return { first: "", last: "" };
            const parts = trimmed.split(/\s+/);
            return { first: parts[0], last: parts.slice(1).join(" ") };
          };

          const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
            const valueProp = Object.getOwnPropertyDescriptor(el, "value");
            const proto = Object.getPrototypeOf(el) as HTMLInputElement;
            const protoProp = Object.getOwnPropertyDescriptor(proto, "value");
            const protoSetter = protoProp?.set;
            const ownSetter = valueProp?.set;
            if (protoSetter && ownSetter && protoSetter !== ownSetter) protoSetter.call(el, value);
            else if (ownSetter) ownSetter.call(el, value);
            else if (protoSetter) protoSetter.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
          };

          const setBySelectors = (selectors: string[], value: string | null | undefined, label: string) => {
            if (!value?.trim()) return;
            for (const selector of selectors) {
              let el: HTMLInputElement | null = null;
              try {
                el = document.querySelector(selector);
              } catch {
                continue;
              }
              if (!el && selector.startsWith("#")) {
                el = document.getElementById(selector.slice(1)) as HTMLInputElement | null;
              }
              if (!el || (el.value && el.value.trim())) continue;
              setNativeValue(el, value);
              if (!filledLocal.includes(label)) filledLocal.push(label);
              return;
            }
          };

          sawForm = !!document.getElementById("first_name") || !!document.getElementById("application-form");
          const { first, last } = splitName(fields?.fullName);
          const phoneForRules = fields?.phone?.trim() || profile?.phone?.trim() || null;
          if (ats === "greenhouse" || sawForm) {
            setBySelectors(["#first_name", "input[autocomplete='given-name']"], first, "First name");
            setBySelectors(["#last_name", "input[autocomplete='family-name']"], last, "Last name");
            setBySelectors(["#email", "input[autocomplete='email']"], fields?.email, "Email");
            setBySelectors(["#phone", "input[type='tel']"], phoneForRules, "Phone");
            const phoneEl = document.getElementById("phone");
            if (phoneForRules && phoneEl instanceof HTMLInputElement && !phoneEl.value.trim()) {
              setNativeValue(phoneEl, phoneForRules);
              if (!filledLocal.includes("Phone")) filledLocal.push("Phone");
            }
          }

          const normalize = (text: string) =>
            text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

          const labelFor = (field: HTMLElement): string => {
            if (field.id) {
              const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
              if (label?.textContent) return label.textContent;
            }
            return (
              field.getAttribute("aria-label") ||
              field.closest("label")?.textContent ||
              field.closest(".field-wrapper")?.querySelector("label")?.textContent ||
              field.getAttribute("placeholder") ||
              field.getAttribute("name") ||
              ""
            );
          };

          const rules: { test: RegExp; value: string | null | undefined; label: string }[] = [
            { test: /first ?name/, value: first || null, label: "First name" },
            { test: /last ?name/, value: last || null, label: "Last name" },
            { test: /e[\s-]?mail/, value: fields?.email, label: "Email" },
            { test: /^phone$|phone number|mobile|cell/, value: phoneForRules, label: "Phone" },
            { test: /linkedin/, value: links.find((l) => /linkedin/i.test(`${l.label} ${l.url}`))?.url, label: "LinkedIn" },
          ];

          const inputs = Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
          ).filter((el) => {
            if (el instanceof HTMLInputElement) {
              const type = (el.type || "text").toLowerCase();
              if (["hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset"].includes(type)) {
                return false;
              }
              if (el.classList.contains("select__input") || el.getAttribute("role") === "combobox") return false;
            }
            return true;
          });
          inputsSeenLocal = inputs.length;

          for (const field of inputs) {
            if (field.value.trim()) continue;
            const label = normalize(labelFor(field));
            const rule = rules.find((r) => r.test.test(label));
            if (!rule?.value?.trim()) continue;
            setNativeValue(field, rule.value);
            if (!filledLocal.includes(rule.label)) filledLocal.push(rule.label);
          }

          if (resumePdfBase64) {
            let resumeInput = document.getElementById("resume") as HTMLInputElement | null;
            if (!(resumeInput instanceof HTMLInputElement) || resumeInput.type !== "file") {
              resumeInput = document.querySelector<HTMLInputElement>(
                'input[type="file"][id*="resume"], input[type="file"][name*="resume"]',
              );
            }
            if (resumeInput && !(resumeInput.files && resumeInput.files.length)) {
              const binary = atob(resumePdfBase64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const name =
                resumeFileName ||
                `${(fields?.fullName || "Resume").replace(/[^\w -]/g, "").trim() || "Resume"} - Tailored.pdf`;
              const file = new File([bytes], name, { type: "application/pdf" });
              const transfer = new DataTransfer();
              transfer.items.add(file);
              try {
                resumeInput.files = transfer.files;
              } catch {
                Object.defineProperty(resumeInput, "files", { value: transfer.files, configurable: true });
              }
              resumeInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
              resumeInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              if (resumeInput.files && resumeInput.files.length > 0) {
                if (!filledLocal.includes("Resume")) filledLocal.push("Resume");
              } else {
                flaggedLocal.push("Attach your resume manually — the page blocked setting the file input");
              }
            }
          }

          void profile;
        } catch (err) {
          flaggedLocal.push(err instanceof Error ? err.message : "Frame fill failed");
        }

        return {
          filled: filledLocal,
          flagged: flaggedLocal,
          inputsSeen: inputsSeenLocal,
          sawGreenhouseForm: sawForm,
        };
      },
    });

    for (const entry of results) {
      if (entry.result) merge(entry.result);
    }
    return { ok: true, filled, flagged, inputsSeen, sawGreenhouseForm };
  } catch (e) {
    if (filled.length > 0) {
      return { ok: true, filled, flagged, inputsSeen, sawGreenhouseForm };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't reach the application form frames.",
    };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === "SESSION_FROM_WEBAPP") {
    onSessionFromWebapp(message.session).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "GET_SESSION") {
    getSession().then(sendResponse);
    return true;
  }
  if (message.type === "CLEAR_SESSION") {
    writeSession(null).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "PROXY_FETCH") {
    proxyFetch(message).then(sendResponse);
    return true;
  }
  if (message.type === "START_SIGN_IN") {
    const returnTabId = message.returnTabId ?? sender.tab?.id;
    startSignIn(returnTabId).then(sendResponse);
    return true;
  }
  if (message.type === "OPEN_PDF_TAB") {
    const requestId = `pfm_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const storageKey = `pfm_pdf_preview_${requestId}`;
    chrome.storage.session
      .set({
        [storageKey]: {
          base64: message.base64,
          fileName: message.fileName ?? "Resume - Tailored.pdf",
          createdAt: Date.now(),
        },
      })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL(`pdf-viewer.html?req=${requestId}`) }))
      .then(() => sendResponse({ ok: true as const }))
      .catch((e) =>
        sendResponse({
          ok: false as const,
          error: e instanceof Error ? e.message : "Couldn't open the PDF tab.",
        }),
      );
    return true;
  }
  if (message.type === "AUTOFILL_ALL_FRAMES") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab to autofill." });
      return false;
    }
    autofillAllFrames(tabId, message).then(sendResponse);
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" } satisfies ExtensionMessage);
  } catch {
    // No content-panel script on this tab.
  }
});

/** After reload/install, existing PrepFor.Me tabs don't get a fresh content
 * script until navigation — pull their session immediately. */
async function bootstrapSession(): Promise<void> {
  await pullSessionFromAppTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapSession();
});
chrome.runtime.onStartup.addListener(() => {
  void bootstrapSession();
});
void bootstrapSession();
