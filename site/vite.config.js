import { defineConfig } from "vite";
import { existsSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [
    {
      name: "scheduled-radio-editions",
      closeBundle() {
        // Daily workflow outputs live beside index.html, outside Vite's public/.
        for (const name of ["audio", "data.json"]) {
          if (existsSync(root + name))
            cpSync(root + name, root + "dist/" + name, { recursive: true });
        }
      },
    },
  ],
});
