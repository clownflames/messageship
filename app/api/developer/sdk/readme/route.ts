import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(): Promise<Response> {
  const source = await readFile(join(process.cwd(), "sdk", "README.md"), "utf8");
  return new Response(source, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=README.md", "Cache-Control": "no-store" } });
}
