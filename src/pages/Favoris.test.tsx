import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '../AuthContext';
import { retirerFavori, Favori } from '../favoris';
import Favoris from './Favoris';

// Sous Vitest, les overlays Ionic ne s'ouvrent pas : IonToast devient un simple message
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type PropsToast = { isOpen?: boolean; message?: string };
  const IonToast = ({ isOpen, message }: PropsToast) =>
    isOpen ? createElement('div', { role: 'status' }, message) : null;
  return { ...actual, IonToast };
});
// Aucun appel réel à Firebase
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../favoris', () => ({ retirerFavori: vi.fn(() => Promise.resolve()) }));

const favori = (id: number, titre: string, genres: string[], acteurs: string[], annee: string): Favori => ({
  id, titre, affiche: id > 0 ? '/affiche' + id + '.jpg' : null, annee, genres, acteurs, note: 7.5,
});

const MATRIX = favori(603, 'Matrix', ['Action', 'Science-Fiction'], ['Keanu Reeves'], '1999');
const SPEED = favori(1637, 'Speed', ['Action'], ['Keanu Reeves', 'Sandra Bullock'], '1994');
const MAISON = favori(-1, 'Film de l\'admin', ['Drame'], ['Omar Sy'], '2011');

function connecter(uid: string, favoris: Favori[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid },
    profil: { prenom: 'Marie', favoris },
    loading: false,
    messageDeconnexion: '',
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Favoris — playlist personnelle', () => {
  it('affiche un message quand la liste est vide', () => {
    connecter('u1', []);
    render(<Favoris />);

    expect(screen.getByText('Ta liste est vide')).toBeInTheDocument();
  });

  it('affiche les films du profil connecté, y compris ceux de l\'admin', () => {
    connecter('u1', [MATRIX, SPEED, MAISON]);
    render(<Favoris />);

    expect(screen.getByRole('heading', { name: 'Matrix' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Speed' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Film de l\'admin' })).toBeInTheDocument();
    expect(screen.getByAltText('Matrix')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w342/affiche603.jpg');
    expect(screen.getAllByRole('button', { name: 'Retirer des favoris' })).toHaveLength(3);
  });

  it('calcule les statistiques à partir des genres, acteurs et années', () => {
    connecter('u1', [MATRIX, SPEED]);
    render(<Favoris />);

    expect(screen.getByText('Tickets').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Genre fétiche').nextSibling).toHaveTextContent('Action');
    expect(screen.getByText('Acteur fétiche').nextSibling).toHaveTextContent('Keanu Reeves');
    expect(screen.getByText('Décennie').nextSibling).toHaveTextContent('1990s');
  });

  it('retire un film de la liste de l\'utilisateur connecté uniquement', async () => {
    connecter('u-marie', [MATRIX, SPEED]);
    render(<Favoris />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer des favoris' })[1]);

    await waitFor(() => expect(retirerFavori).toHaveBeenCalledWith('u-marie', [MATRIX, SPEED], 1637));
    expect(retirerFavori).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Retiré de ta liste');
  });

  it('affiche une erreur si le retrait échoue', async () => {
    vi.mocked(retirerFavori).mockRejectedValueOnce(new Error('permission-denied'));
    connecter('u1', [MATRIX]);
    render(<Favoris />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer des favoris' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Erreur, réessaie.');
  });
});
