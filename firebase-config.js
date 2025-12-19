// Firebase Configuration for NANA ACADEMY
// Replace the values below with YOUR ACTUAL Firebase configuration

// Your Firebase configuration from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyB69vGJGWzKWFYnIwB0PZEziY6d7KcDY0w",
  authDomain: "nana-academy-7e3e1.firebaseapp.com",
  projectId: "nana-academy-7e3e1",
  storageBucket: "nana-academy-7e3e1.firebasestorage.app",
  messagingSenderId: "662983370850",
  appId: "1:662983370850:web:864ce5f599de482e6f493b"
};
// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Firebase Authentication
const auth = firebase.auth();

// Initialize Firebase Firestore Database
const db = firebase.firestore();

// Initialize Firebase Storage
const storage = firebase.storage();

// Export Firebase services for use in other files
window.firebase = firebase;
window.auth = auth;
window.db = db;
window.storage = storage;

console.log("Firebase initialized successfully!");