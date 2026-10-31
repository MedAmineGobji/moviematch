import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ajouterFilmMaison, changerActif, ecouterFilmsMaison, ecouterUtilisateurs,
  supprimerFilmMaison, FilmMaison, Utilisateur,
} from '../catalogue';
import { useAuth } from '../AuthContext';
import { listeGenres } from '../tmdb';
import Admin from './Admin';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonInput, onIonChange). On remplace donc
// les composants de formulaire par des éléments HTML simples qui appellent ces
// callbacks comme le ferait Ionic.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement, Children, cloneElement, isValidElement } = await import('react');
  type PropsChamp = { label?: string; type?: string; value?: string; onIonInput?: (e: unknown) => void };
  const champ = (balise: string) => ({ label, type, value, onIonInput }: PropsChamp) =>
    createElement(balise, {
      'aria-label': label,
      type,
      value: value ?? '',
      onChange: (e: { target: { value: string } }) => onIonInput?.({ detail: { value: e.target.value } }),
    });
  type PropsToggle = {
    checked?: boolean; disabled?: boolean; 'aria-label'?: string;
    onIonChange?: (e: { detail: { checked: boolean } }) => void;
  };
  const IonToggle = ({ checked, disabled, onIonChange, ...reste }: PropsToggle) =>
    createElement('input', {
      type: 'checkbox',
      'aria-label': reste['aria-label'],
      checked: !!checked,
      disabled,
      onChange: (e: { target: { checked: boolean } }) => onIonChange?.({ detail: { checked: e.target.checked } }),
    });
  type PropsSegment = {
    value?: string; children?: React.ReactNode;
    onIonChange?: (e: { detail: { value: string } }) => void;
  };
  const IonSegment = ({ value, onIonChange, children }: PropsSegment) =>
    createElement('div', { role: 'tablist' }, Children.map(children, (enfant) =>
      isValidElement<{ value: string }>(enfant)
        ? cloneElement(enfant as React.ReactElement<{ value: string; choisi?: boolean; choisir?: () => void }>, {
          choisi: enfant.props.value === value,
          choisir: () => onIonChange?.({ detail: { value: enfant.props.value } }),
        })
        : enfant,
    ));
  type PropsBouton = { choisi?: boolean; choisir?: () => void; children?: React.ReactNode };
  const IonSegmentButton = ({ choisi, choisir, children }: PropsBouton) =>
    createElement('button', { role: 'tab', 'aria-selected': choisi, onClick: choisir }, children);
  type PropsToast = { isOpen?: boolean; message?: string };
  const IonToast = ({ isOpen, message }: PropsToast) =>
    isOpen ? createElement('div', { role: 'status' }, message) : null;
  type PropsSelect = {
    label?: string; value?: string[]; disabled?: boolean; children?: React.ReactNode;
    onIonChange?: (e: { detail: { value: string[] } }) => void;
  };
  const IonSelect = ({ label, value, disabled, children, onIonChange }: PropsSelect) =>
    createElement('select', {
      'aria-label': label,
      multiple: true,
      value: value ?? [],
      disabled,
      onChange: (e: { target: { selectedOptions: ArrayLike<{ value: string }> } }) =>
        onIonChange?.({ detail: { value: Array.from(e.target.selectedOptions, (o) => o.value) } }),
    }, children);
  const IonSelectOption = ({ value, children }: { value?: string; children?: React.ReactNode }) =>
    createElement('option', { value }, children);
  return {
    ...actual,
    IonInput: champ('input'),
    IonTextarea: champ('textarea'),
    IonToggle,
    IonSegment,
    IonSegmentButton,
    IonToast,
    IonSelect,
    IonSelectOption,
  };
});
// Aucun appel réel à TMDB : seule la liste des genres est simulée
vi.mock('../tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tmdb')>()),
  listeGenres: vi.fn(),
}));
vi.mock('../catalogue', () => ({
  ecouterFilmsMaison: vi.fn(),
  ecouterUtilisateurs: vi.fn(),
  ajouterFilmMaison: vi.fn(() => Promise.resolve(-1)),
  supprimerFilmMaison: vi.fn(() => Promise.resolve()),
  changerActif: vi.fn(() => Promise.resolve()),
}));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const MESSAGE_AIDE = /Les genres viennent de TMDB/;
const MESSAGE_ERREUR_GENRES = 'Impossible de charger les genres TMDB. Vérifie ta connexion et ta clé TMDB.';
const GENRES = { 28: 'Action', 35: 'Comédie', 18: 'Drame', 878: 'Science-Fiction' };
const arretFilms = vi.fn();
const arretUtilisateurs = vi.fn();

