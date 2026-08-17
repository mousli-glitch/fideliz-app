import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/*
 * `tests/` appartient à Playwright, qui a son propre lanceur. Sans cette
 * exclusion, Vitest ramasse le spec d'exemple de Playwright et échoue sur
 * un `test()` appelé hors de son contexte — un échec qui n'a rien à voir
 * avec le code testé, et qui ferait douter du reste.
 */
export default defineConfig({
  /* Le même alias que tsconfig.json — sans lui, les modules testés ne
     résolvent pas leurs propres imports. */
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "utils/**/*.test.ts", "supabase/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/**", ".next/**"],
  },
});
