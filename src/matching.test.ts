import { describe, expect, it } from 'vitest';
import {
  calculerMatching, cosinus, decennie, frequences, jaccard, trouverMatchs,
  MIN_FAVORIS, POIDS, SEUIL_MATCH,
} from './matching';
import type { Favori } from './favoris';
import type { Utilisateur } from './catalogue';

const favori = (id: number, genres: string[], acteurs: string[], annee: string): Favori => ({
  id, titre: 'Film ' + id, affiche: null, annee, genres, acteurs, note: 7,
});

// Les films de l'exemple calculé à la main
const F1 = favori(1, ['Action'], ['X'], '1994');
const F2 = favori(2, ['Action', 'Drame'], ['X', 'Y'], '1999');
const F3 = favori(3, ['Drame'], ['Y'], '2005');
const F4 = favori(4, ['Comédie'], ['Z'], '2008');

const membre = (uid: string, favoris: Favori[], extra: Partial<Utilisateur> = {}): Utilisateur => ({
  uid, nom: 'Test', prenom: uid, age: 20, photo: '', email: uid + '@test.fr',
  role: 'user', actif: true, favoris, ...extra,
});

describe('constantes', () => {
  it('les poids valent 30 / 30 / 25 / 15 % et font 1 au total', () => {
    expect(POIDS).toEqual({ films: 0.3, genres: 0.3, acteurs: 0.25, epoque: 0.15 });
    expect(POIDS.films + POIDS.genres + POIDS.acteurs + POIDS.epoque).toBeCloseTo(1);
  });

  it('seuil de 75 % et 3 favoris minimum', () => {
    expect(SEUIL_MATCH).toBe(0.75);
    expect(MIN_FAVORIS).toBe(3);
  });
});

describe('jaccard', () => {
  it('intersection / union', () => {
    expect(jaccard([1, 2, 3], [2, 3, 4])).toBe(0.5);
    expect(jaccard(['a'], ['a', 'b', 'c', 'd'])).toBe(0.25);
  });

  it('1 pour deux ensembles identiques, 0 sans élément commun', () => {
    expect(jaccard([1, 2], [2, 1])).toBe(1);
    expect(jaccard([1, 2], [3, 4])).toBe(0);
  });

  it('0 si les deux ensembles sont vides, 0 si un seul est vide', () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard([1], [])).toBe(0);
  });

  it('ignore les doublons', () => {
    expect(jaccard([1, 1, 2], [2, 2])).toBe(0.5);
  });
});

describe('frequences', () => {
  it('compte les occurrences', () => {
    expect(frequences(['Action', 'Drame', 'Action', 'Action'])).toEqual({ Action: 3, Drame: 1 });
  });

  it('liste vide → objet vide, et ignore les valeurs vides', () => {
    expect(frequences([])).toEqual({});
    expect(frequences(['', 'A', ''])).toEqual({ A: 1 });
  });
});

describe('cosinus', () => {
  it('1 pour les mêmes proportions, même si les quantités diffèrent', () => {
    expect(cosinus({ A: 1, B: 2 }, { A: 1, B: 2 })).toBeCloseTo(1, 10);
    expect(cosinus({ A: 1, B: 2 }, { A: 3, B: 6 })).toBeCloseTo(1, 10);
  });

  it('0 sans valeur commune', () => {
    expect(cosinus({ A: 2 }, { B: 5 })).toBe(0);
  });

  it('cas calculé à la main : (2×1 + 2×2) / (√8 × √6) ≈ 0,866', () => {
    expect(cosinus({ Action: 2, Drame: 2 }, { Action: 1, Drame: 2, Comedie: 1 })).toBeCloseTo(6 / Math.sqrt(48), 10);
    expect(cosinus({ Action: 2, Drame: 2 }, { Action: 1, Drame: 2, Comedie: 1 })).toBeCloseTo(0.866, 3);
  });

  it('est symétrique', () => {
    const a = { A: 3, B: 1 };
    const b = { A: 1, C: 2 };
    expect(cosinus(a, b)).toBeCloseTo(cosinus(b, a), 12);
  });

  it('0 si l\'un des deux est vide', () => {
    expect(cosinus({}, { A: 1 })).toBe(0);
    expect(cosinus({ A: 1 }, {})).toBe(0);
    expect(cosinus({}, {})).toBe(0);
  });
});

