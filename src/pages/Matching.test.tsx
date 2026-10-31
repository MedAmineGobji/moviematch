import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ecouterUtilisateurs, Utilisateur } from '../catalogue';
import { useAuth } from '../AuthContext';
import type { Favori } from '../favoris';
import Matching from './Matching';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonChange) et n'ouvre pas les overlays.
// On remplace donc IonToggle par une case à cocher et IonModal par un simple dialog.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type PropsToggle = {
    checked?: boolean; children?: React.ReactNode;
    onIonChange?: (e: { detail: { checked: boolean } }) => void;
  };
  const IonToggle = ({ checked, children, onIonChange }: PropsToggle) =>
    createElement('label', null,
      createElement('input', {
        type: 'checkbox',
        checked: !!checked,
        onChange: (e: { target: { checked: boolean } }) => onIonChange?.({ detail: { checked: e.target.checked } }),
      }),
      children);
  type PropsModal = { isOpen?: boolean; children?: React.ReactNode };
  const IonModal = ({ isOpen, children }: PropsModal) =>
    isOpen ? createElement('div', { role: 'dialog' }, children) : null;
  return { ...actual, IonToggle, IonModal };
});
vi.mock('../catalogue', () => ({ ecouterUtilisateurs: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const IMG = 'https://image.tmdb.org/t/p/w342';

const favori = (id: number, genres: string[], acteurs: string[], annee: string): Favori => ({
  id, titre: 'Film ' + id, affiche: '/affiche' + id + '.jpg', annee, genres, acteurs, note: 7,
});

const F1 = favori(1, ['Action'], ['Keanu Reeves'], '1994');
const F2 = favori(2, ['Action', 'Drame'], ['Keanu Reeves', 'Laurence Fishburne'], '1999');
const F3 = favori(3, ['Drame'], ['Laurence Fishburne'], '2005');
const F4 = favori(4, ['Comédie'], ['Omar Sy'], '2008');
const F7 = favori(7, ['Western'], ['Clint Eastwood'], '1966');
const F8 = favori(8, ['Western'], ['Clint Eastwood'], '1964');
const F9 = favori(9, ['Horreur'], ['Toni Collette'], '2018');

const membre = (uid: string, prenom: string, favoris: Favori[], extra: Partial<Utilisateur> = {}): Utilisateur => ({
  uid, prenom, nom: 'Secret', age: 25, photo: '', email: uid + '@cache.fr',
  role: 'user', actif: true, favoris, ...extra,
});

const MOI = membre('moi', 'Marie', [F1, F2, F3], { photo: 'data:image/jpeg;base64,MOI' });
const MEMBRES = [
  MOI,
  membre('u-alice', 'Alice', [F3, F1, F2], { photo: 'data:image/jpeg;base64,ALICE' }), // 100 %
  membre('u-bob', 'Bob', [F2, F3, F4]), // ≈ 74,6 % : sous le seuil, affiché "74,6 %"
  membre('u-chloe', 'Chloé', [F7, F8, F9]), // 0 %
  membre('u-desactive', 'Damien', [F1, F2, F3], { actif: false }),
  membre('u-peu', 'Emma', [F1, F2]),
];

function connecter(favoris: Favori[] = MOI.favoris) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'moi' },
    profil: { ...MOI, favoris },
    loading: false,
    messageDeconnexion: '',
  } as never);
}

const arret = vi.fn();
const envoyer = (liste: Utilisateur[]) =>
  act(() => vi.mocked(ecouterUtilisateurs).mock.calls.at(-1)![0](liste));
const signalerErreur = () =>
  act(() => vi.mocked(ecouterUtilisateurs).mock.calls.at(-1)![1]!(new Error('permission-denied')));

const billets = () => screen.queryAllByRole('button', { name: /^Voir le détail du match avec/ });
const billet = (prenom: string) => screen.getByRole('button', { name: new RegExp(`^Voir le détail du match avec ${prenom} :`) });
const toggle = () => screen.getByRole('checkbox', { name: 'Voir tous les scores' });

// Aucun e-mail d'un autre membre ne doit apparaître dans la page
function verifierAucunEmail(container: HTMLElement) {
  MEMBRES.filter((m) => m.uid !== 'moi').forEach((m) => {
    expect(container).not.toHaveTextContent(m.email);
  });
  expect(document.body.innerHTML).not.toMatch(/@cache\.fr/);
}

beforeEach(() => {
  vi.clearAllMocks();
  connecter();
  vi.mocked(ecouterUtilisateurs).mockReturnValue(arret);
});

