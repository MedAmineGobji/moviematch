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
vi.mock('./pages/Favoris', () => ({ default: () => <div>Page Favoris</div> }));
vi.mock('./pages/Matching', () => ({ default: () => <div>Page Matching</div> }));
vi.mock('./pages/Profil', () => ({ default: () => <div>Page Profil</div> }));
vi.mock('./pages/Admin', () => ({ default: () => <div>Page Admin</div> }));
vi.mock('./pages/Login', () => ({ default: () => <div>Page Login</div> }));
vi.mock('./pages/Register', () => ({ default: () => <div>Page Register</div> }));

function etatAuth(user: { uid: string } | null, loading = false, role?: 'user' | 'admin') {
  vi.mocked(useAuth).mockReturnValue({
    user, profil: role ? { role } : null, loading, messageDeconnexion: '',
  } as never);
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
    ['/tabs/profil', 'Page Profil'],
  ])('un utilisateur connecté accède à %s', async (chemin, page) => {
    etatAuth({ uid: 'u1' });
    demarrerSur(chemin);

    expect(await screen.findByText(page)).toBeInTheDocument();
  });
});

describe('App — onglet Admin', () => {
  // Les libellés des onglets sont dans des ion-label : on cherche les boutons d'onglet
  const ongletAdmin = (container: HTMLElement) => container.querySelector('ion-tab-button[tab="admin"]');

  it('un admin voit l\'onglet Admin', async () => {
    etatAuth({ uid: 'a1' }, false, 'admin');
    const { container } = demarrerSur('/tabs/films');

    await screen.findByText('Page Films');
    expect(ongletAdmin(container)).toBeInTheDocument();
    expect(ongletAdmin(container)).toHaveAttribute('href', '/tabs/admin');
  });

  it.each([
    ['un membre', 'user' as const],
    ['un profil pas encore chargé', undefined],
  ])('%s ne voit pas l\'onglet Admin', async (_cas, role) => {
    etatAuth({ uid: 'u1' }, false, role);
    const { container } = demarrerSur('/tabs/films');

    await screen.findByText('Page Films');
    expect(ongletAdmin(container)).not.toBeInTheDocument();
    expect(container.querySelector('ion-tab-button[tab="profil"]')).toBeInTheDocument();
  });

  it('un admin accède à /tabs/admin', async () => {
    etatAuth({ uid: 'a1' }, false, 'admin');
    demarrerSur('/tabs/admin');

    expect(await screen.findByText('Page Admin')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/tabs/admin');
  });

  it('un membre qui ouvre /tabs/admin est redirigé vers /tabs/films', async () => {
    etatAuth({ uid: 'u1' }, false, 'user');
    demarrerSur('/tabs/admin');

    expect(await screen.findByText('Page Films')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/tabs/films'));
    expect(screen.queryByText('Page Admin')).not.toBeInTheDocument();
  });

  it('un visiteur non connecté qui ouvre /tabs/admin est redirigé vers /login', async () => {
    etatAuth(null);
    demarrerSur('/tabs/admin');

    expect(await screen.findByText('Page Login')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByText('Page Admin')).not.toBeInTheDocument();
  });
});
