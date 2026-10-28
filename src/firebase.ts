import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBaxTP7S5bqALxwYGNDPiXEkyN4xIbVZb0",
  authDomain: "movie-match-adade.firebaseapp.com",
  projectId: "movie-match-adade",
  storageBucket: "movie-match-adade.firebasestorage.app",
  messagingSenderId: "59462288915",
  appId: "1:59462288915:web:e5ac3f95100ea44b19e1e6",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);