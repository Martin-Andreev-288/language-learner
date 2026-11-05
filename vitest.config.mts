import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Vitest runs the test files; Next never sees this config, and this config
// never sees next.config.ts. They are deliberately separate — the note in
// tests.md about keeping them apart still holds, and matters more here
// because next.config.ts is TypeScript rather than .mjs.
export default defineConfig({
    // Compiles JSX, so .tsx components can be rendered in a test.
    plugins: [react()],

    resolve: {
        alias: {
            // Mirrors the "@/*" path in tsconfig.json. Without this, every
            // `import ... from "@/lib/..."` fails to resolve under Vitest
            // even though it compiles fine under Next, because the alias is
            // a bundler convention rather than anything Node understands.
            "@": fileURLToPath(new URL(".", import.meta.url)),
        },
    },

    test: {
        // Plain Node by default, because booting jsdom costs a few seconds
        // per test file and most of what is worth testing here is pure
        // functions that never touch a DOM. A file that does need one opts
        // in with a `@vitest-environment jsdom` docblock on its first line —
        // see components/shared/character-count.test.tsx.
        environment: "node",

        // Runs before every suite — see vitest.setup.ts.
        setupFiles: ["./vitest.setup.ts"],

        // Now and then a run is far slower, for reasons outside the code: tests
        // took up to ten times longer, which put one past the default 5 s and
        // another at 4.6 s. The limit is only there to stop a test that hangs,
        // so it can be generous.
        testTimeout: 20_000,

        // `globals` is deliberately left off (its default is false), so each
        // test file imports describe/it/expect from "vitest" explicitly.
        //
        // Turning it on would mean adding "types": ["vitest/globals"] to
        // tsconfig.json, and that field is not additive — setting it stops
        // TypeScript auto-including every other @types package, @types/node
        // among them. The Next build reads the same tsconfig, so the cost of
        // saving one import line per file is a build that can break for a
        // reason with no visible connection to tests.

        include: ["**/*.test.{ts,tsx}"],

        // node_modules and dist are excluded by default; .next is not, and
        // it holds compiled copies of the app that would otherwise be
        // collected and run as if they were source.
        exclude: ["**/node_modules/**", "**/.next/**"],
    },
});
