<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- All chapters, pages, images and uploaded fonts are stored in the browser's IndexedDB (`src/lib/db.ts`); there is no backend database — the user chose browser-only storage.
- Page AI analysis (bubble detection + Arabic translation) runs only in `src/lib/ai/translate-page.server.ts` behind the `translatePageFn` server function, calling Google's native Gemini `generateContent` endpoint with the user's `GEMINI_API_KEY` in `x-goog-api-key` (no key-format checks; the OpenAI-compatible endpoint rejects the user's key type); it walks the `MODELS` list and falls through on 404/5xx/timeout because older models are closed to new keys and newer ones get overloaded; the client sends a downscaled JPEG and never sees the key.
- Box geometry is stored as 0–1 fractions of the page and font size in source-image pixels, so the editor and exports scale identically.
- The editor preview and exported images share `layoutBox`/`wrapLines` in `src/lib/text-layout.ts`; change text layout only there so on-screen and downloaded pages never drift apart.
- Pages are processed sequentially by `src/lib/pipeline.ts` so each page can use previous lines for consistent names/tone; 429/402/403/401 stop the whole queue (429 shows the daily-limit message from `src/lib/ai/gemini-errors.ts`).
