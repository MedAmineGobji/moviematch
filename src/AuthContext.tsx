import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface Profil {
  nom: string;
  prenom: string;
  age: number;
  photo: string;
  email: string;
  role: 'user' | 'admin';
  actif: boolean;
  favoris: any[];
}

interface AuthCtx {
  user: User | null;
  profil: Profil | null;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({ user: null, profil: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopProfil: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      stopProfil?.();
      if (u) {
        // On écoute le profil de l'utilisateur dans Firestore
        stopProfil = onSnapshot(doc(db, 'users', u.uid), (snap) => {
          const data = snap.exists() ? (snap.data() as Profil) : null;
          // Si l'admin a désactivé le compte, on déconnecte
          if (data && data.actif === false) {
            signOut(auth);
            return;
          }
          setProfil(data);
          setLoading(false);
        });
      } else {
        setProfil(null);
        setLoading(false);
      }
    });

    return () => {
      stopAuth();
      stopProfil?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profil, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);