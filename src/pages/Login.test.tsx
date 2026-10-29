import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '../AuthContext';
import Login from './Login';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonInput). On remplace donc IonInput
// par un simple <input> qui appelle onIonInput comme le ferait Ionic.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type Props = { label?: string; type?: string; value?: string; onIonInput?: (e: unknown) => void };
  const IonInput = ({ label, type, value, onIonInput }: Props) =>
    createElement('input', {
      'aria-label': label,
      type,
      value: value ?? '',
      onChange: (e: { target: { value: string } }) => onIonInput?.({ detail: { value: e.target.value } }),
    });
  return { ...actual, IonInput };
});
vi.mock('../firebase', () => ({ auth: { nom: 'auth-mock' }, db: {} }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock('../AuthContext', () => ({ useAuth: vi.fn() }));

const MESSAGE_DESACTIVE = "Ton compte a été désactivé par l'administrateur.";

function saisir(label: string, valeur: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } });
}

function remplirEtValider(email = 'a@b.fr', mdp = 'secret') {
  saisir('E-mail', email);
  saisir('Mot de passe', mdp);
  fireEvent.click(screen.getByText('Se connecter'));
}

function contexte(messageDeconnexion = '') {
  vi.mocked(useAuth).mockReturnValue({
    user: null, profil: null, loading: false, messageDeconnexion,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  contexte();
});

describe('Login', () => {
  it('affiche le formulaire de connexion', () => {
    render(<Login />);

    expect(screen.getByText('🎬 Movie Match')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'password');
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
    expect(screen.getByText("Pas de compte ? S'inscrire")).toBeInTheDocument();
  });

  it('appelle Firebase avec l\'e-mail (sans espaces) et le mot de passe saisis', async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: { uid: 'u1' } } as never);
    render(<Login />);

    remplirEtValider('  test@exemple.fr ', 'motdepasse');

    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      { nom: 'auth-mock' }, 'test@exemple.fr', 'motdepasse',
    ));
    expect(screen.queryByText(/incorrect|désactivé|impossible/i)).not.toBeInTheDocument();
  });

  it.each([
    ['auth/invalid-credential', 'E-mail ou mot de passe incorrect.'],
    ['auth/invalid-email', "L'adresse e-mail n'est pas valide."],
    ['auth/too-many-requests', 'Trop de tentatives. Réessaie dans quelques minutes.'],
    ['auth/network-request-failed', 'Pas de connexion internet.'],
    ['auth/inconnu', 'Connexion impossible, réessaie.'],
  ])('traduit l\'erreur Firebase %s', async (code, message) => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({ code });
    render(<Login />);

    remplirEtValider();

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('affiche un message générique si l\'erreur n\'a pas de code', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue(new Error('x'));
    render(<Login />);

    remplirEtValider();

    expect(await screen.findByText('Connexion impossible, réessaie.')).toBeInTheDocument();
  });

  it('affiche messageDeconnexion venant de AuthContext (compte désactivé)', () => {
    contexte(MESSAGE_DESACTIVE);
    render(<Login />);

    expect(screen.getByText(MESSAGE_DESACTIVE)).toBeInTheDocument();
  });

  it('l\'erreur locale est prioritaire sur messageDeconnexion', async () => {
    contexte(MESSAGE_DESACTIVE);
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({ code: 'auth/invalid-credential' });
    render(<Login />);

    remplirEtValider();

    expect(await screen.findByText('E-mail ou mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.queryByText(MESSAGE_DESACTIVE)).not.toBeInTheDocument();
  });

  it('efface l\'ancienne erreur lors d\'une nouvelle tentative réussie', async () => {
    vi.mocked(signInWithEmailAndPassword)
      .mockRejectedValueOnce({ code: 'auth/invalid-credential' })
      .mockResolvedValueOnce({ user: { uid: 'u3' } } as never);
    render(<Login />);

    remplirEtValider();
    await screen.findByText('E-mail ou mot de passe incorrect.');

    fireEvent.click(screen.getByText('Se connecter'));
    await waitFor(() =>
      expect(screen.queryByText('E-mail ou mot de passe incorrect.')).not.toBeInTheDocument(),
    );
  });
});
