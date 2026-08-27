import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },

  plugins: [
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),

    VitePWA({
      registerType: "prompt",
      filename: "sw.js",
      strategies: "generateSW",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },

      workbox: {
        cacheId: "bookedjobs-v1",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,

        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        navigateFallback: "/index.html",

        navigateFallbackAllowlist: [
          /^\/(?!rest|functions|~oauth|storage|realtime|sw\.js|firebase-messaging-sw\.js|assets|icons|manifest\.json|offline\.html|robots\.txt|placeholder\.svg).*/,
        ],

        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/~oauth/,
          /^\/storage/,
          /^\/realtime/,
          /^\/$/,
          /^\/auth/,
          /^\/engineer/,
          /^\/dashboard/,
          /^\/admin/,
          /^\/jobs/,
          /^\/customers/,
          /^\/certificates/,
          /^\/reset-password/,
          /^\/reset-admin/,
          /^\/quote/,
          /^\/pdf/,
          /^\/b/,
        ],

        runtimeCaching: [
          {
            urlPattern: ({ request, url }: { request: Request; url: URL }) => {
              if (request.mode !== "navigate") return false;

              const denied = [
                /^\/rest/,
                /^\/functions/,
                /^\/~oauth/,
                /^\/storage/,
                /^\/realtime/,
                /^\/$/,
                /^\/auth/,
                /^\/engineer/,
                /^\/dashboard/,
                /^\/admin/,
                /^\/jobs/,
                /^\/customers/,
                /^\/certificates/,
                /^\/reset-password/,
                /^\/reset-admin/,
                /^\/quote/,
                /^\/pdf/,
                /^\/b/,
              ];

              return !denied.some((re) => re.test(url.pathname));
            },

            handler: "NetworkFirst",

            options: {
              cacheName: "html",
              networkTimeoutSeconds: 15,
            },
          },
        ],
      },
    }),
  ].filter(Boolean),

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          spreadsheet: ["xlsx-js-style"],
          firebase: [
            "firebase/app",
            "firebase/analytics",
            "firebase/messaging",
          ],
        },
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));