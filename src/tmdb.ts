// ⚠️ Remplace par TA clé TMDB (Paramètres → API → Clé d'API)
const API_KEY = import.meta.env.VITE_TMDB_KEY;
const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/w342';

export interface FilmTMDB {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  overview: string;
}

// Fonction générique pour appeler TMDB
async function appel(chemin: string, params: Record<string, string> = {}) {
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