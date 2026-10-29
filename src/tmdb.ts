// ⚠️ Remplace par TA clé TMDB (Paramètres → API → Clé d'API)
const API_KEY = import.meta.env.VITE_TMDB_KEY;
const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/w342';
// Grande taille pour les images de fond (bannière, détail)
export const IMG_GRAND = 'https://image.tmdb.org/t/p/w1280';

export interface FilmTMDB {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  overview: string;
}

// Fonction générique pour appeler TMDB
async function appel(chemin: string, params: Record<string, string> = {}) {
  if (!API_KEY) throw new Error('Clé TMDB manquante : ajoute VITE_TMDB_KEY dans le fichier .env');
  const url = new URL(BASE + chemin);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'fr-FR');
  Object.entries(params).forEach(([cle, valeur]) => url.searchParams.set(cle, valeur));

  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error('Erreur TMDB ' + reponse.status);
  return reponse.json();
}

// Films populaires du moment
export async function filmsPopulaires(): Promise<FilmTMDB[]> {
  const data = await appel('/movie/popular');
  return data.results;
}

// Films les mieux notés
export async function filmsMieuxNotes(): Promise<FilmTMDB[]> {
  const data = await appel('/movie/top_rated');
  return data.results;
}

// Films qui sortent bientôt
export async function filmsAVenir(): Promise<FilmTMDB[]> {
  const data = await appel('/movie/upcoming');
  return data.results;
}

// Recherche par titre
export async function rechercherFilms(texte: string): Promise<FilmTMDB[]> {
  const data = await appel('/search/movie', { query: texte });
  return data.results;
}

// Liste des genres : { 28: "Action", 35: "Comédie", ... }
export async function listeGenres(): Promise<Record<number, string>> {
  const data = await appel('/genre/movie/list');
  const genres: Record<number, string> = {};
  data.genres.forEach((g: { id: number; name: string }) => {
    genres[g.id] = g.name;
  });
  return genres;
}

// Les 5 acteurs principaux d'un film
export async function acteursDuFilm(id: number): Promise<string[]> {
  const data = await appel(`/movie/${id}/credits`);
  return data.cast.slice(0, 5).map((a: { name: string }) => a.name);
}

// Donne l'adresse complète d'une affiche (chemin TMDB ou lien complet)
export function urlAffiche(affiche: string | null): string | null {
  if (!affiche) return null;
  return affiche.startsWith('http') ? affiche : IMG + affiche;
}

// Adresse de l'image de fond en grande taille (null si le film n'en a pas)
export function urlFond(fond: string | null | undefined): string | null {
  return fond ? IMG_GRAND + fond : null;
}

// Vrai si le film est sorti il y a moins de 30 jours (date au format AAAA-MM-JJ)
export function estNouveau(dateSortie: string | undefined, maintenant = Date.now()): boolean {
  if (!dateSortie) return false;
  const sortie = new Date(dateSortie).getTime();
  if (Number.isNaN(sortie)) return false;
  const ecart = maintenant - sortie;
  return ecart >= 0 && ecart < 30 * 24 * 60 * 60 * 1000;
}
