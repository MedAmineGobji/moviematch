import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuth } from './AuthContext';
import App from './App';

// Aucun appel réel à Firebase : le contexte d'authentification est simulé
vi.mock('./AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(),
}));
// Les pages sont remplacées par des marqueurs simples : seul le routage est testé ici
vi.mock('./pages/Films', () => ({ default: () => <div>Page Films</div> }));
vi.mock('./pages/Tab2', () => ({ default: () => <div>Page Favoris</div> }));
vi.mock('./pages/Tab3', () => ({ default: () => <div>Page Matching</div> }));
vi.mock('./pages/Login', () => ({ default: () => <div>Page Login</div> }));
vi.mock('./pages/Register', () => ({ default: () => <div>Page Register</div> }));

function etatAuth(user: { uid: string } | null, loading = false) {
  vi.mocked(useAuth).mockReturnValue({ user, profil: null, loading, messageDeconnexion: '' } as never);
}

function demarrerSur(chemin: string) {
  window.history.pushState({}, '', chemin);
  return render(<App />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App — routage', () => {
  it('affiche un spinner pendant le chargement de l\'authentification', () => {
    etatAuth(null, true);
    const { container } = demarrerSur('/tabs/films');

    expect(container.querySelector('ion-spinner')).toBeInTheDocument();
    expect(screen.queryByText('Page Login')).not.toBeInTheDocument();
    expect(screen.queryByText('Page Films')).not.toBeInTheDocument();
  });

  it.each(['/', '/tabs/films', '/tabs/favoris', '/tabs/matching'])(
    'redirige un utilisateur non connecté de %s vers /login',
    async (chemin) => {
      etatAuth(null);
      demarrerSur(chemin);

      expect(await screen.findByText('Page Login')).toBeInTheDocument();
      await waitFor(() => expect(window.location.pathname).toBe('/login'));
      expect(screen.queryByText('Page Films')).not.toBeInTheDocument();
    },
  );

  it('laisse un utilisateur non connecté accéder à /register', async () => {
    etatAuth(null);
    demarrerSur('/register');

    expect(await screen.findByText('Page Register')).toBeInTheDocument();
  });

  it('un utilisateur connecté voit les onglets Films / Favoris / Matching', async () => {
    etatAuth({ uid: 'u1' });
    demarrerSur('/tabs/films');

    expect(await screen.findByText('Page Films')).toBeInTheDocument();
    expect(screen.getByText('Films')).toBeInTheDocument();
    expect(screen.getByText('Favoris')).toBeInTheDocument();
    expect(screen.getByText('Matching')).toBeInTheDocument();
    expect(screen.queryByText('Page Login')).not.toBeInTheDocument();
  });

  it.each(['/', '/login', '/register'])(
    'redirige un utilisateur connecté de %s vers /tabs/films',
    async (chemin) => {
      etatAuth({ uid: 'u1' });
      demarrerSur(chemin);

      expect(await screen.findByText('Page Films')).toBeInTheDocument();
      await waitFor(() => expect(window.location.pathname).toBe('/tabs/films'));
    },
  );

  it.each([
    ['/tabs/favoris', 'Page Favoris'],
    ['/tabs/matching', 'Page Matching'],
  ])('un utilisateur connecté accède à %s', async (chemin, page) => {
    etatAuth({ uid: 'u1' });
    demarrerSur(chemin);

    expect(await screen.findByText(page)).toBeInTheDocument();
  });
});
