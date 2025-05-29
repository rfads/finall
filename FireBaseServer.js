// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from 'firebase/app';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBSAhoY53rcKOU5si-f9nIOhzeN5O9KJ7s",
  authDomain: "finalproject-ccaa1.firebaseapp.com",
  projectId: "finalproject-ccaa1",
  storageBucket: "finalproject-ccaa1.firebasestorage.app",
  messagingSenderId: "499799186389",
  appId: "1:499799186389:web:d0dc71face00cb979efb5c",
  measurementId: "G-LNK79TYWYR"
};

let app;
try {
  app = getApp();
} catch {
  app = initializeApp(firebaseConfig);
}

// Initialize Auth with React Native persistence
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Firestore
const firestore = getFirestore(app);

export { auth, firestore, app };