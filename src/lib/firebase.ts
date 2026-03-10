import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

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
