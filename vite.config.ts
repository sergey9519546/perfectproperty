import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

process.chdir(resolve(process.cwd()));

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    build: {
      // MapLibre is intentionally isolated and cached across route changes.
      // Its minified SDK is ~1 MB (273 kB gzip), so use a threshold that
      // reflects transferred size while keeping every other client chunk small.
      chunkSizeWarningLimit: 1_100,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "react-vendor",
                test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: "tanstack-vendor",
                test: /node_modules[\\/]@tanstack[\\/]/,
                priority: 25,
              },
              {
                name: "supabase-vendor",
                test: /node_modules[\\/](?:@supabase|supabase)[\\/]/,
                priority: 25,
              },
              {
                name: "map-vendor",
                test: /node_modules[\\/]maplibre-gl[\\/]/,
                priority: 25,
              },
              {
                name: "ui-vendor",
                test: /node_modules[\\/](?:@radix-ui|@floating-ui|cmdk|vaul)[\\/]/,
                priority: 20,
              },
              {
                name: "lovable-vendor",
                test: /node_modules[\\/]@lovable\.dev[\\/]/,
                priority: 20,
              },
              {
                name: "charts-vendor",
                test: /node_modules[\\/](?:recharts|d3-|victory-vendor)[\\/]/,
                priority: 15,
              },
              {
                name: "vendor",
                test: /node_modules[\\/]/,
                minSize: 20_000,
                maxSize: 350_000,
                entriesAware: true,
                priority: 1,
              },
            ],
          },
        },
      },
    },
  },
});
