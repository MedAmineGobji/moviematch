import { useEffect, useState } from 'react';
import {
  IonPage, IonContent, IonSearchbar, IonSpinner, IonText, IonIcon, IonToast,
  IonButton, IonModal,
} from '@ionic/react';
import {
  add, checkmark, chevronBack, close, heart, heartOutline, informationCircleOutline, search,
} from 'ionicons/icons';
import {
  filmsPopulaires, filmsMieuxNotes, filmsAVenir, rechercherFilms, listeGenres, acteursDuFilm,
  urlAffiche, urlFond, estNouveau, FilmTMDB,
} from '../tmdb';
import { ajouterFavori, retirerFavori, Favori } from '../favoris';
import { ecouterFilmsMaison, FilmMaison } from '../catalogue';
import { useAuth } from '../AuthContext';
import './Films.css';

const MESSAGE_ERREUR = 'Impossible de charger les films. Vérifie ta clé TMDB.';

// Un film affiché sur la page : soit un film TMDB, soit un film de la sélection de l'admin
type Choix = { type: 'tmdb'; film: FilmTMDB } | { type: 'maison'; film: FilmMaison };

// Pour comparer les titres sans tenir compte des majuscules ni des accents
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const versTMDB = (film: FilmTMDB): Choix => ({ type: 'tmdb', film });
const versMaison = (film: FilmMaison): Choix => ({ type: 'maison', film });

