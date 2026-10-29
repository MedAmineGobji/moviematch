import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { acteursDuFilm, filmsPopulaires, listeGenres, rechercherFilms, FilmTMDB } from '../tmdb';
import { ajouterFavori, retirerFavori, Favori } from '../favoris';
import { useAuth } from '../AuthContext';
import Films from './Films';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonInput). On remplace donc IonSearchbar
// par un simple <input> qui appelle onIonInput comme le ferait Ionic.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type Props = { placeholder?: string; value?: string; onIonInput?: (e: unknown) => void };
  const IonSearchbar = ({ placeholder, value, onIonInput }: Props) =>
    createElement('input', {
      'aria-label': placeholder,
      value: value ?? '',
      onChange: (e: { target: { value: string } }) => onIonInput?.({ detail: { value: e.target.value } }),
    });
  return { ...actual, IonSearchbar };
});
vi.mock('../tmdb', () => ({
  IMG: 'https://img.test/w342',
  filmsPopulaires: vi.fn(),
  rechercherFilms: vi.fn(),
  listeGenres: vi.fn(),
  acteursDuFilm: vi.fn(),
}));
vi.mock('../favoris', () => ({
  ajouterFavori: vi.fn(() => Promise.resolve()),
  retirerFavori: vi.fn(() => Promise.resolve()),
}));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const film = (id: number, extra: Partial<FilmTMDB> = {}): FilmTMDB => ({
  id,
  title: 'Film ' + id,
  poster_path: '/affiche' + id + '.jpg',
  release_date: '2020-05-01',
  genre_ids: [28, 35],
  vote_average: 7.46,
  overview: '',
  ...extra,
});

const POPULAIRES = [film(1), film(2, { poster_path: null, release_date: '', genre_ids: [99] })];
const GENRES = { 28: 'Action', 35: 'Comédie', 18: 'Drame' };

const favoriExistant: Favori = {
  id: 2, titre: 'Film 2', affiche: null, annee: '', genres: [], acteurs: [], note: 5,
};

function connecter(favoris: Favori[] = []) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'u1' },
    profil: { favoris },
    loading: false,
    messageDeconnexion: '',
  } as never);
}

// Fait avancer le temps (debounce de 400 ms) et laisse les promesses se résoudre
const attendre = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function rechercher(texte: string) {
  fireEvent.change(screen.getByLabelText('Rechercher un film'), { target: { value: texte } });
}