describe('Matching — en-tête et états', () => {
  it('affiche le titre et la phrase d\'explication', () => {
    render(<Matching />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tes matchs' })).toBeInTheDocument();
    expect(screen.getByText("Un match, c'est plus de 75 % de goûts en commun.")).toBeInTheDocument();
  });

  it('écoute les membres et se désabonne au démontage', () => {
    const { unmount } = render(<Matching />);
    expect(ecouterUtilisateurs).toHaveBeenCalledTimes(1);

    unmount();
    expect(arret).toHaveBeenCalledTimes(1);
  });

  it('affiche un chargement tant que les membres ne sont pas reçus', () => {
    const { container } = render(<Matching />);

    expect(container.querySelector('ion-spinner')).toBeInTheDocument();
    expect(billets()).toHaveLength(0);
  });

  it('affiche une erreur si la lecture des membres échoue', () => {
    render(<Matching />);
    envoyer([]);
    signalerErreur();

    expect(screen.getByText('Impossible de charger les autres membres. Réessaie plus tard.')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore de match')).not.toBeInTheDocument();
  });
});

describe('Matching — pas assez de favoris', () => {
  it.each([
    [[], 'Il te manque 3 films'],
    [[F1], 'Il te manque 2 films'],
    [[F1, F2], 'Il te manque 1 film '],
  ])('avec %j favoris, dit combien de films il manque', (favoris, texte) => {
    connecter(favoris as Favori[]);
    render(<Matching />);
    envoyer(MEMBRES);

    expect(screen.getByText(new RegExp(texte))).toBeInTheDocument();
    expect(billets()).toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: 'Voir tous les scores' })).not.toBeInTheDocument();
  });
});

describe('Matching — liste des matchs', () => {
  it('n\'affiche que les membres au-dessus de 75 %', () => {
    render(<Matching />);
    envoyer(MEMBRES);

    expect(billets()).toHaveLength(1);
    expect(billet('Alice')).toHaveAccessibleName('Voir le détail du match avec Alice : 100 %');
    // Bob est à 74,6 % : il n'est pas au-dessus du seuil
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Chloé')).not.toBeInTheDocument();
  });

  it('le double billet montre ma moitié, la sienne et le tampon', () => {
    render(<Matching />);
    envoyer(MEMBRES);

    const b = billet('Alice');
    const moities = b.querySelectorAll('.billet-moitie');
    expect(moities).toHaveLength(2);
    expect(moities[0]).toHaveTextContent('Marie');
    expect(within(moities[0] as HTMLElement).getByAltText('Photo de Marie')).toHaveAttribute('src', MOI.photo);
    expect(moities[1]).toHaveTextContent('Alice');
    expect(within(moities[1] as HTMLElement).getByAltText('Photo de Alice')).toBeInTheDocument();
    expect(b.querySelector('.billet-tampon')).toHaveTextContent('100%');
  });

  it('affiche 3 genres en commun au maximum en étiquettes', () => {
    const genres = ['Action', 'Drame', 'Comédie', 'Horreur'];
    const films = [1, 2, 3].map((id) => favori(id, genres, ['Omar Sy'], '2000'));
    connecter(films);
    render(<Matching />);
    envoyer([membre('u-x', 'Xavier', films)]);

    const etiquettes = screen.getByRole('list', { name: 'Genres en commun' });
    expect(within(etiquettes).getAllByRole('listitem')).toHaveLength(3);
  });

  it('ignore les comptes désactivés et ceux qui ont moins de 3 favoris', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    fireEvent.click(toggle());

    expect(screen.queryByText('Damien')).not.toBeInTheDocument();
    expect(screen.queryByText('Emma')).not.toBeInTheDocument();
    // Je ne me vois pas moi-même comme un match
    expect(screen.queryByRole('button', { name: /match avec Marie/ })).not.toBeInTheDocument();
  });

  it('affiche un message encourageant s\'il n\'y a aucun match', () => {
    render(<Matching />);
    envoyer(MEMBRES.filter((m) => m.uid !== 'u-alice'));

    expect(screen.getByText('Pas encore de match')).toBeInTheDocument();
    expect(screen.getByText(/plus tu as de chances de trouver ton binôme de ciné/)).toBeInTheDocument();
    expect(billets()).toHaveLength(0);
  });
});

describe('Matching — "Voir tous les scores"', () => {
  it('affiche aussi les membres sous le seuil, en plus discret et triés', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    expect(toggle()).not.toBeChecked();

    fireEvent.click(toggle());

    expect(toggle()).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Sous le seuil' })).toBeInTheDocument();
    expect(billets().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Voir le détail du match avec Alice : 100 %',
      'Voir le détail du match avec Bob : 74,6 %',
      'Voir le détail du match avec Chloé : 0 %',
    ]);
    expect(billet('Alice').closest('.match')).not.toHaveClass('discret');
    expect(billet('Bob').closest('.match')).toHaveClass('discret');
    expect(billet('Chloé').closest('.match')).toHaveClass('discret');
  });

  it('les masque à nouveau quand on le désactive', () => {
    render(<Matching />);
    envoyer(MEMBRES);

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(billets()).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Sous le seuil' })).not.toBeInTheDocument();
  });
});

