import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, updateDoc } from 'firebase/firestore';
import { ajouterFavori, retirerFavori, Favori } from './favoris';

vi.mock('./firebase', () => ({ auth: {}, db: { nom: 'db-mock' } }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...chemin: string[]) => ({ chemin: chemin.join('/') })),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

const favori = (id: number, titre = 'Film ' + id): Favori => ({
  id,
  titre,
  affiche: null,
  annee: '2020',
  genres: ['Action'],
  acteurs: ['Acteur'],
  note: 7.5,
});

beforeEach(() => {
  vi.mocked(doc).mockClear();
  vi.mocked(updateDoc).mockClear();
});

describe('favoris.ts', () => {
  it('ajouterFavori ajoute le film à la fin de la liste', async () => {
    const actuels = [favori(1), favori(2)];
    const nouveau = favori(3, 'Nouveau');

    await ajouterFavori('uid-123', actuels, nouveau);

    expect(doc).toHaveBeenCalledWith({ nom: 'db-mock' }, 'users', 'uid-123');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { chemin: 'users/uid-123' },
      { favoris: [favori(1), favori(2), nouveau] },
    );
  });

  it('ajouterFavori ne modifie pas le tableau reçu', async () => {
    const actuels = [favori(1)];
    await ajouterFavori('uid', actuels, favori(2));
    expect(actuels).toEqual([favori(1)]);
  });

  it('ajouterFavori fonctionne avec une liste vide', async () => {
    await ajouterFavori('uid', [], favori(9));
    expect(updateDoc).toHaveBeenCalledWith({ chemin: 'users/uid' }, { favoris: [favori(9)] });
  });

  it('retirerFavori retire uniquement le film avec le bon id', async () => {
    const actuels = [favori(1), favori(2), favori(3)];

    await retirerFavori('uid-123', actuels, 2);

    expect(doc).toHaveBeenCalledWith({ nom: 'db-mock' }, 'users', 'uid-123');
    expect(updateDoc).toHaveBeenCalledWith(
      { chemin: 'users/uid-123' },
      { favoris: [favori(1), favori(3)] },
    );
  });

  it('retirerFavori laisse la liste intacte si l\'id est absent', async () => {
    await retirerFavori('uid', [favori(1)], 42);
    expect(updateDoc).toHaveBeenCalledWith({ chemin: 'users/uid' }, { favoris: [favori(1)] });
  });

  it('propage l\'erreur de Firestore', async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(ajouterFavori('uid', [], favori(1))).rejects.toThrow('permission-denied');
  });
});
