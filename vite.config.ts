import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      filename: "sw.js",
      strategies: "generateSW",
      injectRegister: null,
      devOptions: { enabled: false },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/\~oauth/,
          /^\/auth/,
          /^\/reset-password/,
          /^\/pdf/,
          /^\/receipt/,
          /^\/invoice/,
          /^\/certificates/,
          /^\/certificate/,
          /^\/cert/,
          /^\/quote/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => {
              if (request.mode !== "navigate") return false;
              const denied = [
                /^\/rest/, /^\/functions/, /^\/\~oauth/, /^\/\$/,
                /^\/auth/, /^\/engineer/, /^\/dashboard/, /^\/admin/,
                /^\/jobs/, /^\/customers/, /^\/certificates/,
                /^\/quote/, /^\/reset-password/, /^\/pdf/, /^\/b/,
                /^\/receipt/, /^\/r/, /^\/invoice/,
              ];
              return !denied.some((re) => re.test(url.pathname));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest/,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
