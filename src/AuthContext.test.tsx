import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('./firebase', () => ({ auth: { nom: 'auth-mock' }, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...chemin: string[]) => chemin.join('/')),
  onSnapshot: vi.fn(),
}));

type CallbackAuth = (u: { uid: string } | null) => void;
type CallbackSnap = (snap: { exists: () => boolean; data: () => unknown }) => void;

const stopAuth = vi.fn();
const stopProfil = vi.fn();

// Récupère le dernier callback enregistré auprès de Firebase
const callbackAuth = () => vi.mocked(onAuthStateChanged).mock.calls.at(-1)![1] as unknown as CallbackAuth;
const callbackSnap = () => vi.mocked(onSnapshot).mock.calls.at(-1)![1] as unknown as CallbackSnap;
const callbackErreur = () => vi.mocked(onSnapshot).mock.calls.at(-1)![2] as unknown as (e: Error) => void;

const snap = (data: object | null) => ({ exists: () => data !== null, data: () => data });

const PROFIL = {
  nom: 'Dupont', prenom: 'Marie', age: 25, photo: '', email: 'm@d.fr',
  role: 'user', actif: true, favoris: [],
};

function Sonde() {
  const { user, profil, loading, messageDeconnexion } = useAuth();
  return (
    <div data-testid="etat">
      {JSON.stringify({ uid: user?.uid ?? null, nom: profil?.nom ?? null, loading, messageDeconnexion })}
    </div>
  );
}

const MESSAGE_DESACTIVE = "Ton compte a été désactivé par l'administrateur.";

// messageDeconnexion n'est vérifié que dans ses tests dédiés
const lireEtat = () => JSON.parse(screen.getByTestId('etat').textContent!);
const etat = () => {
  const { uid, nom, loading } = lireEtat();
  return { uid, nom, loading };
};
const message = () => lireEtat().messageDeconnexion;

function monter() {
  return render(
    <AuthProvider>
      <Sonde />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onAuthStateChanged).mockReturnValue(stopAuth);
  vi.mocked(onSnapshot).mockReturnValue(stopProfil);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthContext', () => {
  it('est en chargement tant que Firebase n\'a pas répondu', () => {
    monter();
    expect(etat()).toEqual({ uid: null, nom: null, loading: true });
  });

  it('user et profil sont null quand l\'utilisateur est déconnecté', () => {
    monter();
    act(() => callbackAuth()(null));

    expect(etat()).toEqual({ uid: null, nom: null, loading: false });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('charge le profil Firestore quand l\'utilisateur est connecté', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));

    expect(onSnapshot).toHaveBeenCalledWith('users/u1', expect.any(Function), expect.any(Function));

    act(() => callbackSnap()(snap(PROFIL)));
    expect(etat()).toEqual({ uid: 'u1', nom: 'Dupont', loading: false });
  });

  it('met à jour le profil en temps réel', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap(PROFIL)));
    act(() => callbackSnap()(snap({ ...PROFIL, nom: 'Martin' })));

    expect(etat().nom).toBe('Martin');
  });

  it('profil null si le document Firestore n\'existe pas', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap(null)));

    expect(etat()).toEqual({ uid: 'u1', nom: null, loading: false });
  });

  it('déconnecte automatiquement si actif === false', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap({ ...PROFIL, actif: false })));

    expect(signOut).toHaveBeenCalledWith({ nom: 'auth-mock' });
    expect(etat().nom).toBeNull();
  });

  it('déconnecte si le compte est désactivé pendant la session', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap(PROFIL)));
    expect(signOut).not.toHaveBeenCalled();

    act(() => callbackSnap()(snap({ ...PROFIL, actif: false })));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('arrête l\'écoute du profil précédent quand l\'utilisateur change', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackAuth()(null));

    expect(stopProfil).toHaveBeenCalledTimes(1);
    expect(etat()).toEqual({ uid: null, nom: null, loading: false });
  });

  it('se désabonne de Auth et Firestore au démontage', () => {
    const { unmount } = monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    unmount();

    expect(stopAuth).toHaveBeenCalledTimes(1);
    expect(stopProfil).toHaveBeenCalledTimes(1);
  });

  // Bug A : sans callback d'erreur, loading restait à true si Firestore refusait la lecture.
  it('sort du chargement si la lecture du profil échoue', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));

    const erreur = new Error('permission-denied');
    act(() => callbackErreur()(erreur));
    expect(etat()).toEqual({ uid: 'u1', nom: null, loading: false });
    expect(console.error).toHaveBeenCalledWith(erreur);
  });

  it('le profil repasse à null si la lecture échoue après un premier chargement', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap(PROFIL)));
    act(() => callbackErreur()(new Error('unavailable')));

    expect(etat().nom).toBeNull();
  });

  // Bug E : l'app ne doit pas s'ouvrir avant que le profil soit chargé
  it('repasse en chargement à la connexion tant que le profil n\'est pas reçu', () => {
    monter();
    act(() => callbackAuth()(null));
    expect(etat().loading).toBe(false);

    act(() => callbackAuth()({ uid: 'u1' }));
    expect(etat()).toEqual({ uid: 'u1', nom: null, loading: true });

    act(() => callbackSnap()(snap(PROFIL)));
    expect(etat().loading).toBe(false);
  });

  it('n\'arrête pas deux fois la même écoute du profil', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackAuth()(null));
    act(() => callbackAuth()(null));

    expect(stopProfil).toHaveBeenCalledTimes(1);
  });
});

describe('AuthContext — messageDeconnexion', () => {
  it('est vide par défaut', () => {
    monter();
    expect(message()).toBe('');
  });

  it('contient le message de compte désactivé quand actif === false', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap({ ...PROFIL, actif: false })));

    expect(message()).toBe(MESSAGE_DESACTIVE);
    expect(signOut).toHaveBeenCalledWith({ nom: 'auth-mock' });
  });

  it('reste affiché après la déconnexion (pour la page Login)', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap({ ...PROFIL, actif: false })));
    act(() => callbackAuth()(null));

    expect(message()).toBe(MESSAGE_DESACTIVE);
  });

  it('est remis à vide quand un profil actif est chargé', () => {
    monter();
    act(() => callbackAuth()({ uid: 'u1' }));
    act(() => callbackSnap()(snap({ ...PROFIL, actif: false })));
    act(() => callbackAuth()(null));

    act(() => callbackAuth()({ uid: 'u2' }));
    act(() => callbackSnap()(snap(PROFIL)));
    expect(message()).toBe('');
  });
});
