import { describe, expect, it } from 'vitest';
// Les fichiers sont lus comme du texte (aucun appel à Firebase ni à TMDB)
import regles from '../firestore.rules?raw';
import main from './main.tsx?raw';
import register from './pages/Register.tsx?raw';
import admin from './pages/Admin.tsx?raw';

// Tout le code de l'application, sans les tests
const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const fichiersQuiContiennent = (texte: string) =>
  Object.keys(sources).filter((chemin) => sources[chemin].includes(texte));

// Le bloc "match /users/{uid} { ... }" des règles Firestore
const reglesUsers = regles.slice(regles.indexOf('match /users/{uid}'), regles.indexOf('match /films/{id}'));

describe('cahier des charges — photo prise avec la caméra', () => {
  it('l\'inscription utilise la caméra et jamais la galerie', () => {
    expect(register).toContain('source: CameraSource.Camera');
    expect(register).not.toContain('CameraSource.Photos');
    expect(register).not.toContain('CameraSource.Prompt');
  });

  it('pwa-elements est chargé pour la caméra dans le navigateur', () => {
    expect(main).toContain("from '@ionic/pwa-elements/loader'");
    expect(main).toContain('defineCustomElements(window)');
  });
});

describe('cahier des charges — désactiver un utilisateur sans le supprimer', () => {
  it('deleteDoc n\'est utilisé que sur la collection "films"', () => {
    const collections = Object.values(sources).flatMap((code) =>
      [...code.matchAll(/deleteDoc\(doc\(db,\s*'(\w+)'/g)].map((m) => m[1]),
    );
    const appels = Object.values(sources).reduce((total, code) => total + (code.match(/deleteDoc\(/g) ?? []).length, 0);

    expect(collections).toEqual(['films']);
    // Pas d'autre appel à deleteDoc que celui-ci
    expect(appels).toBe(collections.length);
  });

  it('deleteUser n\'est utilisé qu\'à l\'inscription (annulation d\'une inscription ratée)', () => {
    expect(fichiersQuiContiennent('deleteUser(')).toEqual(['./pages/Register.tsx']);
  });

  it('la page Admin n\'importe aucune fonction de suppression de compte', () => {
    expect(admin).not.toContain('deleteUser');
    expect(admin).not.toContain('deleteDoc');
    expect(admin).toContain('changerActif(');
  });
});

describe('cahier des charges — règles Firestore des profils', () => {
  it('interdisent la suppression d\'un profil', () => {
    expect(reglesUsers).toContain('allow delete: if false;');
  });

  it('un nouveau profil est forcément un membre actif (pas admin)', () => {
    expect(reglesUsers).toMatch(/allow create:[^;]*request\.resource\.data\.role == 'user'/);
    expect(reglesUsers).toMatch(/allow create:[^;]*request\.resource\.data\.actif == true/);
  });

  it('un membre ne peut modifier que ses favoris, et seulement s\'il est actif', () => {
    expect(reglesUsers).toContain("request.auth.uid == uid && estActif() && modifieSeulement(['favoris'])");
  });

  it('l\'admin ne peut modifier que le champ actif, et jamais celui d\'un autre admin', () => {
    expect(reglesUsers).toContain("estAdmin() && resource.data.role != 'admin' && modifieSeulement(['actif'])");
  });

  it('on lit toujours son propre profil, et les autres seulement si on est actif', () => {
    // Son propre profil : à l'inscription (pas encore créé) et pour un compte désactivé
    expect(reglesUsers).toContain('allow read: if connecte() && (request.auth.uid == uid || estActif());');
  });

  it('les films de l\'admin sont interdits aux comptes désactivés', () => {
    const reglesFilms = regles.slice(regles.indexOf('match /films/{id}'));
    expect(reglesFilms).toContain('allow read: if pasDesactive();');
    expect(reglesFilms).toContain('allow write: if estAdmin();');
    // pasDesactive : profil pas encore créé (juste après l'inscription) ou compte actif
    expect(regles).toContain(
      '&& (!exists(/databases/$(database)/documents/users/$(request.auth.uid)) || estActif());',
    );
  });

  it('tout le reste de la base est interdit', () => {
    expect(regles).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
