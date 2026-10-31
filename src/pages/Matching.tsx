import { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner, IonText,
  IonToggle, IonModal, IonIcon,
} from '@ionic/react';
import { close } from 'ionicons/icons';
import { useAuth } from '../AuthContext';
import { ecouterUtilisateurs, Utilisateur } from '../catalogue';
import { trouverMatchs, Match, MIN_FAVORIS, POIDS, SEUIL_MATCH } from '../matching';
import { urlAffiche } from '../tmdb';
import type { Favori } from '../favoris';
import './Films.css';
import './Matching.css';

// Les 4 critères affichés dans le détail, dans l'ordre
const CRITERES = [
  { cle: 'films', nom: 'Films' },
  { cle: 'genres', nom: 'Genres' },
  { cle: 'acteurs', nom: 'Acteurs' },
  { cle: 'epoque', nom: 'Époque' },
] as const;

// Arrondi simple, pour la largeur des barres et les poids
const pourcent = (valeur: number) => Math.round(valeur * 100);

// Pourcentage affiché : une décimale arrondie vers le bas (0,7499 → "74,9"), pour qu'un
// score sous le seuil ne s'affiche jamais "75". Le 1e-6 corrige les erreurs d'arrondi
// des calculs (0,9999999999999999 doit donner "100").
const pourcentTexte = (valeur: number) =>
  (Math.floor(valeur * 1000 + 1e-6) / 10).toLocaleString('fr-FR');

// Photo ronde, ou l'initiale du prénom s'il n'y a pas de photo
function Photo({ src, prenom }: { src?: string; prenom: string }) {
  return src ? (
    <img className="billet-photo" src={src} alt={'Photo de ' + prenom} />
  ) : (
    <span className="billet-photo vide" aria-hidden="true">{(prenom || '?').charAt(0).toUpperCase()}</span>
  );
}