const coeurs = () => screen.getAllByRole('button', { name: 'Favori' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  connecter();
  vi.mocked(filmsPopulaires).mockResolvedValue(POPULAIRES);
  vi.mocked(rechercherFilms).mockResolvedValue([film(10, { title: 'Matrix' })]);
  vi.mocked(listeGenres).mockResolvedValue(GENRES);
  vi.mocked(acteursDuFilm).mockResolvedValue(['Keanu Reeves', 'Carrie-Anne Moss']);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Films — affichage', () => {
  it('ne charge rien avant 400 ms puis affiche les films populaires', async () => {
    render(<Films />);
    await attendre(399);
    expect(filmsPopulaires).not.toHaveBeenCalled();
    expect(screen.queryByText('Film 1')).not.toBeInTheDocument();

    await attendre(1);
    expect(filmsPopulaires).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Film 1')).toBeInTheDocument();
    expect(screen.getByText('Film 2')).toBeInTheDocument();
  });

  it('affiche les informations du ticket', async () => {
    const { container } = render(<Films />);
    await attendre(400);

    const tickets = container.querySelectorAll('.ticket');
    expect(tickets).toHaveLength(2);

    // Ticket 1 : affiche, numéro, genres, année, note arrondie
    expect(screen.getByAltText('Film 1')).toHaveAttribute('src', 'https://img.test/w342/affiche1.jpg');
    expect(tickets[0]).toHaveTextContent('N° 001');
    expect(tickets[0]).toHaveTextContent('Action · Comédie');
    expect(tickets[0]).toHaveTextContent('2020');
    expect(tickets[0]).toHaveTextContent('★ 7.5');

    // Ticket 2 : pas d'affiche, pas de date, genre inconnu
    expect(tickets[1]).toHaveTextContent('N° 002');
    expect(tickets[1].querySelector('.ticket-affiche.vide')).toHaveTextContent('?');
    expect(tickets[1]).toHaveTextContent('—');
    expect(tickets[1].querySelector('.ticket-genres')).toHaveTextContent('');
  });

  it('limite l\'affichage à 3 genres', async () => {
    vi.mocked(filmsPopulaires).mockResolvedValue([film(1, { genre_ids: [28, 35, 18, 28] })]);
    const { container } = render(<Films />);
    await attendre(400);

    expect(container.querySelector('.ticket-genres')).toHaveTextContent('Action · Comédie · Drame');
  });

  it('affiche un message d\'erreur si TMDB échoue', async () => {
    vi.mocked(filmsPopulaires).mockRejectedValue(new Error('Erreur TMDB 401'));
    render(<Films />);
    await attendre(400);

    expect(screen.getByText('Impossible de charger les films. Vérifie ta clé TMDB.')).toBeInTheDocument();
    expect(screen.queryByText('Film 1')).not.toBeInTheDocument();
  });

  it('ne plante pas si TMDB ne renvoie ni genre_ids ni vote_average', async () => {
    const incomplet = { ...film(1), genre_ids: undefined, vote_average: undefined } as unknown as FilmTMDB;
    vi.mocked(filmsPopulaires).mockResolvedValue([incomplet]);
    const { container } = render(<Films />);
    await attendre(400);

    expect(screen.getByText('Film 1')).toBeInTheDocument();
    expect(container.querySelector('.ticket-genres')).toHaveTextContent('');
    expect(container.querySelector('.note')).toHaveTextContent('★ 0.0');

    fireEvent.click(coeurs()[0]);
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({ genres: [], note: 0 }));
  });

  it('affiche quand même les films si listeGenres échoue', async () => {
    vi.mocked(listeGenres).mockRejectedValue(new Error('x'));
    render(<Films />);
    await attendre(400);

    expect(screen.getByText('Film 1')).toBeInTheDocument();
    expect(screen.queryByText(/Impossible/)).not.toBeInTheDocument();
  });
});

describe('Films — recherche', () => {
  it('lance la recherche 400 ms après la saisie', async () => {
    render(<Films />);
    await attendre(400);

    rechercher('matrix');
    await attendre(399);
    expect(rechercherFilms).not.toHaveBeenCalled();

    await attendre(1);
    expect(rechercherFilms).toHaveBeenCalledWith('matrix');
    expect(screen.getByText('Matrix')).toBeInTheDocument();
    expect(screen.queryByText('Film 1')).not.toBeInTheDocument();
  });

  it('n\'envoie qu\'une requête si on tape vite (debounce)', async () => {
    render(<Films />);
    await attendre(400);

    rechercher('m');
    await attendre(200);
    rechercher('ma');
    await attendre(200);
    rechercher('mat');
    await attendre(400);

    expect(rechercherFilms).toHaveBeenCalledTimes(1);
    expect(rechercherFilms).toHaveBeenCalledWith('mat');
  });

  it('ignore l\'erreur d\'une recherche devenue obsolète', async () => {
    let echouerAncienne: (e: Error) => void = () => {};
    vi.mocked(rechercherFilms)
      .mockImplementationOnce(() => new Promise((_ok, ko) => { echouerAncienne = ko; }))
      .mockResolvedValueOnce([film(20, { title: 'Résultat récent' })]);
    render(<Films />);
    await attendre(400);

    rechercher('a');
    await attendre(400);
    rechercher('ab');
    await attendre(400);

    await act(async () => echouerAncienne(new Error('réseau')));
    expect(screen.queryByText(/Impossible/)).not.toBeInTheDocument();
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();
  });

  it('supprime les espaces et revient aux films populaires si la recherche est vide', async () => {
    render(<Films />);
    await attendre(400);

    rechercher('  dune  ');
    await attendre(400);
    expect(rechercherFilms).toHaveBeenCalledWith('dune');

    rechercher('   ');
    await attendre(400);
    expect(rechercherFilms).toHaveBeenCalledTimes(1);
    expect(filmsPopulaires).toHaveBeenCalledTimes(2);
  });

  it('affiche un message d\'erreur si la recherche échoue', async () => {
    vi.mocked(rechercherFilms).mockRejectedValue(new Error('réseau'));
    render(<Films />);
    await attendre(400);

    rechercher('x');
    await attendre(400);
    expect(screen.getByText('Impossible de charger les films. Vérifie ta clé TMDB.')).toBeInTheDocument();
  });

  // BUG attendu : une ancienne requête plus lente peut écraser le résultat de la
  // plus récente, car la réponse n'est pas ignorée quand la recherche a changé.
  it('ignore la réponse d\'une recherche devenue obsolète', async () => {
    let finirAncienne: (f: FilmTMDB[]) => void = () => {};
    vi.mocked(rechercherFilms)
      .mockImplementationOnce(() => new Promise((ok) => { finirAncienne = ok; }))
      .mockResolvedValueOnce([film(20, { title: 'Résultat récent' })]);
    render(<Films />);
    await attendre(400);

    rechercher('a');
    await attendre(400); // requête "a" en cours (lente)
    rechercher('ab');
    await attendre(400); // requête "ab" terminée
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();

    await act(async () => finirAncienne([film(30, { title: 'Résultat obsolète' })]));
    expect(screen.queryByText('Résultat obsolète')).not.toBeInTheDocument();
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();
  });
});

