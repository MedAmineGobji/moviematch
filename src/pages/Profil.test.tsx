import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { signOut } from 'firebase/auth';
import { useAuth } from '../AuthContext';
import Profil from './Profil';

vi.mock('../firebase', () => ({ auth: { nom: 'auth-mock' }, db: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn(() => Promise.resolve()) }));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const MENTION = "Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'abcdefgh1234', metadata: { creationTime: '2026-01-15T10:00:00Z' } },
    profil: {
      nom: 'Dupont', prenom: 'Marie', age: 25, photo: 'data:image/jpeg;base64,AAAA',
      email: 'marie@exemple.fr', role: 'user', actif: true, favoris: [],
    },
    loading: false,
    messageDeconnexion: '',
  } as never);
});

describe('Profil', () => {
  it('affiche la carte de membre', () => {
    render(<Profil />);

    expect(screen.getByAltText('Photo de profil')).toBeInTheDocument();
    expect(screen.getByText('marie@exemple.fr')).toBeInTheDocument();
    expect(screen.getByText('N° ABCDEFGH')).toBeInTheDocument();
    expect(screen.getByText('MEMBRE')).toBeInTheDocument();
  });

  it('affiche la mention obligatoire TMDB en bas de la page', () => {
    const { container } = render(<Profil />);

    const mention = screen.getByText(MENTION);
    expect(mention).toHaveClass('mention-tmdb');
    // Dernier élément du contenu, après le bouton de déconnexion
    const contenu = container.querySelector('ion-content')!;
    expect(contenu.lastElementChild).toBe(mention);
  });

  it('le bouton "Se déconnecter" appelle signOut', () => {
    render(<Profil />);
    fireEvent.click(screen.getByText('Se déconnecter'));

    expect(signOut).toHaveBeenCalledWith({ nom: 'auth-mock' });
  });
});
