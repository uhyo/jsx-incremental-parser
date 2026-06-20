import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// Resolve `jsx-incremental-parser` (and its subpaths) straight to the library
// source, so the demo always reflects the code in `../src` with no build step.
// We don't depend on `@vitejs/plugin-react`; Vite's built-in esbuild transform
// handles `.tsx` using the `jsx: "react-jsx"` setting from `tsconfig.json`.
const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: fromHere("."),
  resolve: {
    alias: {
      "jsx-incremental-parser/react": fromHere("../src/react.ts"),
      "jsx-incremental-parser/core": fromHere("../src/core.ts"),
      "jsx-incremental-parser": fromHere("../src/index.ts"),
    },
    // The aliased library source (`../src`) imports `react`/`react-dom` too.
    // Without deduping, the production build resolves those to a separate copy
    // (e.g. the repo-root install) from the demo's own, so the page ships two
    // React instances and hooks crash with "Cannot read properties of null
    // (reading 'useMemo')". Force a single copy from the demo's deps.
    dedupe: ["react", "react-dom"],
  },
  server: {
    // The library source lives outside the demo root (`../src`); allow the dev
    // server to read it so `pnpm dev` can serve the aliased modules.
    fs: { allow: [fromHere("..")] },
  },
});