const Matching: React.FC = () => {
  const { user, profil } = useAuth();
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [voirTous, setVoirTous] = useState(false);
  const [detail, setDetail] = useState<Match | null>(null);

  // Écouter les membres en temps réel
  useEffect(
    () =>
      ecouterUtilisateurs(setUtilisateurs, () =>
        setErreur('Impossible de charger les autres membres. Réessaie plus tard.'),
      ),
    [],
  );

  const mesFavoris: Favori[] = profil?.favoris ?? [];
  const manque = MIN_FAVORIS - mesFavoris.length;
  const monPrenom = profil?.prenom ?? 'Toi';

  const matchs = user && utilisateurs ? trouverMatchs({ uid: user.uid, favoris: mesFavoris }, utilisateurs) : [];
  const vraisMatchs = matchs.filter((m) => m.score > SEUIL_MATCH);
  const sousLeSeuil = matchs.filter((m) => m.score <= SEUIL_MATCH);

  // Le "double billet" : ma moitié à gauche, la sienne à droite, le score au centre
  const billet = (m: Match) => {
    const autre = m.utilisateur;
    const estMatch = m.score > SEUIL_MATCH;
    return (
      <article className={'match' + (estMatch ? '' : ' discret')} key={autre.uid}>
        <button
          className="billet"
          onClick={() => setDetail(m)}
          aria-label={`Voir le détail du match avec ${autre.prenom} : ${pourcentTexte(m.score)} %`}
        >
          <span className="billet-moitie">
            <Photo src={profil?.photo} prenom={monPrenom} />
            <span className="billet-prenom">{monPrenom}</span>
            <span className="billet-role mono">Toi</span>
          </span>
          <span className="billet-centre">
            <span className="billet-tampon">{pourcentTexte(m.score)}%</span>
          </span>
          <span className="billet-moitie">
            <Photo src={autre.photo} prenom={autre.prenom} />
            <span className="billet-prenom">{autre.prenom}</span>
            <span className="billet-role mono">{estMatch ? 'Match' : 'Membre'}</span>
          </span>
        </button>
        {m.genresCommuns.length > 0 && (
          <ul className="match-genres" aria-label="Genres en commun">
            {m.genresCommuns.slice(0, 3).map((g) => (
              <li className="etiquette-genre" key={g}>{g}</li>
            ))}
          </ul>
        )}
      </article>
    );
  };

  // Contenu du détail d'un match
  const contenuDetail = (m: Match) => (
    <IonContent className="ion-padding detail-match">
      <div className="detail-match-haut">
        <h2 className="detail-match-titre">
          {monPrenom} & {m.utilisateur.prenom}
        </h2>
        <button className="bouton-rond" onClick={() => setDetail(null)} aria-label="Fermer le détail">
          <IonIcon icon={close} aria-hidden="true" />
        </button>
      </div>
      <p className="detail-match-score">
        <span className="billet-tampon grand">{pourcentTexte(m.score)}%</span>
        <span className="detail-match-verdict">
          {m.score > SEUIL_MATCH ? "C'est un match !" : 'Pas encore un match'}
        </span>
      </p>

      <h3 className="detail-match-section">Le calcul</h3>
      {CRITERES.map(({ cle, nom }) => (
        <div className="critere" key={cle}>
          <div className="critere-haut">
            <span className="critere-nom">{nom}</span>
            <span className="critere-valeur mono">
              {pourcentTexte(m[cle])} % · poids {pourcent(POIDS[cle])} %
            </span>
          </div>
          <div
            className="critere-barre"
            role="progressbar"
            aria-label={nom}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pourcent(m[cle])}
          >
            <div className="critere-remplie" style={{ width: pourcent(m[cle]) + '%' }} />
          </div>
        </div>
      ))}

      <h3 className="detail-match-section">Films en commun ({m.filmsCommuns.length})</h3>
      {m.filmsCommuns.length === 0 ? (
        <p className="detail-match-vide">Aucun film en commun pour l'instant.</p>
      ) : (
        <div className="rangee-liste detail-match-films">
          {m.filmsCommuns.map((f) => {
            const lien = urlAffiche(f.affiche);
            return (
              <div className="carte" key={f.id}>
                <div className="carte-affiche">
                  {lien ? (
                    <img className="match-affiche" src={lien} alt={f.titre} loading="lazy" />
                  ) : (
                    <span className="carte-vide" aria-hidden="true">?</span>
                  )}
                </div>
                <h4 className="carte-titre">{f.titre}</h4>
                <p className="carte-annee">{f.annee || '—'}</p>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="detail-match-section">Genres en commun</h3>
      {m.genresCommuns.length === 0 ? (
        <p className="detail-match-vide">Aucun.</p>
      ) : (
        <ul className="match-genres">
          {m.genresCommuns.map((g) => (
            <li className="etiquette-genre" key={g}>{g}</li>
          ))}
        </ul>
      )}

      <h3 className="detail-match-section">Acteurs en commun</h3>
      <p className={m.acteursCommuns.length ? 'detail-match-texte' : 'detail-match-vide'}>
        {m.acteursCommuns.length ? m.acteursCommuns.join(', ') : 'Aucun.'}
      </p>
    </IonContent>
  );

  // Ce qu'on affiche sous le titre, selon la situation
  const contenu = () => {
    if (manque > 0) {
      return (
        <div className="matching-message">
          <h2>Encore un petit effort</h2>
          <p>
            Il te manque {manque} film{manque > 1 ? 's' : ''} dans ta liste pour découvrir tes matchs
            ({MIN_FAVORIS} minimum). Ajoute-les depuis l'onglet Films.
          </p>
        </div>
      );
    }
    if (erreur) {
      return (
        <IonText color="danger">
          <p>{erreur}</p>
        </IonText>
      );
    }
    if (utilisateurs === null) {
      return (
        <div className="ion-text-center ion-padding">
          <IonSpinner color="primary" />
        </div>
      );
    }
    return (
      <>
        <IonToggle
          className="matching-toggle"
          checked={voirTous}
          onIonChange={(e) => setVoirTous(e.detail.checked)}
        >
          Voir tous les scores
        </IonToggle>

        {vraisMatchs.length === 0 ? (
          <div className="matching-message">
            <h2>Pas encore de match</h2>
            <p>
              Personne ne dépasse encore 75 % avec toi. Ajoute d'autres films à ta liste :
              plus elle est riche, plus tu as de chances de trouver ton binôme de ciné !
            </p>
          </div>
        ) : (
          <section aria-label="Tes matchs">{vraisMatchs.map(billet)}</section>
        )}

        {voirTous && (
          <section className="sous-le-seuil" aria-labelledby="titre-sous-le-seuil">
            <h2 className="matching-sous-titre" id="titre-sous-le-seuil">Sous le seuil</h2>
            {sousLeSeuil.length === 0 ? (
              <p className="detail-match-vide">Aucun autre membre avec au moins {MIN_FAVORIS} films.</p>
            ) : (
              sousLeSeuil.map(billet)
            )}
          </section>
        )}
      </>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Matching</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <h1 className="matching-titre">Tes matchs</h1>
        <p className="matching-intro">Un match, c'est plus de 75 % de goûts en commun.</p>

        {contenu()}

        <IonModal className="modal-detail" isOpen={detail !== null} onDidDismiss={() => setDetail(null)}>
          {detail && contenuDetail(detail)}
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Matching;
