// Serves the production build in dist/ with vite preview, without building it again: at the site
// root and under a sub-path the build knows nothing about. Both must work, which proves that the
// build does not depend on where it is deployed.
//
// Usage: node e2e/preview.mjs <port>:<base> [<port>:<base> ...]
import { preview } from "vite";

const targets = process.argv.slice(2).map((arg) => {
  const index = arg.indexOf(":");
  return { port: Number(arg.slice(0, index)), base: arg.slice(index + 1) };
});
if (targets.length === 0 || targets.some((t) => !Number.isInteger(t.port) || !t.base)) {
  throw new Error("Usage: node e2e/preview.mjs <port>:<base> [<port>:<base> ...]");
}

// One after the other: the caller waits for the last one, so all are listening by then.
for (const { port, base } of targets) {
  const server = await preview({ base, preview: { port, strictPort: true, open: false } });
  server.printUrls();
}
