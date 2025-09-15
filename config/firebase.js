// config/firebase.js - Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// Firebase 프로젝트 설정
export const firebaseConfig = {
  apiKey: "AIzaSyBFPzN4XWkrlu8sHdw4BB1tpwP-D-TIN2M",
  authDomain: "sensory-and-brain.firebaseapp.com",
  projectId: "sensory-and-brain",
  storageBucket: "sensory-and-brain.firebasestorage.app",
  messagingSenderId: "189156957187",
  appId: "1:189156957187:web:cda271cc5ec6aac9964236",
  measurementId: "G-L1JTKSTKC3"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스 exports
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("Firebase 초기화 완료");