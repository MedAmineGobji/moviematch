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

  it.each([
    ['filmsMieuxNotes', '/3/movie/top_rated', () => tmdb.filmsMieuxNotes()],
    ['filmsAVenir', '/3/movie/upcoming', () => tmdb.filmsAVenir()],
  ])('%s appelle %s avec api_key et language=fr-FR', async (_nom, chemin, appel) => {
    const films = [{ id: 5, title: 'Film E' }];
    fetchMock.mockResolvedValue(reponseOk({ results: films }));

    const resultat = await appel();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = urlAppelee();
    expect(url.pathname).toBe(chemin);
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
    ['filmsMieuxNotes', () => tmdb.filmsMieuxNotes()],
    ['filmsAVenir', () => tmdb.filmsAVenir()],
  ])('%s lève une erreur si la réponse n\'est pas ok', async (_nom, appel) => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    await expect(appel()).rejects.toThrow('Erreur TMDB 401');
  });

  it('propage une erreur réseau de fetch', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(tmdb.filmsPopulaires()).rejects.toThrow('Failed to fetch');
  });
});

describe('tmdb.ts — urlAffiche', () => {
  it('ajoute l\'adresse TMDB devant un chemin', () => {
    expect(tmdb.urlAffiche('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  it('garde tel quel un lien complet (film de la sélection)', () => {
    expect(tmdb.urlAffiche('https://exemple.fr/affiche.jpg')).toBe('https://exemple.fr/affiche.jpg');
  });

  it('renvoie null sans affiche', () => {
    expect(tmdb.urlAffiche(null)).toBeNull();
    expect(tmdb.urlAffiche('')).toBeNull();
  });
});

describe('tmdb.ts — urlFond', () => {
  it('ajoute l\'adresse TMDB en grande taille (w1280)', () => {
    expect(tmdb.IMG_GRAND).toBe('https://image.tmdb.org/t/p/w1280');
    expect(tmdb.urlFond('/fond.jpg')).toBe('https://image.tmdb.org/t/p/w1280/fond.jpg');
  });

  it('renvoie null sans image de fond', () => {
    expect(tmdb.urlFond(null)).toBeNull();
    expect(tmdb.urlFond(undefined)).toBeNull();
    expect(tmdb.urlFond('')).toBeNull();
  });
});

describe('tmdb.ts — estNouveau', () => {
  const MAINTENANT = new Date('2026-06-15T12:00:00Z').getTime();

  it.each([
    ['2026-06-15', true],
    ['2026-06-05', true],
    ['2026-05-17', true],
    ['2026-05-15', false],
    ['2020-01-01', false],
    ['2026-06-20', false],
    ['', false],
    [undefined, false],
    ['pas une date', false],
  ])('estNouveau(%s) = %s', (date, attendu) => {
    expect(tmdb.estNouveau(date, MAINTENANT)).toBe(attendu);
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
