import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Favori {
  id: number;
  titre: string;
  affiche: string | null;
  annee: string;
  genres: string[];
  acteurs: string[];
  note: number;
}

// Ajouter un film à la liste des favoris
export async function ajouterFavori(uid: string, favorisActuels: Favori[], film: Favori) {
  await updateDoc(doc(db, 'users', uid), {
    favoris: [...favorisActuels, film],
  });
}

// Retirer un film de la liste des favoris
export async function retirerFavori(uid: string, favorisActuels: Favori[], idFilm: number) {
  await updateDoc(doc(db, 'users', uid), {
    favoris: favorisActuels.filter((f) => f.id !== idFilm),
  });
}