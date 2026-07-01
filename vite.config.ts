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
      registerType: "autoUpdate",
      filename: "sw.js",
      strategies: "generateSW",
      injectRegister: null,
      devOptions: { enabled: false },
      workbox: {
        cacheId: "bookedjobs-v1",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [
          /^\/rest/,
          /^\/functions/,
          /^\/\~oauth/,
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
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => {
              if (request.mode !== "navigate") return false;
              if (url.origin !== self.location.origin) return false;
              if (/^\/(reset-password|reset-admin|auth|~oauth)/.test(url.pathname)) return false;
              return true;
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/service_calls/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-service-calls",
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/ktkfuquqxbrmuqrmbmdj\.supabase\.co\/rest\/v1\/engineers/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-engineers",
              expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
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
