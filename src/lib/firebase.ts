import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyC1SRjKRdVhx_ldX9qY3EC4TOW8pGkjvgo",
  authDomain: "booked-jobs-app.firebaseapp.com",
  projectId: "booked-jobs-app",
  storageBucket: "booked-jobs-app.firebasestorage.app",
  messagingSenderId: "773781432308",
  appId: "1:773781432308:web:4ccfe7f272835760823ba1",
  measurementId: "G-K9F9PZXX3R",
};

let _app: ReturnType<typeof initializeApp> | null = null;
let _analytics: ReturnType<typeof getAnalytics> | null = null;

try {
  _app = initializeApp(firebaseConfig);
} catch (err) {
  console.warn("Firebase initializeApp failed:", err);
}

try {
  if (_app) _analytics = getAnalytics(_app);
} catch (err) {
  console.warn("Firebase getAnalytics failed:", err);
}

export const app = _app as ReturnType<typeof initializeApp>;
export const analytics = _analytics as ReturnType<typeof getAnalytics>;

// VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = "BPm23DsuB3fW2QHE69XzfQ7q4vKZ79oa8RxoURY-EAk5QbFZt-TyuyajpagU9Z4y1Pyybjv6rj15QbDiimKSS-o";

/**
 * Request notification permission and get FCM token.
 * Returns null if not supported or permission denied.
 */
export const getFcmToken = async (): Promise<string | null> => {
  try {
    const supported = await isSupported();
    if (!supported) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token || null;
  } catch (err) {
    console.warn("FCM token error:", err);
    return null;
  }
};
