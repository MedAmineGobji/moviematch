import { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonSpinner, IonText,
} from '@ionic/react';
import { filmsPopulaires, rechercherFilms, listeGenres, IMG, FilmTMDB } from '../tmdb';
import './Films.css';

const Films: React.FC = () => {
  const [films, setFilms] = useState<FilmTMDB[]>([]);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  // Charger la liste des genres une seule fois
  useEffect(() => {
    listeGenres().then(setGenres).catch(() => {});
  }, []);

  // Charger les films à chaque fois que la recherche change
  useEffect(() => {
    const minuteur = setTimeout(async () => {
      setChargement(true);
      setErreur('');
      try {
        const texte = recherche.trim();
        const resultat = texte ? await rechercherFilms(texte) : await filmsPopulaires();
        setFilms(resultat);
      } catch {
        setErreur('Impossible de charger les films. Vérifie ta clé TMDB.');
      }
      setChargement(false);
    }, 400); // on attend que l'utilisateur arrête de taper

    return () => clearTimeout(minuteur);
  }, [recherche]);

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
          films.map((film, index) => (
            <div className="ticket" key={film.id}>
              {film.poster_path ? (
                <img className="ticket-affiche" src={IMG + film.poster_path} alt={film.title} />
              ) : (
                <div className="ticket-affiche vide">?</div>
              )}

              <div className="ticket-corps">
                <span className="ticket-numero mono">
                  N° {String(index + 1).padStart(3, '0')}
                </span>
                <h2 className="ticket-titre">{film.title}</h2>
                <p className="ticket-genres">
                  {film.genre_ids.map((id) => genres[id]).filter(Boolean).slice(0, 3).join(' · ')}
                </p>
                <div className="ticket-talon mono">
                  <span>{film.release_date ? film.release_date.slice(0, 4) : '—'}</span>
                  <span className="note">★ {film.vote_average.toFixed(1)}</span>
                </div>
              </div>
            </div>
          ))}
      </IonContent>
    </IonPage>
  );
};

export default Films;