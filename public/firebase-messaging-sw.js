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
  const { title, body } = payload.notification || {};
  if (title) {
    self.registration.showNotification(title, {
      body: body || "",
      icon: "/icons/icon-192.png",
    });
  }
});
