import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(
    "Usage: pnpm import:inspect <file.csv> [--bank=mbank|ing|pko_bp|millennium|erste] [--limit=20]"
  );
  process.exit(args.includes("--help") ? 0 : 1);
}
let server;
try {
  const [file, ...flags] = args;
  if (flags.some((flag) => !/^--(?:bank|limit)=.+$/.test(flag))) throw new Error("Unknown option");
  const bank = flags.find((flag) => flag.startsWith("--bank="))?.slice(7);
  const limit = Number(flags.find((flag) => flag.startsWith("--limit="))?.slice(8) ?? 20);
  const buffer = await readFile(file);
  // Use the installed TS loader without the application config, env loading,
  // Paraglide generation, a listening HTTP server or a Supabase client.
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    envDir: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null },
    appType: "custom",
  });
  const { inspectBankCsv } = await server.ssrLoadModule("/src/lib/import/inspect.ts");
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  console.log(JSON.stringify(await inspectBankCsv(bytes, bank, limit), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
