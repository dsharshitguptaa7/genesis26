/* =========================================================
   GENESIS'26 — FIREBASE CONFIGURATION MODULE
   Centralized Firebase v10 Modular CDN Configuration
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    runTransaction,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

/**
 * Genesis'26 Firebase Web App Configuration
 * Project ID: genesis26-d7cb2
 */
export const firebaseConfig = {
    apiKey: "AIzaSyDfFFivrAwlRNrqm190t6Pqxjb-Y9OUqUM",
    authDomain: "genesis26-d7cb2.firebaseapp.com",
    projectId: "genesis26-d7cb2",
    storageBucket: "genesis26-d7cb2.firebasestorage.app",
    messagingSenderId: "761499413770",
    appId: "1:761499413770:web:add5e1614224feaab7def3",
    measurementId: "G-11B1WHWSLK"
};

// Initialize Firebase Application
let app = null;
let db = null;
let auth = null;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (err) {
    console.error("Genesis'26 Firebase Initialization Error:", err);
}

export {
    app,
    db,
    auth,
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    runTransaction,
    serverTimestamp,
    setDoc,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};
