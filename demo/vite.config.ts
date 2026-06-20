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
  },
  server: {
    // The library source lives outside the demo root (`../src`); allow the dev
    // server to read it so `pnpm dev` can serve the aliased modules.
    fs: { allow: [fromHere("..")] },
  },
});
