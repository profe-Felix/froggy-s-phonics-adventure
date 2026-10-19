import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { bootstrapDashboardPreview } from "../../shared/notebookDashboardPreview.mjs";

declare const Deno: { env: { get(name: string): string | undefined } };
const NOTEBOOK_ORIGIN = "https://live-classroom-annotation-notebook.replit.app";
const ORIGINS = ["https://edu-aventura.base44.app", "https://preview--edu-aventura.base44.app"];
export default async function(req: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (req.method !== "POST") return reply("POST required.", 405);
  const origin = req.headers.get("Origin") || ORIGINS[0];
  if (!ORIGINS.includes(origin)) return reply("This origin is not enabled.", 403);
  if (Deno.env.get("NOTEBOOK_NATIVE_ENABLED") !== "true") return reply("Notebook monitoring is not activated.", 503);
  let body;
  try { body = await req.json(); } catch { return reply("Invalid notebook request.", 400); }
  try {
    const config = JSON.parse(Deno.env.get("NOTEBOOK_BRIDGE_CONFIG") || "null");
    const credential = Deno.env.get("NOTEBOOK_BRIDGE_KEY");
    if (!config || !credential) return reply("Notebook monitoring is not configured.", 503);
    return await bootstrapDashboardPreview({
      client: createClientFromRequest(req), body, config, credential,
      notebookOrigin: NOTEBOOK_ORIGIN, browserOrigin: origin, headers,
    });
  } catch (error) {
    const preparing = (error as { code?: string })?.code === "notebook_images_preparing";
    return Response.json({ error: preparing
      ? "This notebook's image pages are still preparing. Retry shortly; existing work was not changed."
      : "The view-only notebook connection is unavailable. No student work was changed.",
      ...(preparing ? { code: "notebook_images_preparing" } : {}) }, { status: 503, headers });
  }
}
