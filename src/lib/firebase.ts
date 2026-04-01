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

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);

// VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = "BKagOny0KF_2pCJQ3m….rlkA";  // Replace with your actual VAPID key

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
