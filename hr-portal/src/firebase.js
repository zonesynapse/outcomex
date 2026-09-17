// Firebase Configuration for HR Portal
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAXQFtD2qrXsvgJPaR8UPjQuUaNkElwI04",
  authDomain: "ck-group-of-education.firebaseapp.com",
  projectId: "ck-group-of-education",
  storageBucket: "ck-group-of-education.firebasestorage.app",
  messagingSenderId: "224409622020",
  appId: "1:224409622020:web:41727f131c6461f80b4751",
  measurementId: "G-JSM3BD3JNR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
