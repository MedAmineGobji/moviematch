import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// La clé est lue au chargement du module : on la remplace AVANT l'import,
// pour ne jamais utiliser la vraie clé du fichier .env.
let tmdb: typeof import('./tmdb');

const fetchMock = vi.fn();

function reponseOk(corps: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(corps) };
}

function urlAppelee(): URL {
  return new URL(String(fetchMock.mock.calls[0][0]));
}

beforeAll(async () => {
  vi.stubEnv('VITE_TMDB_KEY', 'cle-de-test');
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  tmdb = await import('./tmdb');
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('tmdb.ts', () => {
  it('filmsPopulaires appelle /movie/popular avec api_key et language=fr-FR', async () => {
    const films = [{ id: 1, title: 'Film A' }];
    fetchMock.mockResolvedValue(reponseOk({ results: films }));

    const resultat = await tmdb.filmsPopulaires();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = urlAppelee();
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/movie/popular');
    expect(url.searchParams.get('api_key')).toBe('cle-de-test');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(resultat).toEqual(films);
  });

  it('rechercherFilms appelle /search/movie avec le paramètre query', async () => {
    const films = [{ id: 2, title: 'Matrix' }];
    fetchMock.mockResolvedValue(reponseOk({ results: films }));

    const resultat = await tmdb.rechercherFilms('Matrix & co');

    const url = urlAppelee();
    expect(url.pathname).toBe('/3/search/movie');
    expect(url.searchParams.get('query')).toBe('Matrix & co');
    expect(url.searchParams.get('api_key')).toBe('cle-de-test');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(resultat).toEqual(films);
  });

  it('listeGenres transforme la liste en dictionnaire { id: nom }', async () => {
    fetchMock.mockResolvedValue(
      reponseOk({ genres: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comédie' }] }),
    );

    const genres = await tmdb.listeGenres();

    const url = urlAppelee();
    expect(url.pathname).toBe('/3/genre/movie/list');
    expect(url.searchParams.get('api_key')).toBe('cle-de-test');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(genres).toEqual({ 28: 'Action', 35: 'Comédie' });
  });

  it('acteursDuFilm appelle /movie/{id}/credits et limite à 5 noms', async () => {
    const cast = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name }));
    fetchMock.mockResolvedValue(reponseOk({ cast }));

    const acteurs = await tmdb.acteursDuFilm(603);

    const url = urlAppelee();
    expect(url.pathname).toBe('/3/movie/603/credits');
    expect(url.searchParams.get('api_key')).toBe('cle-de-test');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(acteurs).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('acteursDuFilm renvoie moins de 5 noms si le casting est court', async () => {
    fetchMock.mockResolvedValue(reponseOk({ cast: [{ name: 'Seul' }] }));
    await expect(tmdb.acteursDuFilm(1)).resolves.toEqual(['Seul']);
  });

  it.each([
    ['filmsPopulaires', () => tmdb.filmsPopulaires()],
    ['rechercherFilms', () => tmdb.rechercherFilms('x')],
    ['listeGenres', () => tmdb.listeGenres()],
    ['acteursDuFilm', () => tmdb.acteursDuFilm(1)],
  ])('%s lève une erreur si la réponse n\'est pas ok', async (_nom, appel) => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(appel()).rejects.toThrow('Erreur TMDB 401');
  });

  it('propage une erreur réseau de fetch', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(tmdb.filmsPopulaires()).rejects.toThrow('Failed to fetch');
  });
});

describe('tmdb.ts — clé manquante', () => {
  afterAll(() => {
    vi.stubEnv('VITE_TMDB_KEY', 'cle-de-test');
  });

  it.each(['', undefined])('lève une erreur explicite sans appeler TMDB (clé = %s)', async (cle) => {
    vi.stubEnv('VITE_TMDB_KEY', cle);
    vi.resetModules();
    const sansCle = await import('./tmdb');

    await expect(sansCle.filmsPopulaires()).rejects.toThrow(
      'Clé TMDB manquante : ajoute VITE_TMDB_KEY dans le fichier .env',
    );
    await expect(sansCle.acteursDuFilm(1)).rejects.toThrow('Clé TMDB manquante');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
