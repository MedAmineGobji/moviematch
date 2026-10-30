import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Favori } from './favoris';
import type { Profil } from './AuthContext';

// Un film ajouté par l'admin : même forme qu'un favori, avec un synopsis et une date
export type FilmMaison = Favori & { synopsis: string; creeLe: number };

// Un membre avec son identifiant Firebase
export type Utilisateur = Profil & { uid: string };

// Écouter les films de l'admin, du plus récent au plus ancien
export function ecouterFilmsMaison(rappel: (films: FilmMaison[]) => void) {
  return onSnapshot(
    query(collection(db, 'films'), orderBy('creeLe', 'desc')),
    (snap) => rappel(snap.docs.map((d) => d.data() as FilmMaison)),
    (err) => {
      console.error(err);
      rappel([]);
    },
  );
}

// Ajouter un film : id négatif pour ne jamais entrer en conflit avec un id TMDB
export async function ajouterFilmMaison(film: Omit<FilmMaison, 'id' | 'creeLe'>) {
  const maintenant = Date.now();
  const id = -maintenant;
  await setDoc(doc(db, 'films', String(id)), { ...film, id, creeLe: maintenant });
  return id;
}

// Supprimer un film de l'admin
export async function supprimerFilmMaison(id: number) {
  await deleteDoc(doc(db, 'films', String(id)));
}

// Écouter la liste des membres (surErreur est facultatif : prévenu si la lecture échoue)
export function ecouterUtilisateurs(
  rappel: (utilisateurs: Utilisateur[]) => void,
  surErreur?: (err: Error) => void,
) {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => rappel(snap.docs.map((d) => ({ ...(d.data() as Profil), uid: d.id }))),
    (err) => {
      console.error(err);
      rappel([]);
      surErreur?.(err);
    },
  );
}

// Activer ou désactiver un compte (on ne supprime jamais un utilisateur)
export async function changerActif(uid: string, actif: boolean) {
  await updateDoc(doc(db, 'users', uid), { actif });
}
