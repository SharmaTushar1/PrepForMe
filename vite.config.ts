import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";

/**
 * Local `/api/render-resume-pdf` so `npm run dev` can download PDFs without
 * `vercel dev`. Production uses the Vercel serverless route in `api/`.
 */
function localResumePdfApi(): Plugin {
  return {
    name: "local-resume-pdf-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/render-resume-pdf")) return next();
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Use POST." }));
          return;
        }

        try {
          const body = await readJson(req);
          const auth = req.headers.authorization;
          if (!auth?.startsWith("Bearer ")) {
            res.statusCode = 401;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "Sign in to render a resume PDF." }));
            return;
          }

          const { renderTemplateToHtml } = await import(
            "./src/lib/resume/templates/render"
          );
          const { isResumeTemplateId } = await import(
            "./src/lib/resume/templates/fields"
          );

          if (!isResumeTemplateId(body.templateId) || !body.fields) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                error: "templateId and fields are required.",
              }),
            );
            return;
          }

          const html = renderTemplateToHtml(body.fields, body.templateId);
          const browser = await launchLocalChromium();
          try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "load" });
            const pdf = await page.pdf({
              format: "A4",
              printBackground: true,
              margin: {
                top: "0.45in",
                right: "0.5in",
                bottom: "0.45in",
                left: "0.5in",
              },
            });
            res.statusCode = 200;
            res.setHeader("content-type", "application/pdf");
            res.end(Buffer.from(pdf));
          } finally {
            await browser.close();
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "PDF render failed.";
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

/**
 * Puppeteer's own Chrome download is the happy path, but it is skipped often
 * enough — CI caches, sandboxed installs, `PUPPETEER_SKIP_DOWNLOAD` — that a
 * dev server refusing to render is worth avoiding. Falls back to a Chrome the
 * machine already has before giving up with an actionable message.
 */
async function launchLocalChromium() {
  const puppeteer = await import("puppeteer");
  const attempts: Parameters<typeof puppeteer.default.launch>[0][] = [
    { headless: true },
    { headless: true, channel: "chrome" },
  ];
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (explicit) attempts.unshift({ headless: true, executablePath: explicit });

  let last: unknown;
  for (const options of attempts) {
    try {
      return await puppeteer.default.launch(options);
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    `No Chromium available for the local PDF route. Run "npx puppeteer browsers install chrome" or set PUPPETEER_EXECUTABLE_PATH. (${
      last instanceof Error ? last.message : String(last)
    })`,
  );
}

function readJson(req: IncomingMessage): Promise<{
  templateId?: unknown;
  fields?: import("./src/types").ResumeFields;
}> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export default defineConfig({
  plugins: [react(), localResumePdfApi()],
  server: {
    port: 5173,
    host: true,
  },
});
