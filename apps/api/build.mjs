import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  plugins: [
    {
      // Bundle workspace packages (they ship TypeScript source); keep npm deps external.
      name: "externalize-deps",
      setup(b) {
        // Resolve workspace packages with Node's resolver so a stray Yarn PnP manifest
        // in a parent directory can't hijack resolution.
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith("@encore/")
            ? { path: fileURLToPath(import.meta.resolve(args.path)) }
            : { external: true },
        );
      },
    },
  ],
});
