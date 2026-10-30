import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  acteursDuFilm, filmsAVenir, filmsMieuxNotes, filmsPopulaires, listeGenres, rechercherFilms, FilmTMDB,
} from '../tmdb';
import { ajouterFavori, retirerFavori, Favori } from '../favoris';
import { ecouterFilmsMaison, FilmMaison } from '../catalogue';
import { useAuth } from '../AuthContext';
import Films from './Films';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonInput) et n'ouvre pas les overlays.
// On remplace donc IonSearchbar par un <input>, IonModal par un simple dialog
// et IonToast par un message visible.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type PropsRecherche = { placeholder?: string; value?: string; onIonInput?: (e: unknown) => void };
  const IonSearchbar = ({ placeholder, value, onIonInput }: PropsRecherche) =>
    createElement('input', {
      'aria-label': placeholder,
      value: value ?? '',
      onChange: (e: { target: { value: string } }) => onIonInput?.({ detail: { value: e.target.value } }),
    });
  type PropsModal = { isOpen?: boolean; children?: React.ReactNode };
  const IonModal = ({ isOpen, children }: PropsModal) =>
    isOpen ? createElement('div', { role: 'dialog' }, children) : null;
  type PropsToast = { isOpen?: boolean; message?: string };
  const IonToast = ({ isOpen, message }: PropsToast) =>
    isOpen ? createElement('div', { role: 'status' }, message) : null;
  return { ...actual, IonSearchbar, IonModal, IonToast };
});
// On garde les vraies fonctions sans réseau (urlAffiche, urlFond, estNouveau, IMG...)
// et on simule tous les appels à TMDB
vi.mock('../tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tmdb')>()),
  filmsPopulaires: vi.fn(),
  filmsMieuxNotes: vi.fn(),
  filmsAVenir: vi.fn(),
  rechercherFilms: vi.fn(),
  listeGenres: vi.fn(),
  acteursDuFilm: vi.fn(),
}));
vi.mock('../favoris', () => ({
  ajouterFavori: vi.fn(() => Promise.resolve()),
  retirerFavori: vi.fn(() => Promise.resolve()),
}));
vi.mock('../catalogue', () => ({ ecouterFilmsMaison: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const IMG = 'https://image.tmdb.org/t/p/w342';
const IMG_GRAND = 'https://image.tmdb.org/t/p/w1280';
const MESSAGE_ERREUR = 'Impossible de charger les films. Vérifie ta clé TMDB.';

const film = (id: number, extra: Partial<FilmTMDB> = {}): FilmTMDB => ({
  id,
  title: 'Film ' + id,
  poster_path: '/affiche' + id + '.jpg',
  backdrop_path: '/fond' + id + '.jpg',
  release_date: '2020-05-01',
  genre_ids: [28, 35],
  vote_average: 7.46,
  overview: 'Synopsis du film ' + id + '.',
  ...extra,
});

const POPULAIRES = [film(1), film(2, { poster_path: null, release_date: '', genre_ids: [99] })];
const MIEUX_NOTES = [film(3, { title: 'Classique' })];
const A_VENIR = [film(4, { title: 'Futur', release_date: '2099-01-01' })];
const GENRES = { 28: 'Action', 35: 'Comédie', 18: 'Drame' };

const favoriExistant: Favori = {
  id: 2, titre: 'Film 2', affiche: null, annee: '', genres: [], acteurs: [], note: 5,
};

const filmMaison = (id: number, titre: string, extra: Partial<FilmMaison> = {}): FilmMaison => ({
  id,
  titre,
  affiche: 'https://exemple.fr/' + -id + '.jpg',
  annee: '2024',
  genres: ['Drame', 'Science-Fiction'],
  acteurs: ['Alice', 'Bob'],
  note: 0,
  synopsis: 'Une histoire maison.',
  creeLe: -id,
  ...extra,
});

const SELECTION = [filmMaison(-2, 'Été Indien'), filmMaison(-1, 'La Cité', { affiche: null, annee: '' })];

const arretSelection = vi.fn();

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

// Affiche la page et attend le chargement de l'accueil
async function demarrer() {
  const rendu = render(<Films />);
  await attendre(0);
  return rendu;
}

// Envoie la sélection de l'admin comme le ferait Firestore
const envoyerSelection = (liste: FilmMaison[]) =>
  act(() => vi.mocked(ecouterFilmsMaison).mock.calls.at(-1)![0](liste));

const ouvrirRecherche = () => fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la recherche' }));
function rechercher(texte: string) {
  fireEvent.change(screen.getByLabelText('Rechercher un film'), { target: { value: texte } });
}

// Le cœur d'un film (le premier s'il apparaît dans plusieurs rangées)
const coeur = (titre: string) =>
  screen.getAllByRole('button', { name: new RegExp(`^(Ajouter ${titre} à|Retirer ${titre} de) ma liste$`) })[0];
const banniere = () => document.querySelector('.banniere') as HTMLElement;
const rangee = (titre: string) => screen.getByRole('region', { name: titre });
const titresDe = (zone: Element) =>
  Array.from(zone.querySelectorAll('.carte-titre')).map((t) => t.textContent);
const toast = () => screen.queryByRole('status');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  connecter();
  vi.mocked(filmsPopulaires).mockResolvedValue(POPULAIRES);
  vi.mocked(filmsMieuxNotes).mockResolvedValue(MIEUX_NOTES);
  vi.mocked(filmsAVenir).mockResolvedValue(A_VENIR);
  vi.mocked(rechercherFilms).mockResolvedValue([film(10, { title: 'Matrix' })]);
  vi.mocked(listeGenres).mockResolvedValue(GENRES);
  vi.mocked(acteursDuFilm).mockResolvedValue(['Keanu Reeves', 'Carrie-Anne Moss']);
  vi.mocked(ecouterFilmsMaison).mockReturnValue(arretSelection);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Films — accueil', () => {
  it('charge les trois listes TMDB au démarrage', async () => {
    await demarrer();

    expect(filmsPopulaires).toHaveBeenCalledTimes(1);
    expect(filmsMieuxNotes).toHaveBeenCalledTimes(1);
    expect(filmsAVenir).toHaveBeenCalledTimes(1);
    expect(rechercherFilms).not.toHaveBeenCalled();
  });

  it('affiche l\'en-tête avec le logo et le bouton loupe', async () => {
    await demarrer();

    const logo = screen.getByRole('heading', { level: 1, name: 'Movie Match' });
    expect(within(logo).getByText('Match')).toHaveClass('logo-match');
    expect(screen.getByRole('button', { name: 'Ouvrir la recherche' })).toBeInTheDocument();
  });

  it('affiche les 4 rangées dans l\'ordre, avec un chevron', async () => {
    await demarrer();
    envoyerSelection(SELECTION);

    const titres = screen.getAllByRole('heading', { level: 2 })
      .filter((h) => h.classList.contains('rangee-titre'))
      .map((h) => h.textContent);
    expect(titres).toEqual([
      'Sélection Movie Match ›',
      "À l'affiche ›",
      'Les mieux notés ›',
      'Bientôt au cinéma ›',
    ]);

    expect(titresDe(rangee('Sélection Movie Match'))).toEqual(['Été Indien', 'La Cité']);
    expect(titresDe(rangee("À l'affiche"))).toEqual(['Film 1', 'Film 2']);
    expect(titresDe(rangee('Les mieux notés'))).toEqual(['Classique']);
    expect(titresDe(rangee('Bientôt au cinéma'))).toEqual(['Futur']);
  });

  it('masque la rangée "Sélection Movie Match" si elle est vide', async () => {
    await demarrer();
    envoyerSelection([]);

    expect(screen.queryByRole('region', { name: 'Sélection Movie Match' })).not.toBeInTheDocument();
    expect(rangee("À l'affiche")).toBeInTheDocument();
  });

  it('affiche les cartes : affiche TMDB, titre et année', async () => {
    await demarrer();

    const zone = rangee("À l'affiche");
    const cartes = zone.querySelectorAll('.carte');
    expect(cartes).toHaveLength(2);

    // Carte 1 : affiche, titre, année
    expect(within(zone).getByAltText('Film 1')).toHaveAttribute('src', IMG + '/affiche1.jpg');
    expect(cartes[0].querySelector('.carte-titre')).toHaveTextContent('Film 1');
    expect(cartes[0].querySelector('.carte-annee')).toHaveTextContent('2020');

    // Carte 2 : pas d'affiche, pas de date
    expect(cartes[1].querySelector('.carte-vide')).toHaveTextContent('?');
    expect(cartes[1].querySelector('.carte-annee')).toHaveTextContent('—');
  });

  it('affiche un message d\'erreur si TMDB échoue', async () => {
    vi.mocked(filmsPopulaires).mockRejectedValue(new Error('Erreur TMDB 401'));
    vi.mocked(filmsMieuxNotes).mockRejectedValue(new Error('Erreur TMDB 401'));
    vi.mocked(filmsAVenir).mockRejectedValue(new Error('Erreur TMDB 401'));
    await demarrer();

    expect(screen.getByText(MESSAGE_ERREUR)).toBeInTheDocument();
    expect(screen.queryByText('Film 1')).not.toBeInTheDocument();
    expect(banniere()).toBeNull();
  });

  it('garde les autres rangées si une seule liste échoue', async () => {
    vi.mocked(filmsMieuxNotes).mockRejectedValue(new Error('réseau'));
    await demarrer();

    expect(screen.getByText(MESSAGE_ERREUR)).toBeInTheDocument();
    expect(rangee("À l'affiche")).toBeInTheDocument();
    expect(rangee('Bientôt au cinéma')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Les mieux notés' })).not.toBeInTheDocument();
  });

  it('affiche quand même les films si listeGenres échoue', async () => {
    vi.mocked(listeGenres).mockRejectedValue(new Error('x'));
    await demarrer();

    expect(screen.getAllByText('Film 1').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Impossible/)).not.toBeInTheDocument();
  });

  it('ignore les listes reçues après le démontage', async () => {
    let finir: (f: FilmTMDB[]) => void = () => {};
    vi.mocked(filmsPopulaires).mockImplementationOnce(() => new Promise((ok) => { finir = ok; }));
    const { unmount } = render(<Films />);
    unmount();

    // Ne doit pas provoquer d'erreur "state update on unmounted component"
    await act(async () => finir(POPULAIRES));
    expect(screen.queryByText('Film 1')).not.toBeInTheDocument();
  });
});

describe('Films — bannière', () => {
  it('met en avant le premier film populaire avec son image de fond en grand', async () => {
    await demarrer();

    const zone = banniere();
    expect(within(zone).getByRole('heading', { name: 'Film 1' })).toHaveClass('banniere-titre');
    const fond = zone.querySelector('.banniere-fond');
    expect(fond).toHaveAttribute('src', IMG_GRAND + '/fond1.jpg');
    // Image décorative : le titre est déjà affiché en texte
    expect(fond).toHaveAttribute('alt', '');
  });

  it('affiche la ligne "année · genres · ★ note"', async () => {
    await demarrer();

    expect(banniere().querySelector('.banniere-infos')).toHaveTextContent('2020 · Action, Comédie · ★ 7.5');
  });

  it('limite la ligne à 3 genres', async () => {
    vi.mocked(filmsPopulaires).mockResolvedValue([film(1, { genre_ids: [28, 35, 18, 28] })]);
    await demarrer();

    expect(banniere().querySelector('.banniere-infos')).toHaveTextContent('2020 · Action, Comédie, Drame · ★ 7.5');
  });

  it('utilise l\'affiche si le film n\'a pas d\'image de fond', async () => {
    vi.mocked(filmsPopulaires).mockResolvedValue([film(1, { backdrop_path: null })]);
    await demarrer();

    expect(banniere().querySelector('.banniere-fond')).toHaveAttribute('src', IMG + '/affiche1.jpg');
  });

  it('"Ma liste" ajoute le film de la bannière aux favoris', async () => {
    await demarrer();

    fireEvent.click(within(banniere()).getByText('Ma liste'));
    await attendre(0);

    expect(acteursDuFilm).toHaveBeenCalledWith(1);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({
      id: 1, titre: 'Film 1', acteurs: ['Keanu Reeves', 'Carrie-Anne Moss'],
    }));
    expect(toast()).toHaveTextContent('Ajouté à ta liste');
  });

  it('devient "Dans ma liste" si le film est favori, et le retire au clic', async () => {
    const favoris: Favori[] = [{ ...favoriExistant, id: 1, titre: 'Film 1' }];
    connecter(favoris);
    await demarrer();

    expect(within(banniere()).queryByText('Ma liste')).not.toBeInTheDocument();
    fireEvent.click(within(banniere()).getByText('Dans ma liste'));
    await attendre(0);

    expect(retirerFavori).toHaveBeenCalledWith('u1', favoris, 1);
    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(toast()).toHaveTextContent('Retiré de ta liste');
  });

  it('"Détails" ouvre le détail du film', async () => {
    await demarrer();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(within(banniere()).getByText('Détails'));

    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Film 1' })).toBeInTheDocument();
  });

  it('pas de bannière tant que les films ne sont pas chargés', () => {
    vi.mocked(filmsPopulaires).mockImplementation(() => new Promise(() => {}));
    render(<Films />);

    expect(banniere()).toBeNull();
    expect(document.querySelector('ion-spinner')).toBeInTheDocument();
  });
});

