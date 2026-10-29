import { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonSpinner, IonText, IonIcon, IonToast,
} from '@ionic/react';
import { heart, heartOutline } from 'ionicons/icons';
import { filmsPopulaires, rechercherFilms, listeGenres, acteursDuFilm, IMG, FilmTMDB } from '../tmdb';
import { ajouterFavori, retirerFavori, Favori } from '../favoris';
import { useAuth } from '../AuthContext';
import './Films.css';

const Films: React.FC = () => {
  const { user, profil } = useAuth();
  const [films, setFilms] = useState<FilmTMDB[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState<number | null>(null);

  const mesFavoris: Favori[] = profil?.favoris ?? [];

  // Charger la liste des genres une seule fois
  useEffect(() => {
    listeGenres().then(setGenres).catch(() => {});
  }, []);

  // Charger les films à chaque fois que la recherche change
  useEffect(() => {
    // Passe à true si la recherche change : on ignore alors la réponse obsolète
    let annule = false;
    const minuteur = setTimeout(async () => {
      setChargement(true);
      setErreur('');
      try {
        const texte = recherche.trim();
        const resultat = texte ? await rechercherFilms(texte) : await filmsPopulaires();
        if (!annule) setFilms(resultat);
      } catch {
        if (!annule) setErreur('Impossible de charger les films. Vérifie ta clé TMDB.');
      }
      if (!annule) setChargement(false);
    }, 400);

    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [recherche]);

  // Ajouter ou retirer un film des favoris
  const basculerFavori = async (film: FilmTMDB) => {
    if (!user || enCours !== null) return;
    const dejaFavori = mesFavoris.some((f) => f.id === film.id);

    setEnCours(film.id);
    try {
      if (dejaFavori) {
        await retirerFavori(user.uid, mesFavoris, film.id);
        setMessage('Retiré de ta collection');
      } else {
        const acteurs = await acteursDuFilm(film.id).catch(() => []);
        await ajouterFavori(user.uid, mesFavoris, {
          id: film.id,
          titre: film.title,
          affiche: film.poster_path,
          annee: film.release_date ? film.release_date.slice(0, 4) : '',
          genres: (film.genre_ids ?? []).map((id) => genres[id]).filter(Boolean),
          acteurs,
          note: film.vote_average ?? 0,
        });
        setMessage('Ajouté à ta collection 🎟️');
      }
    } catch {
      setMessage('Erreur, réessaie.');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>À l'affiche</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            placeholder="Rechercher un film"
            value={recherche}
            onIonInput={(e) => setRecherche(e.detail.value ?? '')}
          />
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {chargement && (
          <div className="ion-text-center">
            <IonSpinner color="primary" />
          </div>
        )}

        {erreur && (
          <IonText color="danger">
            <p>{erreur}</p>
          </IonText>
        )}

        {!chargement &&
          films.map((film, index) => {
            const estFavori = mesFavoris.some((f) => f.id === film.id);
            return (
              <div className="ticket" key={film.id}>
                {film.poster_path ? (
                  <img className="ticket-affiche" src={IMG + film.poster_path} alt={film.title} />
                ) : (
                  <div className="ticket-affiche vide">?</div>
                )}

                <div className="ticket-corps">
                  <div className="ticket-haut">
                    <span className="ticket-numero mono">
                      N° {String(index + 1).padStart(3, '0')}
                    </span>
                    <button
                      className={'ticket-coeur' + (estFavori ? ' actif' : '')}
                      onClick={() => basculerFavori(film)}
                      disabled={enCours === film.id}
                      aria-label="Favori"
                    >
                      <IonIcon icon={estFavori ? heart : heartOutline} />
                    </button>
                  </div>
                  <h2 className="ticket-titre">{film.title}</h2>
                  <p className="ticket-genres">
                    {(film.genre_ids ?? []).map((id) => genres[id]).filter(Boolean).slice(0, 3).join(' · ')}
                  </p>
                  <div className="ticket-talon mono">
                    <span>{film.release_date ? film.release_date.slice(0, 4) : '—'}</span>
                    <span className="note">★ {(film.vote_average ?? 0).toFixed(1)}</span>
                  </div>
                </div>
              </div>
            );
          })}

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