const Films: React.FC = () => {
  const { user, profil } = useAuth();
  // Accueil
  const [populaires, setPopulaires] = useState<FilmTMDB[]>([]);
  const [mieuxNotes, setMieuxNotes] = useState<FilmTMDB[]>([]);
  const [aVenir, setAVenir] = useState<FilmTMDB[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  // Recherche
  const [modeRecherche, setModeRecherche] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<FilmTMDB[]>([]);
  const [chargementRecherche, setChargementRecherche] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState('');
  // Détail d'un film
  const [detail, setDetail] = useState<Choix | null>(null);
  const [acteursDetail, setActeursDetail] = useState<string[] | null>(null);

  const [filmsMaison, setFilmsMaison] = useState<FilmMaison[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState<number | null>(null);

  const mesFavoris: Favori[] = profil?.favoris ?? [];
  const estDansMaListe = (id: number) => mesFavoris.some((f) => f.id === id);

  // Les films de la sélection de l'admin, filtrés par la recherche
  const texteRecherche = normaliser(recherche);
  const selection = texteRecherche
    ? filmsMaison.filter((f) => normaliser(f.titre).includes(texteRecherche))
    : filmsMaison;

  // Charger la liste des genres une seule fois
  useEffect(() => {
    listeGenres().then(setGenres).catch(() => {});
  }, []);

  // Écouter les films ajoutés par l'admin
  useEffect(() => ecouterFilmsMaison(setFilmsMaison), []);

  // Charger les rangées de l'accueil (une liste qui échoue n'empêche pas les autres)
  useEffect(() => {
    let annule = false;
    Promise.allSettled([filmsPopulaires(), filmsMieuxNotes(), filmsAVenir()]).then(([p, m, v]) => {
      if (annule) return;
      if (p.status === 'fulfilled') setPopulaires(p.value);
      if (m.status === 'fulfilled') setMieuxNotes(m.value);
      if (v.status === 'fulfilled') setAVenir(v.value);
      if ([p, m, v].some((r) => r.status === 'rejected')) setErreur(MESSAGE_ERREUR);
      setChargement(false);
    });
    return () => {
      annule = true;
    };
  }, []);

  // Lancer la recherche TMDB 400 ms après la dernière saisie
  useEffect(() => {
    const texte = recherche.trim();
    if (!texte) {
      setResultats([]);
      setErreurRecherche('');
      setChargementRecherche(false);
      return;
    }
    // Passe à true si la recherche change : on ignore alors la réponse obsolète
    let annule = false;
    const minuteur = setTimeout(async () => {
      setChargementRecherche(true);
      setErreurRecherche('');
      try {
        const resultat = await rechercherFilms(texte);
        if (!annule) setResultats(resultat);
      } catch {
        if (!annule) setErreurRecherche(MESSAGE_ERREUR);
      }
      if (!annule) setChargementRecherche(false);
    }, 400);

    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [recherche]);

  // Charger les acteurs à l'ouverture du détail d'un film TMDB
  useEffect(() => {
    if (detail?.type !== 'tmdb') return;
    let annule = false;
    acteursDuFilm(detail.film.id)
      .then((acteurs) => {
        if (!annule) setActeursDetail(acteurs);
      })
      .catch(() => {
        if (!annule) setActeursDetail([]);
      });
    return () => {
      annule = true;
    };
  }, [detail]);

  // Ajouter ou retirer un film des favoris.
  // preparer() construit le favori à enregistrer (appelé seulement pour un ajout).
  const basculerFavori = async (idFilm: number, preparer: () => Promise<Favori>) => {
    if (!user || enCours !== null) return;
    const dejaFavori = mesFavoris.some((f) => f.id === idFilm);

    setEnCours(idFilm);
    try {
      if (dejaFavori) {
        await retirerFavori(user.uid, mesFavoris, idFilm);
        setMessage('Retiré de ta liste');
      } else {
        await ajouterFavori(user.uid, mesFavoris, await preparer());
        setMessage('Ajouté à ta liste 🎟️');
      }
    } catch {
      setMessage('Erreur, réessaie.');
    } finally {
      setEnCours(null);
    }
  };

  // Un film TMDB : on va chercher les acteurs (sauf s'ils sont déjà chargés dans le détail)
  const basculerFilmTMDB = (film: FilmTMDB) =>
    basculerFavori(film.id, async () => {
      // Liste des genres pas encore chargée : on l'attend, pour ne jamais enregistrer
      // un favori sans ses genres (si TMDB échoue, l'ajout échoue avec un message)
      let nomsGenres = genres;
      if (Object.keys(nomsGenres).length === 0) {
        nomsGenres = await listeGenres();
        setGenres(nomsGenres);
      }
      return {
        id: film.id,
        titre: film.title,
        affiche: film.poster_path,
        annee: film.release_date ? film.release_date.slice(0, 4) : '',
        genres: (film.genre_ids ?? []).map((id) => nomsGenres[id]).filter(Boolean),
        acteurs:
          detail?.type === 'tmdb' && detail.film.id === film.id && acteursDetail
            ? acteursDetail
            : await acteursDuFilm(film.id).catch(() => []),
        note: film.vote_average ?? 0,
      };
    });

  // Un film de la sélection : il a déjà ses genres et ses acteurs
  const basculerFilmMaison = (film: FilmMaison) =>
    basculerFavori(film.id, async () => ({
      id: film.id,
      titre: film.titre,
      affiche: film.affiche,
      annee: film.annee,
      genres: film.genres ?? [],
      acteurs: film.acteurs ?? [],
      note: film.note ?? 0,
    }));

  const basculer = (choix: Choix) =>
    choix.type === 'tmdb' ? basculerFilmTMDB(choix.film) : basculerFilmMaison(choix.film);

  // Les informations affichées, quelle que soit l'origine du film
  const infos = (choix: Choix) => {
    if (choix.type === 'tmdb') {
      const film = choix.film;
      return {
        id: film.id,
        titre: film.title,
        affiche: film.poster_path,
        fond: urlFond(film.backdrop_path) ?? urlAffiche(film.poster_path),
        annee: film.release_date ? film.release_date.slice(0, 4) : '',
        genres: (film.genre_ids ?? []).map((id) => genres[id]).filter(Boolean),
        note: film.vote_average ?? 0,
        synopsis: film.overview ?? '',
        nouveau: estNouveau(film.release_date),
      };
    }
    const film = choix.film;
    return {
      id: film.id,
      titre: film.titre,
      affiche: film.affiche,
      fond: urlAffiche(film.affiche),
      annee: film.annee,
      genres: film.genres ?? [],
      note: film.note ?? 0,
      synopsis: film.synopsis ?? '',
      nouveau: false,
    };
  };

  const ouvrirDetail = (choix: Choix) => {
    setActeursDetail(null);
    setDetail(choix);
  };

  const fermerRecherche = () => {
    setModeRecherche(false);
    setRecherche('');
  };

  // Bouton jaune "Ma liste" / "Dans ma liste"
  const boutonMaListe = (choix: Choix) => {
    const { id } = choix.film;
    const dansMaListe = estDansMaListe(id);
    return (
      <IonButton onClick={() => basculer(choix)} disabled={enCours === id}>
        <IonIcon slot="start" icon={dansMaListe ? checkmark : add} aria-hidden="true" />
        {dansMaListe ? 'Dans ma liste' : 'Ma liste'}
      </IonButton>
    );
  };

  // Carte d'affiche (rangées et grille de recherche)
  const carte = (choix: Choix) => {
    const f = infos(choix);
    const dansMaListe = estDansMaListe(f.id);
    const lien = urlAffiche(f.affiche);
    return (
      <div className="carte" key={choix.type + '-' + f.id}>
        <div className="carte-affiche">
          <button
            className="carte-ouvrir"
            onClick={() => ouvrirDetail(choix)}
            aria-label={'Voir le détail de ' + f.titre}
          >
            {lien ? (
              <img src={lien} alt={f.titre} loading="lazy" />
            ) : (
              <span className="carte-vide" aria-hidden="true">?</span>
            )}
          </button>
          {f.nouveau && <span className="etiquette-nouveau">Nouveau</span>}
          <button
            className={'carte-coeur' + (dansMaListe ? ' actif' : '')}
            onClick={() => basculer(choix)}
            disabled={enCours === f.id}
            aria-pressed={dansMaListe}
            aria-label={dansMaListe ? `Retirer ${f.titre} de ma liste` : `Ajouter ${f.titre} à ma liste`}
          >
            <IonIcon icon={dansMaListe ? heart : heartOutline} aria-hidden="true" />
          </button>
        </div>
        <h3 className="carte-titre">{f.titre}</h3>
        <p className="carte-annee">{f.annee || '—'}</p>
      </div>
    );
  };

  // Rangée horizontale avec un titre (masquée si elle est vide)
  const rangee = (id: string, titre: string, choix: Choix[]) =>
    choix.length > 0 && (
      <section className="rangee" aria-labelledby={id}>
        <h2 className="rangee-titre" id={id}>
          {titre} <span className="chevron" aria-hidden="true">›</span>
        </h2>
        <div className="rangee-liste">{choix.map(carte)}</div>
      </section>
    );

  // Bannière : le premier film populaire
  const vedette = populaires[0] ? versTMDB(populaires[0]) : null;
  const banniere = () => {
    if (!vedette) return null;
    const f = infos(vedette);
    const ligne = [f.annee, f.genres.slice(0, 3).join(', '), '★ ' + f.note.toFixed(1)].filter(Boolean).join(' · ');
    return (
      <section className="banniere" aria-labelledby="banniere-titre">
        {f.fond && <img className="banniere-fond" src={f.fond} alt="" />}
        <div className="banniere-degrade" />
        <div className="banniere-contenu">
          <h2 className="banniere-titre" id="banniere-titre">{f.titre}</h2>
          <p className="banniere-infos">{ligne}</p>
          <div className="banniere-boutons">
            {boutonMaListe(vedette)}
            <IonButton className="bouton-secondaire" onClick={() => ouvrirDetail(vedette)}>
              <IonIcon slot="start" icon={informationCircleOutline} aria-hidden="true" />
              Détails
            </IonButton>
          </div>
        </div>
      </section>
    );
  };

  // Contenu du détail d'un film
  const contenuDetail = (choix: Choix) => {
    const f = infos(choix);
    const lien = urlAffiche(f.affiche);
    const acteurs = choix.type === 'maison' ? (choix.film.acteurs ?? []) : acteursDetail;
    return (
      <IonContent className="detail">
        <div className="detail-haut">
          {f.fond && <img className="detail-fond" src={f.fond} alt="" />}
          <div className="detail-degrade" />
          <button className="bouton-rond detail-fermer" onClick={() => setDetail(null)} aria-label="Fermer le détail">
            <IonIcon icon={close} aria-hidden="true" />
          </button>
        </div>

        <div className="detail-corps">
          <div className="detail-entete">
            {lien ? (
              <img className="detail-affiche" src={lien} alt={'Affiche de ' + f.titre} />
            ) : (
              <div className="detail-affiche vide" aria-hidden="true">?</div>
            )}
            <div className="detail-titres">
              <h2 className="detail-titre">{f.titre}</h2>
              <p className="detail-infos">
                {f.annee || '—'} · <span className="detail-note">★ {f.note.toFixed(1)}</span>
              </p>
              {f.genres.length > 0 && <p className="detail-infos">{f.genres.join(' · ')}</p>}
            </div>
          </div>

          {boutonMaListe(choix)}

          <h3 className="detail-section">Synopsis</h3>
          <p className="detail-texte">{f.synopsis || 'Pas de synopsis disponible.'}</p>

          <h3 className="detail-section">Acteurs principaux</h3>
          <p className="detail-texte">
            {acteurs === null
              ? 'Chargement des acteurs…'
              : acteurs.length > 0
                ? acteurs.join(', ')
                : 'Acteurs non disponibles.'}
          </p>
        </div>
      </IonContent>
    );
  };

  const resultatsAffiches = [
    ...selection.map(versMaison),
    ...(chargementRecherche || !recherche.trim() ? [] : resultats.map(versTMDB)),
  ];

  return (
    <IonPage>
      <IonContent>
        {modeRecherche ? (
          <div className="films-recherche">
            <div className="recherche-barre">
              <button className="bouton-rond" onClick={fermerRecherche} aria-label="Revenir à l'accueil">
                <IonIcon icon={chevronBack} aria-hidden="true" />
              </button>
              <IonSearchbar
                placeholder="Rechercher un film"
                value={recherche}
                onIonInput={(e) => setRecherche(e.detail.value ?? '')}
              />
            </div>

            {chargementRecherche && (
              <div className="ion-text-center ion-padding">
                <IonSpinner color="primary" />
              </div>
            )}

            {erreurRecherche && (
              <IonText color="danger">
                <p className="films-message">{erreurRecherche}</p>
              </IonText>
            )}

            {!recherche.trim() && (
              <p className="films-message">Tape le titre d'un film pour lancer la recherche.</p>
            )}

            {recherche.trim() && !chargementRecherche && !erreurRecherche && resultatsAffiches.length === 0 && (
              <p className="films-message">Aucun film trouvé.</p>
            )}

            {resultatsAffiches.length > 0 && (
              <section aria-label="Résultats de la recherche">
                <div className="grille">{resultatsAffiches.map(carte)}</div>
              </section>
            )}
          </div>
        ) : (
          <div className={'films-accueil' + (vedette ? '' : ' sans-banniere')}>
            <header className="films-entete">
              <h1 className="logo">
                Movie <span className="logo-match">Match</span>
              </h1>
              <button className="bouton-rond" onClick={() => setModeRecherche(true)} aria-label="Ouvrir la recherche">
                <IonIcon icon={search} aria-hidden="true" />
              </button>
            </header>

            {banniere()}

            {chargement && (
              <div className="ion-text-center ion-padding">
                <IonSpinner color="primary" />
              </div>
            )}

            {erreur && (
              <IonText color="danger">
                <p className="films-message">{erreur}</p>
              </IonText>
            )}

            {rangee('rangee-selection', 'Sélection Movie Match', filmsMaison.map(versMaison))}
            {rangee('rangee-affiche', "À l'affiche", populaires.map(versTMDB))}
            {rangee('rangee-mieux-notes', 'Les mieux notés', mieuxNotes.map(versTMDB))}
            {rangee('rangee-a-venir', 'Bientôt au cinéma', aVenir.map(versTMDB))}
          </div>
        )}

        <IonModal
          className="modal-detail"
          isOpen={detail !== null}
          onDidDismiss={() => setDetail(null)}
        >
          {detail && contenuDetail(detail)}
        </IonModal>

        <IonToast
          isOpen={message !== ''}
          message={message}
          duration={1500}
          position="top"
          onDidDismiss={() => setMessage('')}
        />
      </IonContent>
    </IonPage>
  );
};

export default Films;
