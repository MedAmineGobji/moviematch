// ===== Algorithme de matching entre deux membres =====
//
// Idée : deux membres "matchent" s'ils aiment les mêmes films, les mêmes genres,
// les mêmes acteurs et les films de la même époque. On calcule une similarité
// entre 0 (rien en commun) et 1 (goûts identiques) pour chacun de ces 4 critères,
// puis une moyenne pondérée qui donne le score final.
//
// Ce fichier ne contient que des fonctions pures (ni React ni Firebase) :
// elles reçoivent des données et renvoient un résultat, ce qui les rend faciles à tester.

import type { Favori } from './favoris';
import type { Utilisateur } from './catalogue';

// Importance de chaque critère dans le score final (la somme fait 1)
export const POIDS = {
  films: 0.3,
  genres: 0.3,
  acteurs: 0.25,
  epoque: 0.15,
} as const;

// Au-dessus de ce score (75 %), deux membres forment un "match"
export const SEUIL_MATCH = 0.75;

// Nombre minimum de favoris pour que le calcul ait du sens
export const MIN_FAVORIS = 3;

// Nombre maximum de genres / acteurs en commun renvoyés
const MAX_COMMUNS = 5;

export interface ResultatMatching {
  score: number; // score final, entre 0 et 1
  films: number; // similarité des films (Jaccard)
  genres: number; // similarité des genres (cosinus)
  acteurs: number; // similarité des acteurs (cosinus)
  epoque: number; // similarité des décennies (cosinus)
  filmsCommuns: Favori[];
  genresCommuns: string[];
  acteursCommuns: string[];
}

export interface Match extends ResultatMatching {
  utilisateur: Utilisateur;
}

// ----- Indice de Jaccard -----
// Mesure le recouvrement de deux ensembles :
//   jaccard = (éléments communs) / (éléments présents dans au moins un des deux)
// Exemple : {1, 2, 3} et {2, 3, 4} → communs {2, 3} = 2, union {1, 2, 3, 4} = 4 → 2 / 4 = 0,5.
// Les doublons sont ignorés (ce sont des ensembles).
export function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const ensembleA = new Set(a);
  const ensembleB = new Set(b);
  let communs = 0;
  ensembleA.forEach((x) => {
    if (ensembleB.has(x)) communs++;
  });
  const union = ensembleA.size + ensembleB.size - communs;
  return union === 0 ? 0 : communs / union;
}

// ----- Tableau de fréquences -----
// Compte combien de fois chaque valeur apparaît.
// Exemple : ["Action", "Drame", "Action"] → { Action: 2, Drame: 1 }.
// Les valeurs vides sont ignorées.
export function frequences(valeurs: string[]): Record<string, number> {
  const compte: Record<string, number> = {};
  valeurs.forEach((v) => {
    if (!v) return;
    compte[v] = (compte[v] ?? 0) + 1;
  });
  return compte;
}

// ----- Similarité cosinus -----
// On voit chaque tableau de fréquences comme un vecteur (une "flèche" dont chaque
// direction est un genre, un acteur...). Le cosinus de l'angle entre les deux flèches
// vaut 1 si elles pointent dans la même direction (mêmes proportions), et 0 si elles
// n'ont aucune valeur en commun.
//   cosinus = (A · B) / (‖A‖ × ‖B‖)
//   A · B = somme des produits A[x] × B[x] pour chaque valeur x
//   ‖A‖   = racine carrée de la somme des A[x]²
// Avantage : on compare des proportions, donc une petite liste et une grande liste
// avec les mêmes goûts obtiennent un score élevé.
export function cosinus(freqA: Record<string, number>, freqB: Record<string, number>): number {
  let produit = 0;
  Object.entries(freqA).forEach(([cle, valeur]) => {
    produit += valeur * (freqB[cle] ?? 0);
  });
  const normeA = Math.sqrt(Object.values(freqA).reduce((somme, v) => somme + v * v, 0));
  const normeB = Math.sqrt(Object.values(freqB).reduce((somme, v) => somme + v * v, 0));
  if (normeA === 0 || normeB === 0) return 0;
  // Math.min évite un résultat comme 1.0000000000000002 à cause des arrondis
  return Math.min(1, produit / (normeA * normeB));
}