describe('Films — étiquette "Nouveau"', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  it.each([
    ['sorti il y a 10 jours', '2026-06-05', true],
    ['sorti aujourd\'hui', '2026-06-15', true],
    ['sorti il y a 29 jours', '2026-05-17', true],
    ['sorti il y a 31 jours', '2026-05-15', false],
    ['qui sort dans le futur', '2026-07-01', false],
    ['sans date', '', false],
  ])('film %s', async (_cas, date, attendu) => {
    vi.mocked(filmsPopulaires).mockResolvedValue([film(1, { release_date: date })]);
    await demarrer();

    const carte = rangee("À l'affiche").querySelector('.carte')!;
    if (attendu) {
      expect(within(carte as HTMLElement).getByText('Nouveau')).toHaveClass('etiquette-nouveau');
    } else {
      expect(carte.querySelector('.etiquette-nouveau')).toBeNull();
    }
  });

  it('jamais sur les films de la sélection', async () => {
    await demarrer();
    envoyerSelection(SELECTION);

    expect(rangee('Sélection Movie Match').querySelector('.etiquette-nouveau')).toBeNull();
  });
});

describe('Films — mode recherche', () => {
  it('la loupe ouvre la barre de recherche et cache l\'accueil', async () => {
    await demarrer();
    ouvrirRecherche();

    expect(screen.getByLabelText('Rechercher un film')).toBeInTheDocument();
    expect(banniere()).toBeNull();
    expect(screen.queryByRole('region', { name: "À l'affiche" })).not.toBeInTheDocument();
    expect(screen.getByText("Tape le titre d'un film pour lancer la recherche.")).toBeInTheDocument();
  });

  it('lance la recherche 400 ms après la saisie et affiche une grille', async () => {
    const { container } = await demarrer();
    ouvrirRecherche();

    rechercher('matrix');
    await attendre(399);
    expect(rechercherFilms).not.toHaveBeenCalled();

    await attendre(1);
    expect(rechercherFilms).toHaveBeenCalledWith('matrix');
    const grille = container.querySelector('.grille')!;
    expect(titresDe(grille)).toEqual(['Matrix']);
  });

  it('n\'envoie qu\'une requête si on tape vite (debounce)', async () => {
    await demarrer();
    ouvrirRecherche();

    rechercher('m');
    await attendre(200);
    rechercher('ma');
    await attendre(200);
    rechercher('mat');
    await attendre(400);

    expect(rechercherFilms).toHaveBeenCalledTimes(1);
    expect(rechercherFilms).toHaveBeenCalledWith('mat');
  });

  it('supprime les espaces et ne cherche pas si la recherche est vide', async () => {
    await demarrer();
    ouvrirRecherche();

    rechercher('  dune  ');
    await attendre(400);
    expect(rechercherFilms).toHaveBeenCalledWith('dune');

    rechercher('   ');
    await attendre(400);
    expect(rechercherFilms).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.grille')).toBeNull();
  });

  it('affiche "Aucun film trouvé." si rien ne correspond', async () => {
    vi.mocked(rechercherFilms).mockResolvedValue([]);
    await demarrer();
    ouvrirRecherche();

    rechercher('zzz');
    await attendre(400);
    expect(screen.getByText('Aucun film trouvé.')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si la recherche échoue', async () => {
    vi.mocked(rechercherFilms).mockRejectedValue(new Error('réseau'));
    await demarrer();
    ouvrirRecherche();

    rechercher('x');
    await attendre(400);
    expect(screen.getByText(MESSAGE_ERREUR)).toBeInTheDocument();
  });

  it('ignore la réponse d\'une recherche devenue obsolète', async () => {
    let finirAncienne: (f: FilmTMDB[]) => void = () => {};
    vi.mocked(rechercherFilms)
      .mockImplementationOnce(() => new Promise((ok) => { finirAncienne = ok; }))
      .mockResolvedValueOnce([film(20, { title: 'Résultat récent' })]);
    await demarrer();
    ouvrirRecherche();

    rechercher('a');
    await attendre(400); // requête "a" en cours (lente)
    rechercher('ab');
    await attendre(400); // requête "ab" terminée
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();

    await act(async () => finirAncienne([film(30, { title: 'Résultat obsolète' })]));
    expect(screen.queryByText('Résultat obsolète')).not.toBeInTheDocument();
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();
  });

  it('ignore l\'erreur d\'une recherche devenue obsolète', async () => {
    let echouerAncienne: (e: Error) => void = () => {};
    vi.mocked(rechercherFilms)
      .mockImplementationOnce(() => new Promise((_ok, ko) => { echouerAncienne = ko; }))
      .mockResolvedValueOnce([film(20, { title: 'Résultat récent' })]);
    await demarrer();
    ouvrirRecherche();

    rechercher('a');
    await attendre(400);
    rechercher('ab');
    await attendre(400);

    await act(async () => echouerAncienne(new Error('réseau')));
    expect(screen.queryByText(/Impossible/)).not.toBeInTheDocument();
    expect(screen.getByText('Résultat récent')).toBeInTheDocument();
  });

  it('le bouton retour revient à l\'accueil et vide la recherche', async () => {
    await demarrer();
    ouvrirRecherche();
    rechercher('matrix');
    await attendre(400);

    fireEvent.click(screen.getByRole('button', { name: "Revenir à l'accueil" }));

    expect(banniere()).not.toBeNull();
    expect(rangee("À l'affiche")).toBeInTheDocument();
    expect(screen.queryByLabelText('Rechercher un film')).not.toBeInTheDocument();

    // En revenant dans la recherche, elle est vide
    ouvrirRecherche();
    expect(screen.getByLabelText('Rechercher un film')).toHaveValue('');
  });

  it.each([
    ['ete', ['Été Indien']],
    ['ÉTÉ IND', ['Été Indien']],
    ['cite', ['La Cité']],
    ['  la  ', ['La Cité']],
    ['zzz', []],
  ])('avec "%s", filtre la sélection sans tenir compte des accents ni des majuscules', async (texte, attendus) => {
    vi.mocked(rechercherFilms).mockResolvedValue([]);
    await demarrer();
    envoyerSelection(SELECTION);
    ouvrirRecherche();

    rechercher(texte);
    await attendre(400);

    const grille = document.querySelector('.grille');
    expect(grille ? titresDe(grille) : []).toEqual(attendus);
  });

  it('affiche la sélection filtrée avant les résultats TMDB', async () => {
    await demarrer();
    envoyerSelection(SELECTION);
    ouvrirRecherche();

    rechercher('cité');
    await attendre(400);

    expect(titresDe(document.querySelector('.grille')!)).toEqual(['La Cité', 'Matrix']);
    expect(rechercherFilms).toHaveBeenCalledWith('cité');
  });
});

describe('Films — détail d\'un film', () => {
  it('s\'ouvre au clic sur une affiche, avec toutes les infos et les acteurs TMDB', async () => {
    await demarrer();

    fireEvent.click(within(rangee("À l'affiche")).getByRole('button', { name: 'Voir le détail de Film 1' }));
    const modal = screen.getByRole('dialog');

    expect(within(modal).getByRole('heading', { name: 'Film 1' })).toBeInTheDocument();
    expect(within(modal).getByAltText('Affiche de Film 1')).toHaveAttribute('src', IMG + '/affiche1.jpg');
    expect(modal.querySelector('.detail-fond')).toHaveAttribute('src', IMG_GRAND + '/fond1.jpg');
    expect(modal).toHaveTextContent('2020');
    expect(modal).toHaveTextContent('★ 7.5');
    expect(modal).toHaveTextContent('Action · Comédie');
    expect(within(modal).getByText('Synopsis du film 1.')).toBeInTheDocument();

    // Les acteurs sont chargés à l'ouverture
    expect(within(modal).getByText('Chargement des acteurs…')).toBeInTheDocument();
    await attendre(0);
    expect(acteursDuFilm).toHaveBeenCalledWith(1);
    expect(within(modal).getByText('Keanu Reeves, Carrie-Anne Moss')).toBeInTheDocument();
  });

  it('affiche un message si les acteurs ne peuvent pas être chargés', async () => {
    vi.mocked(acteursDuFilm).mockRejectedValue(new Error('x'));
    await demarrer();

    fireEvent.click(within(rangee('Les mieux notés')).getByRole('button', { name: 'Voir le détail de Classique' }));
    await attendre(0);

    expect(within(screen.getByRole('dialog')).getByText('Acteurs non disponibles.')).toBeInTheDocument();
  });

  it('pour un film de la sélection, utilise les acteurs déjà connus sans appeler TMDB', async () => {
    await demarrer();
    envoyerSelection(SELECTION);

    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail de Été Indien' }));
    await attendre(0);
    const modal = screen.getByRole('dialog');

    expect(acteursDuFilm).not.toHaveBeenCalled();
    expect(within(modal).getByText('Alice, Bob')).toBeInTheDocument();
    expect(within(modal).getByText('Une histoire maison.')).toBeInTheDocument();
    expect(modal).toHaveTextContent('Drame · Science-Fiction');
    expect(within(modal).getByAltText('Affiche de Été Indien')).toHaveAttribute('src', 'https://exemple.fr/2.jpg');
  });

  it('"Ma liste" dans le détail ajoute le film en réutilisant les acteurs chargés', async () => {
    await demarrer();

    fireEvent.click(within(rangee('Les mieux notés')).getByRole('button', { name: 'Voir le détail de Classique' }));
    await attendre(0);
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Ma liste'));
    await attendre(0);

    expect(acteursDuFilm).toHaveBeenCalledTimes(1);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({
      id: 3, titre: 'Classique', acteurs: ['Keanu Reeves', 'Carrie-Anne Moss'],
    }));
  });

  it('le bouton fermer ferme le détail', async () => {
    await demarrer();

    fireEvent.click(within(rangee("À l'affiche")).getByRole('button', { name: 'Voir le détail de Film 1' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer le détail' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('s\'ouvre aussi depuis la grille de recherche', async () => {
    await demarrer();
    ouvrirRecherche();
    rechercher('matrix');
    await attendre(400);

    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail de Matrix' }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Matrix' })).toBeInTheDocument();
  });
});

describe('Films — favoris', () => {
  it('le cœur ajoute le film aux favoris avec les acteurs et les genres', async () => {
    const favoris = [favoriExistant];
    connecter(favoris);
    await demarrer();

    fireEvent.click(coeur('Film 1')); // pas encore favori
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

  it('attend la liste des genres si elle n\'est pas encore chargée', async () => {
    // Le premier chargement des genres n'est pas encore arrivé quand on touche le cœur
    vi.mocked(listeGenres).mockImplementationOnce(() => new Promise(() => {}));
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(listeGenres).toHaveBeenCalledTimes(2);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({
      id: 1, genres: ['Action', 'Comédie'],
    }));
  });

  it('n\'enregistre pas le favori sans genres si la liste des genres ne charge pas', async () => {
    vi.mocked(listeGenres).mockRejectedValue(new Error('x'));
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(toast()).toHaveTextContent('Erreur, réessaie.');
  });

  it('le cœur retire un film déjà favori', async () => {
    const favoris = [favoriExistant];
    connecter(favoris);
    await demarrer();

    expect(coeur('Film 2')).toHaveClass('actif');
    expect(coeur('Film 2')).toHaveAccessibleName('Retirer Film 2 de ma liste');
    expect(coeur('Film 1')).not.toHaveClass('actif');

    fireEvent.click(coeur('Film 2'));
    await attendre(0);

    expect(retirerFavori).toHaveBeenCalledWith('u1', favoris, 2);
    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(acteursDuFilm).not.toHaveBeenCalled();
  });

  it('ajoute le favori avec une liste d\'acteurs vide si TMDB échoue', async () => {
    vi.mocked(acteursDuFilm).mockRejectedValue(new Error('x'));
    await demarrer();

    fireEvent.click(coeur('Film 2')); // sans date ni genre connu
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({
      id: 2, affiche: null, annee: '', genres: [], acteurs: [],
    }));
  });

  it('ne plante pas si TMDB ne renvoie ni genre_ids ni vote_average', async () => {
    const incomplet = { ...film(1), genre_ids: undefined, vote_average: undefined } as unknown as FilmTMDB;
    vi.mocked(filmsPopulaires).mockResolvedValue([incomplet]);
    await demarrer();

    expect(banniere().querySelector('.banniere-infos')).toHaveTextContent('2020 · ★ 0.0');

    fireEvent.click(coeur('Film 1'));
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({ genres: [], note: 0 }));
  });

  it('ne fait rien si aucun utilisateur n\'est connecté', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, profil: null, loading: false, messageDeconnexion: '' });
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(ajouterFavori).not.toHaveBeenCalled();
    expect(retirerFavori).not.toHaveBeenCalled();
  });

  it('affiche "Erreur, réessaie." si Firestore refuse l\'écriture', async () => {
    vi.mocked(ajouterFavori).mockRejectedValueOnce(new Error('permission-denied'));
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledTimes(1);
    expect(toast()).toHaveTextContent('Erreur, réessaie.');
    expect(screen.getAllByText('Film 1').length).toBeGreaterThan(0);
  });

  // Bug C : un double clic rapide ajoutait deux fois le même film.
  it('n\'ajoute pas deux fois le même film en cas de double clic', async () => {
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledTimes(1);
  });

  it('désactive le cœur pendant l\'opération puis le réactive', async () => {
    let finirAjout: () => void = () => {};
    vi.mocked(ajouterFavori).mockImplementationOnce(() => new Promise<void>((ok) => { finirAjout = ok; }));
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);
    expect(coeur('Film 1')).toBeDisabled();
    expect(coeur('Film 2')).not.toBeDisabled();

    // Un autre film ne peut pas être modifié tant que le premier est en cours
    fireEvent.click(coeur('Film 2'));
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledTimes(1);

    await act(async () => finirAjout());
    expect(coeur('Film 1')).not.toBeDisabled();
  });

  it('réactive le cœur même si l\'écriture échoue', async () => {
    vi.mocked(ajouterFavori).mockRejectedValueOnce(new Error('permission-denied'));
    await demarrer();

    fireEvent.click(coeur('Film 1'));
    await attendre(0);

    expect(coeur('Film 1')).not.toBeDisabled();
    fireEvent.click(coeur('Film 1'));
    await attendre(0);
    expect(ajouterFavori).toHaveBeenCalledTimes(2);
  });

  it('le cœur fonctionne aussi dans la grille de recherche', async () => {
    await demarrer();
    ouvrirRecherche();
    rechercher('matrix');
    await attendre(400);

    fireEvent.click(coeur('Matrix'));
    await attendre(0);

    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], expect.objectContaining({ id: 10, titre: 'Matrix' }));
  });
});