describe('Films — favoris', () => {
  it('le cœur ajoute le film aux favoris avec les acteurs et les genres', async () => {
    const favoris = [favoriExistant];
    connecter(favoris);
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]); // Film 1, pas encore favori
    await attendre(0);

    expect(acteursDuFilm).toHaveBeenCalledWith(1);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', favoris, {
      id: 1,
      titre: 'Film 1',
      affiche: '/affiche1.jpg',
      annee: '2020',
      genres: ['Action', 'Comédie'],
      acteurs: ['Keanu Reeves', 'Carrie-Anne Moss'],
      note: 7.46,
    });
    expect(retirerFavori).not.toHaveBeenCalled();
  });

  it('le cœur retire un film déjà favori', async () => {
    const favoris = [favoriExistant];
    connecter(favoris);
    render(<Films />);
    await attendre(400);

    expect(coeurs()[1]).toHaveClass('actif');
    expect(coeurs()[0]).not.toHaveClass('actif');

    fireEvent.click(coeurs()[1]); // Film 2, déjà favori
    await attendre(0);

    expect(retirerFavori).toHaveBeenCalledWith('u1', favoris, 2);
    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(acteursDuFilm).not.toHaveBeenCalled();
  });

  it('ajoute le favori avec une liste d\'acteurs vide si TMDB échoue', async () => {
    vi.mocked(acteursDuFilm).mockRejectedValue(new Error('x'));
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[1]); // Film 2 : sans date ni genre connu
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({
      id: 2, affiche: null, annee: '', genres: [], acteurs: [],
    }));
  });

  it('ne fait rien si aucun utilisateur n\'est connecté', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, profil: null, loading: false, messageDeconnexion: '' });
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]);
    await attendre(0);

    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(retirerFavori).not.toHaveBeenCalled();
  });

  it('ne plante pas si Firestore refuse l\'écriture', async () => {
    vi.mocked(ajouterFavori).mockRejectedValueOnce(new Error('permission-denied'));
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]);
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Film 1')).toBeInTheDocument();
  });

  // Bug C : un double clic rapide ajoutait deux fois le même film.
  it('n\'ajoute pas deux fois le même film en cas de double clic', async () => {
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]);
    fireEvent.click(coeurs()[0]);
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledTimes(1);
  });

  it('désactive le cœur pendant l\'opération puis le réactive', async () => {
    let finirAjout: () => void = () => {};
    vi.mocked(ajouterFavori).mockImplementationOnce(() => new Promise<void>((ok) => { finirAjout = ok; }));
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]);
    await attendre(0);
    expect(coeurs()[0]).toBeDisabled();
    expect(coeurs()[1]).not.toBeDisabled();

    // Un autre film ne peut pas être modifié tant que le premier est en cours
    fireEvent.click(coeurs()[1]);
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledTimes(1);

    await act(async () => finirAjout());
    expect(coeurs()[0]).not.toBeDisabled();
  });

  it('réactive le cœur même si l\'écriture échoue', async () => {
    vi.mocked(ajouterFavori).mockRejectedValueOnce(new Error('permission-denied'));
    render(<Films />);
    await attendre(400);

    fireEvent.click(coeurs()[0]);
    await attendre(0);

    expect(coeurs()[0]).not.toBeDisabled();
    fireEvent.click(coeurs()[0]);
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledTimes(2);
  });
});