// ----- Décennie d'une année -----
// "1994" → "1990s". Renvoie null si l'année est vide ou invalide.
export function decennie(annee: string | undefined | null): string | null {
  const texte = (annee ?? '').trim();
  if (!/^[1-9]\d{3}$/.test(texte)) return null;
  return Math.floor(Number(texte) / 10) * 10 + 's';
}

// Les valeurs présentes dans les deux tableaux de fréquences, de la plus fréquente
// (en additionnant les deux membres) à la moins fréquente, 5 au maximum
function communsTries(freqA: Record<string, number>, freqB: Record<string, number>): string[] {
  return Object.keys(freqA)
    .filter((cle) => freqB[cle] !== undefined)
    .sort((x, y) => freqA[y] + freqB[y] - (freqA[x] + freqB[x]) || x.localeCompare(y, 'fr'))
    .slice(0, MAX_COMMUNS);
}

// ----- Matching entre deux listes de favoris -----
export function calculerMatching(favorisA: Favori[], favorisB: Favori[]): ResultatMatching {
  // 1. Films : quels films ont-ils tous les deux ajoutés ?
  const films = jaccard(favorisA.map((f) => f.id), favorisB.map((f) => f.id));

  // 2. Genres : dans quelles proportions aiment-ils chaque genre ?
  const genresA = frequences(favorisA.flatMap((f) => f.genres ?? []));
  const genresB = frequences(favorisB.flatMap((f) => f.genres ?? []));
  const genres = cosinus(genresA, genresB);

  // 3. Acteurs : même calcul avec les acteurs principaux
  const acteursA = frequences(favorisA.flatMap((f) => f.acteurs ?? []));
  const acteursB = frequences(favorisB.flatMap((f) => f.acteurs ?? []));
  const acteurs = cosinus(acteursA, acteursB);

  // 4. Époque : même calcul avec la décennie de sortie de chaque film
  const decenniesA = frequences(favorisA.map((f) => decennie(f.annee) ?? ''));
  const decenniesB = frequences(favorisB.map((f) => decennie(f.annee) ?? ''));
  const epoque = cosinus(decenniesA, decenniesB);

  // Score final : moyenne pondérée des 4 critères
  const score =
    POIDS.films * films + POIDS.genres * genres + POIDS.acteurs * acteurs + POIDS.epoque * epoque;

  // Détails à afficher : les films, genres et acteurs en commun
  const idsB = new Set(favorisB.map((f) => f.id));
  const dejaVus = new Set<number>();
  const filmsCommuns = favorisA.filter((f) => {
    if (!idsB.has(f.id) || dejaVus.has(f.id)) return false;
    dejaVus.add(f.id);
    return true;
  });

  return {
    score,
    films,
    genres,
    acteurs,
    epoque,
    filmsCommuns,
    genresCommuns: communsTries(genresA, genresB),
    acteursCommuns: communsTries(acteursA, acteursB),
  };
}

// ----- Classement des autres membres -----
// Ignore : moi-même, les comptes désactivés, et ceux qui ont moins de MIN_FAVORIS favoris.
// Renvoie les membres restants avec leur matching, du meilleur score au moins bon.
export function trouverMatchs(
  moi: { uid: string; favoris: Favori[] },
  autres: Utilisateur[],
): Match[] {
  return autres
    .filter((u) => u.uid !== moi.uid && u.actif !== false && (u.favoris ?? []).length >= MIN_FAVORIS)
    .map((u) => ({ utilisateur: u, ...calculerMatching(moi.favoris, u.favoris ?? []) }))
    .sort((a, b) => b.score - a.score || (a.utilisateur.prenom ?? '').localeCompare(b.utilisateur.prenom ?? '', 'fr'));
}