describe('Films — sélection Movie Match', () => {
  it('écoute la sélection et se désabonne au démontage', () => {
    const { unmount } = render(<Films />);
    expect(ecouterFilmsMaison).toHaveBeenCalledTimes(1);

    unmount();
    expect(arretSelection).toHaveBeenCalledTimes(1);
  });

  it('affiche les cartes de la sélection avec urlAffiche', async () => {
    await demarrer();
    envoyerSelection(SELECTION);

    const zone = rangee('Sélection Movie Match');
    const cartes = zone.querySelectorAll('.carte');
    // Lien complet gardé tel quel (pas de préfixe TMDB)
    expect(within(zone).getByAltText('Été Indien')).toHaveAttribute('src', 'https://exemple.fr/2.jpg');
    expect(cartes[0].querySelector('.carte-annee')).toHaveTextContent('2024');
    // Sans affiche ni année
    expect(cartes[1].querySelector('.carte-vide')).toHaveTextContent('?');
    expect(cartes[1].querySelector('.carte-annee')).toHaveTextContent('—');
  });

  it('affiche la sélection même si TMDB échoue', async () => {
    vi.mocked(filmsPopulaires).mockRejectedValue(new Error('Erreur TMDB 401'));
    await demarrer();
    envoyerSelection(SELECTION);

    expect(screen.getByText(MESSAGE_ERREUR)).toBeInTheDocument();
    expect(titresDe(rangee('Sélection Movie Match'))).toEqual(['Été Indien', 'La Cité']);
  });

  it('le cœur ajoute un film de la sélection sans appeler TMDB', async () => {
    await demarrer();
    envoyerSelection(SELECTION);

    fireEvent.click(coeur('Été Indien'));
    await attendre(0);

    expect(acteursDuFilm).not.toHaveBeenCalled();
    expect(ajouterFavori).toHaveBeenCalledWith('u1', [], {
      id: -2,
      titre: 'Été Indien',
      affiche: 'https://exemple.fr/2.jpg',
      annee: '2024',
      genres: ['Drame', 'Science-Fiction'],
      acteurs: ['Alice', 'Bob'],
      note: 0,
    });
  });

  it('le cœur retire un film de la sélection déjà favori', async () => {
    const favoris: Favori[] = [{
      id: -1, titre: 'La Cité', affiche: null, annee: '', genres: [], acteurs: [], note: 0,
    }];
    connecter(favoris);
    await demarrer();
    envoyerSelection(SELECTION);

    expect(coeur('La Cité')).toHaveClass('actif');
    fireEvent.click(coeur('La Cité'));
    await attendre(0);

    expect(retirerFavori).toHaveBeenCalledWith('u1', favoris, -1);
    expect(ajouterFavori).not.toHaveBeenCalled();
  });

  it('bloque les autres cœurs pendant l\'ajout d\'un film de la sélection', async () => {
    let finirAjout: () => void = () => {};
    vi.mocked(ajouterFavori).mockImplementationOnce(() => new Promise<void>((ok) => { finirAjout = ok; }));
    await demarrer();
    envoyerSelection(SELECTION);

    fireEvent.click(coeur('Été Indien'));
    fireEvent.click(coeur('Été Indien'));
    fireEvent.click(coeur('Film 1')); // film TMDB
    await attendre(0);

    expect(coeur('Été Indien')).toBeDisabled();
    expect(ajouterFavori).toHaveBeenCalledTimes(1);

    await act(async () => finirAjout());
    expect(coeur('Été Indien')).not.toBeDisabled();
  });
});