describe('decennie', () => {
  it.each([
    ['1994', '1990s'],
    ['2000', '2000s'],
    ['2009', '2000s'],
    ['1888', '1880s'],
    [' 2015 ', '2010s'],
  ])('%s → %s', (annee, attendu) => {
    expect(decennie(annee)).toBe(attendu);
  });

  it.each(['', '   ', 'abcd', '94', '19945', '0994', '20a4'])('"%s" → null', (annee) => {
    expect(decennie(annee)).toBeNull();
  });

  it('null si l\'année est absente', () => {
    expect(decennie(undefined)).toBeNull();
    expect(decennie(null)).toBeNull();
  });
});

describe('calculerMatching', () => {
  it('listes identiques → tous les critères et le score valent 1', () => {
    const r = calculerMatching([F1, F2, F3], [F3, F1, F2]);

    expect(r.films).toBe(1);
    expect(r.genres).toBeCloseTo(1, 10);
    expect(r.acteurs).toBeCloseTo(1, 10);
    expect(r.epoque).toBeCloseTo(1, 10);
    expect(r.score).toBeCloseTo(1, 10);
    expect(r.filmsCommuns.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('aucun point commun → tous les critères et le score valent 0', () => {
    const a = [favori(1, ['Action'], ['X'], '1994')];
    const b = [favori(2, ['Comédie'], ['Z'], '2010')];
    const r = calculerMatching(a, b);

    expect(r).toEqual({
      score: 0, films: 0, genres: 0, acteurs: 0, epoque: 0,
      filmsCommuns: [], genresCommuns: [], acteursCommuns: [],
    });
  });

  it('listes vides → 0 partout (pas de division par zéro)', () => {
    const r = calculerMatching([], []);
    expect(r.score).toBe(0);
    expect(Number.isNaN(r.genres)).toBe(false);
  });

  // Exemple de la présentation :
  // A = {F1, F2, F3}, B = {F2, F3, F4}
  //   films  : communs {2, 3} / union {1, 2, 3, 4} = 2/4 = 0,5
  //   genres : A {Action 2, Drame 2}, B {Action 1, Drame 2, Comédie 1} → 6 / (√8 × √6) ≈ 0,866
  //   acteurs: A {X 2, Y 2},          B {X 1, Y 2, Z 1}                 → 6 / (√8 × √6) ≈ 0,866
  //   époque : A {1990s 2, 2000s 1},  B {1990s 1, 2000s 2}              → 4 / (√5 × √5) = 0,8
  //   score  = 0,30×0,5 + 0,30×0,866 + 0,25×0,866 + 0,15×0,8 ≈ 0,746 → juste sous le seuil
  it('cas intermédiaire calculé à la main (juste sous le seuil)', () => {
    const r = calculerMatching([F1, F2, F3], [F2, F3, F4]);
    const cos = 6 / Math.sqrt(48);

    expect(r.films).toBe(0.5);
    expect(r.genres).toBeCloseTo(cos, 10);
    expect(r.acteurs).toBeCloseTo(cos, 10);
    expect(r.epoque).toBeCloseTo(0.8, 10);
    expect(r.score).toBeCloseTo(0.3 * 0.5 + 0.3 * cos + 0.25 * cos + 0.15 * 0.8, 10);
    expect(r.score).toBeCloseTo(0.7463, 4);
    expect(r.score).toBeLessThan(SEUIL_MATCH);
    expect(r.filmsCommuns.map((f) => f.id)).toEqual([2, 3]);
  });

  // A = {F1, F2, F3}, B = {F1, F2, F3, F4} → score ≈ 0,886 : c'est un match
  it('cas intermédiaire au-dessus du seuil', () => {
    const r = calculerMatching([F1, F2, F3], [F1, F2, F3, F4]);

    expect(r.films).toBe(0.75);
    expect(r.genres).toBeCloseTo(8 / (Math.sqrt(8) * 3), 10);
    expect(r.epoque).toBeCloseTo(6 / (Math.sqrt(5) * Math.sqrt(8)), 10);
    expect(r.score).toBeCloseTo(0.8858, 4);
    expect(r.score).toBeGreaterThan(SEUIL_MATCH);
  });

  it('applique les poids : seul le critère "films" compte → score = 0,30', () => {
    // Même film (id 1) mais sans genres, acteurs ni année exploitables
    const a = [favori(1, [], [], '')];
    const b = [favori(1, [], [], '')];
    const r = calculerMatching(a, b);

    expect(r.films).toBe(1);
    expect(r.genres + r.acteurs + r.epoque).toBe(0);
    expect(r.score).toBeCloseTo(POIDS.films, 10);
  });

  it('applique les poids : seule l\'époque compte → score = 0,15', () => {
    const r = calculerMatching([favori(1, [], [], '1994')], [favori(2, [], [], '1997')]);
    expect(r.score).toBeCloseTo(POIDS.epoque, 10);
  });

  it('les scores restent entre 0 et 1', () => {
    const r = calculerMatching([F1, F2, F2, F3], [F1, F2, F3]);
    [r.score, r.films, r.genres, r.acteurs, r.epoque].forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('genres et acteurs en commun triés du plus fréquent au moins fréquent', () => {
    const a = [
      favori(1, ['Drame', 'Action'], ['Y'], '2000'),
      favori(2, ['Action', 'Horreur'], ['X', 'Y'], '2001'),
      favori(3, ['Action', 'Comédie'], ['X'], '2002'),
    ];
    const b = [
      favori(4, ['Action', 'Drame'], ['X'], '2003'),
      favori(5, ['Drame', 'Western'], ['Y', 'X'], '2004'),
      favori(6, ['Comédie'], ['X'], '2005'),
    ];
    const r = calculerMatching(a, b);

    // Action 3+1 = 4, Drame 1+2 = 3, Comédie 1+1 = 2 ; Horreur et Western ne sont pas communs
    expect(r.genresCommuns).toEqual(['Action', 'Drame', 'Comédie']);
    // X 2+3 = 5, Y 2+1 = 3
    expect(r.acteursCommuns).toEqual(['X', 'Y']);
  });

  it('limite les genres en commun à 5', () => {
    const genres = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const r = calculerMatching([favori(1, genres, [], '')], [favori(2, genres, [], '')]);
    expect(r.genresCommuns).toHaveLength(5);
  });
});

describe('trouverMatchs', () => {
  const moi = { uid: 'moi', favoris: [F1, F2, F3] };

  it('ignore moi-même, les comptes désactivés et ceux qui ont moins de 3 favoris', () => {
    const autres = [
      membre('moi', [F1, F2, F3]),
      membre('desactive', [F1, F2, F3], { actif: false }),
      membre('deux-films', [F1, F2]),
      membre('ok', [F2, F3, F4]),
    ];

    const matchs = trouverMatchs(moi, autres);

    expect(matchs.map((m) => m.utilisateur.uid)).toEqual(['ok']);
  });

  it('accepte un membre qui a exactement 3 favoris', () => {
    expect(trouverMatchs(moi, [membre('trois', [F1, F2, F4])])).toHaveLength(1);
  });

  it('ne plante pas si un membre n\'a pas de liste de favoris', () => {
    const sansFavoris = { ...membre('vide', []), favoris: undefined } as unknown as Utilisateur;
    expect(trouverMatchs(moi, [sansFavoris])).toEqual([]);
  });

  it('calcule le matching et trie du meilleur score au moins bon', () => {
    const autres = [
      membre('loin', [favori(7, ['Western'], ['W'], '1960'), favori(8, ['Western'], ['W'], '1962'), F4]),
      membre('identique', [F1, F2, F3]),
      membre('proche', [F2, F3, F4]),
    ];

    const matchs = trouverMatchs(moi, autres);

    expect(matchs.map((m) => m.utilisateur.uid)).toEqual(['identique', 'proche', 'loin']);
    expect(matchs[0].score).toBeCloseTo(1, 10);
    expect(matchs[1].score).toBeCloseTo(0.7463, 4);
    expect(matchs[1]).toEqual(expect.objectContaining(calculerMatching(moi.favoris, [F2, F3, F4])));
  });

  it('ne modifie pas la liste reçue', () => {
    const autres = [membre('b', [F2, F3, F4]), membre('a', [F1, F2, F3])];
    trouverMatchs(moi, autres);
    expect(autres.map((u) => u.uid)).toEqual(['b', 'a']);
  });
});

describe('seuil de 75 % (cahier des charges : strictement supérieur)', () => {
  // Mêmes films, mêmes genres, même époque, mais aucun acteur enregistré :
  // score = 0,30×1 + 0,30×1 + 0,25×0 + 0,15×1 = 0,75 exactement
  const sansActeurs = [
    favori(1, ['Drame'], [], '1994'),
    favori(2, ['Drame'], [], '1995'),
    favori(3, ['Drame'], [], '1996'),
  ];

  it('un score de 0,75 exactement n\'est pas un match', () => {
    const r = calculerMatching(sansActeurs, sansActeurs);

    expect(r.acteurs).toBe(0);
    expect(r.score).toBe(0.75);
    expect(r.score > SEUIL_MATCH).toBe(false);
  });

  it('un membre désactivé est exclu même avec des goûts identiques', () => {
    const autres = [membre('desactive', [F1, F2, F3], { actif: false })];
    expect(trouverMatchs({ uid: 'moi', favoris: [F1, F2, F3] }, autres)).toEqual([]);
  });
});
