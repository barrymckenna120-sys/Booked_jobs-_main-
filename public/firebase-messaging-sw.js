// Scope: /firebase-cloud-messaging-push-scope — isolated from Workbox app-shell SW at /
/* eslint-disable no-undef */
// SW cache version: v2026-04-29-1 — bump to force clients to fetch latest build
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC1SRjKRdVhx_ldX9qY3EC4TOW8pGkjvgo",
  authDomain: "booked-jobs-app.firebaseapp.com",
  projectId: "booked-jobs-app",
  storageBucket: "booked-jobs-app.firebasestorage.app",
  messagingSenderId: "773781432308",
  appId: "1:773781432308:web:4ccfe7f272835760823ba1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Firebase already displays payloads that carry `notification`; showing it
  // here too would duplicate it. Only render data-only messages ourselves.
  if (payload.notification) return;
  const data = payload.data || {};
  if (data.title) {
    self.registration.showNotification(data.title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: payload.data,
    });
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const raw =
    d.link ||
    (d.FCM_MSG && d.FCM_MSG.notification && d.FCM_MSG.notification.click_action) ||
    (d.FCM_MSG && d.FCM_MSG.data && d.FCM_MSG.data.link) ||
    (d.FCM_MSG && d.FCM_MSG.fcmOptions && d.FCM_MSG.fcmOptions.link) ||
    "/engineer/chat";
  let target;
  try {
    target = new URL(raw, self.location.origin);
    if (target.origin !== self.location.origin) target = new URL("/engineer/chat", self.location.origin);
  } catch (_e) {
    target = new URL("/engineer/chat", self.location.origin);
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) {
            try { await w.navigate(target.href); return; } catch (_e) { /* fall through */ }
          }
          w.postMessage({ type: "navigate", url: target.pathname + target.search });
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