// Envoie une liste de films / d'utilisateurs comme le ferait Firestore
const envoyerFilms = (films: FilmMaison[]) =>
  act(() => vi.mocked(ecouterFilmsMaison).mock.calls.at(-1)![0](films));
const envoyerUtilisateurs = (liste: Utilisateur[]) =>
  act(() => vi.mocked(ecouterUtilisateurs).mock.calls.at(-1)![0](liste));

const filmMaison = (id: number, titre: string): FilmMaison => ({
  id, titre, affiche: null, annee: '2023', genres: ['Drame', 'Comédie'],
  acteurs: ['A', 'B'], note: 0, synopsis: '', creeLe: -id,
});

const membre = (uid: string, prenom: string, extra: Partial<Utilisateur> = {}): Utilisateur => ({
  uid, prenom, nom: 'Test', age: 30, photo: '', email: prenom.toLowerCase() + '@test.fr',
  role: 'user', actif: true, favoris: [], ...extra,
});

function saisir(label: string, valeur: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } });
}

const listeDesGenres = () => screen.getByLabelText('Genres') as HTMLSelectElement;

// Choisit des genres dans la liste, une fois qu'elle est chargée depuis TMDB
async function choisirGenres(...noms: string[]) {
  await screen.findByRole('option', { name: 'Drame' });
  Array.from(listeDesGenres().options).forEach((option) => {
    option.selected = noms.includes(option.value);
  });
  fireEvent.change(listeDesGenres());
}

async function remplirFormulaire() {
  saisir('Titre', 'Mon film');
  await choisirGenres('Drame');
}

const valider = () => fireEvent.click(screen.getByText('Ajouter à la sélection'));
// Le segment est dans ion-header (que Testing Library considère comme caché) et son
// texte est dans un ion-label : on retrouve donc les onglets directement dans le DOM
const onglet = (nom: string) =>
  Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === nom)!;
const allerSurUtilisateurs = () => fireEvent.click(onglet('Utilisateurs'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'admin-1' }, profil: { role: 'admin' }, loading: false, messageDeconnexion: '',
  } as never);
  vi.mocked(ecouterFilmsMaison).mockReturnValue(arretFilms);
  vi.mocked(ecouterUtilisateurs).mockReturnValue(arretUtilisateurs);
  vi.mocked(listeGenres).mockResolvedValue(GENRES);
});

