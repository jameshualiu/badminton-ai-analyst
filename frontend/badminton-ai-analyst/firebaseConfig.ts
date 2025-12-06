import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBw3w36q7BZ_GEDREGg1oBwuv2PftmRII0",
  authDomain: "badminton-ai-analyst.firebaseapp.com",
  projectId: "badminton-ai-analyst",
  storageBucket: "badminton-ai-analyst.firebasestorage.app",
  messagingSenderId: "546570849394",
  appId: "1:546570849394:web:5e548b23d0bd9288d4c6eb"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
