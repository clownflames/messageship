import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(): Promise<Response> {
  const source = await readFile(join(process.cwd(), "sdk", "Whatsapp.ts"), "utf8");
  return new Response(source, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": "attachment; filename=Whatsapp.ts", "Cache-Control": "no-store" } });
}