describe('Matching — détail d\'un match', () => {
  it('un membre sous le seuil n\'est jamais affiché "75 %"', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    fireEvent.click(toggle());

    // Bob est à 74,63 % : une décimale arrondie vers le bas
    expect(billet('Bob')).toHaveAccessibleName('Voir le détail du match avec Bob : 74,6 %');
    expect(billet('Bob').querySelector('.billet-tampon')).toHaveTextContent('74,6%');
  });

  it('s\'ouvre au toucher et montre les 4 critères avec pourcentage et poids', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    fireEvent.click(toggle());

    fireEvent.click(billet('Bob'));
    const modal = screen.getByRole('dialog');

    expect(within(modal).getByRole('heading', { name: 'Marie & Bob' })).toBeInTheDocument();
    expect(modal).toHaveTextContent('Pas encore un match');
    expect(modal.querySelector('.billet-tampon')).toHaveTextContent('74,6%');

    const barres = within(modal).getAllByRole('progressbar');
    expect(barres.map((b) => b.getAttribute('aria-label'))).toEqual(['Films', 'Genres', 'Acteurs', 'Époque']);
    // Valeurs calculées à la main (voir matching.test.ts)
    expect(barres.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['50', '87', '87', '80']);
    expect(barres[0].querySelector('.critere-remplie')).toHaveStyle({ width: '50%' });

    expect(modal).toHaveTextContent('50 % · poids 30 %');
    expect(modal).toHaveTextContent('86,6 % · poids 30 %');
    expect(modal).toHaveTextContent('86,6 % · poids 25 %');
    expect(modal).toHaveTextContent('80 % · poids 15 %');
  });

  it('montre les films, genres et acteurs en commun', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    fireEvent.click(toggle());

    fireEvent.click(billet('Bob'));
    const modal = screen.getByRole('dialog');

    expect(within(modal).getByRole('heading', { name: 'Films en commun (2)' })).toBeInTheDocument();
    expect(within(modal).getByAltText('Film 2')).toHaveAttribute('src', IMG + '/affiche2.jpg');
    expect(within(modal).getByAltText('Film 3')).toHaveAttribute('src', IMG + '/affiche3.jpg');
    expect(modal.querySelectorAll('.rangee-liste .carte')).toHaveLength(2);
    expect(modal).toHaveTextContent('Action');
    expect(modal).toHaveTextContent('Drame');
    expect(within(modal).getByText('Laurence Fishburne, Keanu Reeves')).toBeInTheDocument();
  });

  it('indique "C\'est un match !" au-dessus du seuil', () => {
    render(<Matching />);
    envoyer(MEMBRES);

    fireEvent.click(billet('Alice'));
    expect(screen.getByRole('dialog')).toHaveTextContent("C'est un match !");
  });

  it('affiche "Aucun" quand il n\'y a rien en commun', () => {
    render(<Matching />);
    envoyer(MEMBRES);
    fireEvent.click(toggle());

    fireEvent.click(billet('Chloé'));
    const modal = screen.getByRole('dialog');

    expect(within(modal).getByText("Aucun film en commun pour l'instant.")).toBeInTheDocument();
    expect(within(modal).getAllByText('Aucun.')).toHaveLength(2);
  });

  it('le bouton fermer ferme le détail', () => {
    render(<Matching />);
    envoyer(MEMBRES);

    fireEvent.click(billet('Alice'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer le détail' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Matching — confidentialité', () => {
  it('n\'affiche jamais l\'e-mail des autres membres (liste, tous les scores, détail)', () => {
    const { container } = render(<Matching />);
    envoyer(MEMBRES);
    verifierAucunEmail(container);

    fireEvent.click(toggle());
    verifierAucunEmail(container);

    fireEvent.click(billet('Alice'));
    verifierAucunEmail(container);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer le détail' }));

    fireEvent.click(billet('Bob'));
    verifierAucunEmail(container);
  });
});

describe('Matching — seuil strictement supérieur à 75 %', () => {
  // Aucun acteur enregistré : score = 0,30 + 0,30 + 0 + 0,15 = 0,75 exactement
  const SANS_ACTEURS = [
    favori(1, ['Drame'], [], '1994'),
    favori(2, ['Drame'], [], '1995'),
    favori(3, ['Drame'], [], '1996'),
  ];

  it('un membre à 75 % pile n\'est pas présenté comme un match', () => {
    connecter(SANS_ACTEURS);
    render(<Matching />);
    envoyer([membre('u-pile', 'Paul', SANS_ACTEURS)]);

    expect(screen.getByText('Pas encore de match')).toBeInTheDocument();
    expect(billets()).toHaveLength(0);

    fireEvent.click(toggle());
    expect(screen.getByRole('heading', { name: 'Sous le seuil' })).toBeInTheDocument();
    fireEvent.click(billet('Paul'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Pas encore un match');
  });
});
