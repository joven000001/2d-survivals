import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from 'firebase/auth';

const firebaseAuthConfig = {
  apiKey: 'AIzaSyAqQ0bUWJ1ifhaiNBnw8Y5-au8e37r9UOc',
  authDomain: 'scientific-responder-1q6d2.firebaseapp.com',
  projectId: 'scientific-responder-1q6d2',
  storageBucket: 'scientific-responder-1q6d2.firebasestorage.app',
  messagingSenderId: '716257731642',
  appId: '1:716257731642:web:4032b3b82be0ab03618103',
};

const firebaseApp = getApps().find((item) => item.name === 'survival-auth')
  || initializeApp(firebaseAuthConfig, 'survival-auth');

export const survivalAuth = getAuth(firebaseApp);
export const survivalGoogleProvider = new GoogleAuthProvider();

export async function signInWithSurvivalGoogle(): Promise<User> {
  const result = await signInWithPopup(survivalAuth, survivalGoogleProvider);
  return result.user;
}

export async function signInWithSurvivalEmail(email: string, password: string): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(survivalAuth, email, password);
    return result.user;
  } catch (error) {
    if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error;
    const result = await createUserWithEmailAndPassword(survivalAuth, email, password);
    return result.user;
  }
}