describe('Admin — films', () => {
  it('affiche le formulaire et le message d\'aide sur les genres', () => {
    render(<Admin />);

    expect(onglet('Films')).toHaveAttribute('aria-selected', 'true');
    ['Titre', 'Année', 'Genres', 'Acteurs (séparés par des virgules)',
      "Lien de l'affiche (https)", 'Synopsis'].forEach((label) => {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });
    expect(screen.getByText(MESSAGE_AIDE)).toBeInTheDocument();
    expect(screen.getByText("Aucun film ajouté pour l'instant.")).toBeInTheDocument();
  });

  it('ajoute un film avec les champs nettoyés puis vide le formulaire', async () => {
    render(<Admin />);
    saisir('Titre', '  Mon film  ');
    saisir('Année', '2024');
    await choisirGenres('Drame', 'Science-Fiction');
    saisir('Acteurs (séparés par des virgules)', 'Alice,  Bob ');
    saisir("Lien de l'affiche (https)", ' https://exemple.fr/a.jpg ');
    saisir('Synopsis', '  Une histoire.  ');
    valider();

    await waitFor(() => expect(ajouterFilmMaison).toHaveBeenCalledTimes(1));
    expect(ajouterFilmMaison).toHaveBeenCalledWith({
      titre: 'Mon film',
      affiche: 'https://exemple.fr/a.jpg',
      annee: '2024',
      genres: ['Drame', 'Science-Fiction'],
      acteurs: ['Alice', 'Bob'],
      note: 0,
      synopsis: 'Une histoire.',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Film ajouté à la sélection');
    expect(screen.getByLabelText('Titre')).toHaveValue('');
    expect(Array.from(listeDesGenres().selectedOptions)).toEqual([]);
  });

  it('accepte un film sans année, acteurs, affiche ni synopsis', async () => {
    render(<Admin />);
    await remplirFormulaire();
    valider();

    await waitFor(() => expect(ajouterFilmMaison).toHaveBeenCalledWith({
      titre: 'Mon film', affiche: null, annee: '', genres: ['Drame'], acteurs: [], note: 0, synopsis: '',
    }));
  });

  it.each([
    ['le titre est vide', 'Titre', '   ', 'Le titre est obligatoire.'],
    ['l\'année est trop ancienne', 'Année', '1887', "L'année doit être comprise entre 1888 et 2100."],
    ['l\'année est trop lointaine', 'Année', '2101', "L'année doit être comprise entre 1888 et 2100."],
    ['l\'année n\'est pas entière', 'Année', '1999.5', "L'année doit être comprise entre 1888 et 2100."],
    ['l\'affiche est en http', "Lien de l'affiche (https)", 'http://exemple.fr/a.jpg',
      "Le lien de l'affiche doit commencer par https://"],
    ['l\'affiche n\'est pas un lien', "Lien de l'affiche (https)", 'affiche.jpg',
      "Le lien de l'affiche doit commencer par https://"],
  ])('refuse le film si %s', async (_cas, label, valeur, message) => {
    render(<Admin />);
    await remplirFormulaire();
    saisir(label, valeur);
    valider();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(ajouterFilmMaison).not.toHaveBeenCalled();
  });

  it('refuse le film si aucun genre n\'est choisi', async () => {
    render(<Admin />);
    saisir('Titre', 'Mon film');
    await choisirGenres();
    valider();

    expect(screen.getByText('Ajoute au moins un genre.')).toBeInTheDocument();
    expect(ajouterFilmMaison).not.toHaveBeenCalled();
  });

  it('propose les genres TMDB en français, triés, une fois chargés', async () => {
    let finir: (g: Record<number, string>) => void = () => {};
    vi.mocked(listeGenres).mockImplementationOnce(() => new Promise((ok) => { finir = ok; }));
    render(<Admin />);

    // Liste désactivée tant que TMDB n'a pas répondu
    expect(listeDesGenres()).toBeDisabled();
    await act(async () => finir(GENRES));

    expect(listeDesGenres()).toBeEnabled();
    expect(Array.from(listeDesGenres().options).map((o) => o.value))
      .toEqual(['Action', 'Comédie', 'Drame', 'Science-Fiction']);
    expect(listeGenres).toHaveBeenCalledTimes(1);
  });

  it('affiche une erreur si la liste des genres ne charge pas', async () => {
    vi.mocked(listeGenres).mockRejectedValueOnce(new Error('x'));
    render(<Admin />);

    expect(await screen.findByText(MESSAGE_ERREUR_GENRES)).toBeInTheDocument();
    expect(listeDesGenres()).toBeDisabled();
  });

  it.each(['1888', '2100'])('accepte l\'année limite %s', async (annee) => {
    render(<Admin />);
    await remplirFormulaire();
    saisir('Année', annee);
    valider();

    await waitFor(() => expect(ajouterFilmMaison).toHaveBeenCalledWith(expect.objectContaining({ annee })));
  });

  it('affiche une erreur claire si l\'ajout échoue et garde le formulaire', async () => {
    vi.mocked(ajouterFilmMaison).mockRejectedValueOnce(new Error('permission-denied'));
    render(<Admin />);
    await remplirFormulaire();
    valider();

    expect(await screen.findByText(/Impossible d'ajouter le film/)).toBeInTheDocument();
    expect(screen.getByLabelText('Titre')).toHaveValue('Mon film');
  });

  it('affiche les films ajoutés en tickets', () => {
    const { container } = render(<Admin />);
    envoyerFilms([filmMaison(-2, 'Récent'), filmMaison(-1, 'Ancien')]);

    const tickets = container.querySelectorAll('.ticket');
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toHaveTextContent('Récent');
    expect(tickets[0]).toHaveTextContent('SÉLECTION');
    expect(tickets[0]).toHaveTextContent('Drame · Comédie');
    expect(tickets[1]).toHaveTextContent('Ancien');
    expect(screen.getByText('Sélection Movie Match (2)')).toBeInTheDocument();
  });

  it('la poubelle supprime le film et affiche une confirmation', async () => {
    render(<Admin />);
    envoyerFilms([filmMaison(-2, 'Récent'), filmMaison(-1, 'Ancien')]);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Ancien' }));

    await waitFor(() => expect(supprimerFilmMaison).toHaveBeenCalledWith(-1));
    expect(supprimerFilmMaison).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('« Ancien » supprimé de la sélection');
  });

  it('affiche un message si la suppression échoue', async () => {
    vi.mocked(supprimerFilmMaison).mockRejectedValueOnce(new Error('x'));
    render(<Admin />);
    envoyerFilms([filmMaison(-1, 'Ancien')]);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Ancien' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Impossible de supprimer le film');
  });

  it('se désabonne de Firestore au démontage', () => {
    const { unmount } = render(<Admin />);
    unmount();

    expect(arretFilms).toHaveBeenCalledTimes(1);
    expect(arretUtilisateurs).toHaveBeenCalledTimes(1);
  });
});

describe('Admin — utilisateurs', () => {
  const MEMBRES = [
    membre('admin-1', 'Moi', { role: 'admin' }),
    membre('admin-2', 'Autre', { role: 'admin' }),
    membre('u1', 'Alice'),
    membre('u2', 'Bob', { actif: false }),
  ];

  function afficherMembres() {
    const rendu = render(<Admin />);
    envoyerUtilisateurs(MEMBRES);
    allerSurUtilisateurs();
    return rendu;
  }

  const toggle = (prenom: string) => screen.getByRole('checkbox', { name: `Actif ${prenom} Test` });

  it('liste les membres avec photo, nom, e-mail et étiquettes', () => {
    const { container } = afficherMembres();

    expect(screen.getByText('Membres (4)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Titre')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Test')).toBeInTheDocument();
    expect(screen.getByText('alice@test.fr')).toBeInTheDocument();
    expect(screen.getAllByText('ADMIN')).toHaveLength(2);
    expect(screen.getAllByText('DÉSACTIVÉ')).toHaveLength(1);

    // Bob est désactivé : affiché en semi-transparent
    const lignes = container.querySelectorAll('.membre');
    expect(lignes[3]).toHaveClass('desactive');
    expect(lignes[2]).not.toHaveClass('desactive');
    expect(container.querySelectorAll('.membre-photo')).toHaveLength(4);
  });

  it('le toggle reflète l\'état actif de chaque membre', () => {
    afficherMembres();

    expect(toggle('Alice')).toBeChecked();
    expect(toggle('Bob')).not.toBeChecked();
  });

  it('le toggle est désactivé pour l\'admin connecté et pour les autres admins', () => {
    afficherMembres();

    expect(toggle('Moi')).toBeDisabled();
    expect(toggle('Autre')).toBeDisabled();
    expect(toggle('Alice')).not.toBeDisabled();
    expect(toggle('Bob')).not.toBeDisabled();
  });

  it('désactive un membre et affiche une confirmation', async () => {
    afficherMembres();

    fireEvent.click(toggle('Alice'));

    await waitFor(() => expect(changerActif).toHaveBeenCalledWith('u1', false));
    expect(await screen.findByRole('status')).toHaveTextContent('Compte de Alice Test désactivé');
  });

  it('réactive un membre désactivé', async () => {
    afficherMembres();

    fireEvent.click(toggle('Bob'));

    await waitFor(() => expect(changerActif).toHaveBeenCalledWith('u2', true));
    expect(await screen.findByRole('status')).toHaveTextContent('Compte de Bob Test réactivé');
  });

  it('affiche un message si la modification échoue', async () => {
    vi.mocked(changerActif).mockRejectedValueOnce(new Error('permission-denied'));
    afficherMembres();

    fireEvent.click(toggle('Alice'));
    expect(await screen.findByRole('status')).toHaveTextContent('Impossible de modifier ce compte');
  });

  it('revient au formulaire avec l\'onglet Films', () => {
    afficherMembres();
    fireEvent.click(onglet('Films'));

    expect(screen.getByLabelText('Titre')).toBeInTheDocument();
  });
});
