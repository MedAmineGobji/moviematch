import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  ajouterFilmMaison, changerActif, ecouterFilmsMaison, ecouterUtilisateurs, supprimerFilmMaison,
} from './catalogue';

vi.mock('./firebase', () => ({ auth: {}, db: { nom: 'db-mock' } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, nom: string) => ({ collection: nom })),
  doc: vi.fn((_db: unknown, ...chemin: string[]) => ({ chemin: chemin.join('/') })),
  query: vi.fn((source: object, ...contraintes: object[]) => ({ ...source, contraintes })),
  orderBy: vi.fn((champ: string, sens: string) => ({ orderBy: champ, sens })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

type CallbackSnap = (snap: { docs: { id: string; data: () => unknown }[] }) => void;
type CallbackErreur = (e: Error) => void;

const desabonner = vi.fn();
const callbackSnap = () => vi.mocked(onSnapshot).mock.calls.at(-1)![1] as unknown as CallbackSnap;
const callbackErreur = () => vi.mocked(onSnapshot).mock.calls.at(-1)![2] as unknown as CallbackErreur;

const documents = (...liste: [string, object][]) => ({
  docs: liste.map(([id, data]) => ({ id, data: () => data })),
});

const FILM = {
  titre: 'Mon film', affiche: null, annee: '2024', genres: ['Drame'],
  acteurs: ['Moi'], note: 0, synopsis: 'Une histoire.',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onSnapshot).mockReturnValue(desabonner);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('catalogue.ts — films de l\'admin', () => {
  it('ecouterFilmsMaison écoute "films" trié par creeLe décroissant', () => {
    const arret = ecouterFilmsMaison(vi.fn());

    expect(collection).toHaveBeenCalledWith({ nom: 'db-mock' }, 'films');
    expect(orderBy).toHaveBeenCalledWith('creeLe', 'desc');
    expect(query).toHaveBeenCalledWith({ collection: 'films' }, { orderBy: 'creeLe', sens: 'desc' });
    expect(onSnapshot).toHaveBeenCalledWith(
      { collection: 'films', contraintes: [{ orderBy: 'creeLe', sens: 'desc' }] },
      expect.any(Function),
      expect.any(Function),
    );
    // Renvoie la fonction de désabonnement
    expect(arret).toBe(desabonner);
  });

  it('ecouterFilmsMaison transmet les films reçus', () => {
    const rappel = vi.fn();
    ecouterFilmsMaison(rappel);

    const film = { ...FILM, id: -2, creeLe: 2 };
    callbackSnap()(documents(['-2', film]));
    expect(rappel).toHaveBeenCalledWith([film]);
  });

  it('ecouterFilmsMaison renvoie une liste vide en cas d\'erreur', () => {
    const rappel = vi.fn();
    ecouterFilmsMaison(rappel);

    callbackErreur()(new Error('permission-denied'));
    expect(rappel).toHaveBeenCalledWith([]);
  });

  it('ajouterFilmMaison crée films/{id} avec un id négatif et la date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const id = await ajouterFilmMaison(FILM);

    expect(id).toBe(-1_700_000_000_000);
    expect(doc).toHaveBeenCalledWith({ nom: 'db-mock' }, 'films', '-1700000000000');
    expect(setDoc).toHaveBeenCalledWith(
      { chemin: 'films/-1700000000000' },
      { ...FILM, id: -1_700_000_000_000, creeLe: 1_700_000_000_000 },
    );
  });

  it('ajouterFilmMaison propage l\'erreur de Firestore', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(ajouterFilmMaison(FILM)).rejects.toThrow('permission-denied');
  });

  it('supprimerFilmMaison supprime le bon document', async () => {
    await supprimerFilmMaison(-42);

    expect(doc).toHaveBeenCalledWith({ nom: 'db-mock' }, 'films', '-42');
    expect(deleteDoc).toHaveBeenCalledWith({ chemin: 'films/-42' });
  });
});

describe('catalogue.ts — utilisateurs', () => {
  it('ecouterUtilisateurs écoute "users" et ajoute l\'uid à chaque profil', () => {
    const rappel = vi.fn();
    const arret = ecouterUtilisateurs(rappel);

    expect(collection).toHaveBeenCalledWith({ nom: 'db-mock' }, 'users');
    expect(arret).toBe(desabonner);

    callbackSnap()(documents(['u1', { nom: 'Dupont', actif: true }], ['u2', { nom: 'Martin', actif: false }]));
    expect(rappel).toHaveBeenCalledWith([
      { uid: 'u1', nom: 'Dupont', actif: true },
      { uid: 'u2', nom: 'Martin', actif: false },
    ]);
  });

  it('ecouterUtilisateurs renvoie une liste vide en cas d\'erreur', () => {
    const rappel = vi.fn();
    ecouterUtilisateurs(rappel);

    callbackErreur()(new Error('permission-denied'));
    expect(rappel).toHaveBeenCalledWith([]);
  });

  it('ecouterUtilisateurs prévient surErreur si la lecture échoue', () => {
    const rappel = vi.fn();
    const surErreur = vi.fn();
    ecouterUtilisateurs(rappel, surErreur);

    const erreur = new Error('permission-denied');
    callbackErreur()(erreur);
    expect(rappel).toHaveBeenCalledWith([]);
    expect(surErreur).toHaveBeenCalledWith(erreur);
  });

  it.each([true, false])('changerActif(%s) ne modifie que le champ actif', async (actif) => {
    await changerActif('u2', actif);

    expect(doc).toHaveBeenCalledWith({ nom: 'db-mock' }, 'users', 'u2');
    expect(updateDoc).toHaveBeenCalledWith({ chemin: 'users/u2' }, { actif });
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});
