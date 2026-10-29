import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Favori } from './favoris';

export interface Profil {
  nom: string;
  prenom: string;
  age: number;
  photo: string;
  email: string;
  role: 'user' | 'admin';
  actif: boolean;
  favoris: Favori[];
}

interface AuthCtx {
  user: User | null;
  profil: Profil | null;
  loading: boolean;
  messageDeconnexion: string;
}

const AuthContext = createContext<AuthCtx>({ user: null, profil: null, loading: true, messageDeconnexion: '' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageDeconnexion, setMessageDeconnexion] = useState('');

  useEffect(() => {
    let stopProfil: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      stopProfil?.();
      stopProfil = undefined;
      if (u) {
        // On attend le profil avant d'ouvrir l'app
        setLoading(true);
        // On écoute le profil de l'utilisateur dans Firestore
        stopProfil = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            const data = snap.exists() ? (snap.data() as Profil) : null;
            // Si l'admin a désactivé le compte, on déconnecte
            if (data && data.actif === false) {
              setMessageDeconnexion("Ton compte a été désactivé par l'administrateur.");
              signOut(auth);
              return;
            }
            if (data) setMessageDeconnexion('');
            setProfil(data);
            setLoading(false);
          },
          (err) => {
            // Lecture refusée (règles, réseau...) : on sort du chargement
            console.error(err);
            setProfil(null);
            setLoading(false);
          },
        );
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
    <AuthContext.Provider value={{ user, profil, loading, messageDeconnexion }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
