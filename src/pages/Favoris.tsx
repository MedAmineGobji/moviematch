import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonToast,
} from '@ionic/react';
import { heart } from 'ionicons/icons';
import { useAuth } from '../AuthContext';
import { retirerFavori, Favori } from '../favoris';
import { urlAffiche } from '../tmdb';
import './Tickets.css';
import './Favoris.css';

// Renvoie la valeur qui revient le plus souvent dans une liste
function plusFrequent(valeurs: string[]): string {
  const compte: Record<string, number> = {};
  valeurs.forEach((v) => {
    compte[v] = (compte[v] ?? 0) + 1;
  });
  let meilleur = '—';
  let max = 0;
  Object.entries(compte).forEach(([valeur, nombre]) => {
    if (nombre > max) {
      max = nombre;
      meilleur = valeur;
    }
  });
  return meilleur;
}

const Favoris: React.FC = () => {
  const { user, profil } = useAuth();
  const [enCours, setEnCours] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const favoris: Favori[] = profil?.favoris ?? [];

  // Les statistiques de la collection
  const genreFetiche = plusFrequent(favoris.flatMap((f) => f.genres ?? []));
  const acteurFetiche = plusFrequent(favoris.flatMap((f) => f.acteurs ?? []));
  const decennie = plusFrequent(
    favoris.filter((f) => f.annee).map((f) => f.annee.slice(0, 3) + '0s'),
  );

  const retirer = async (film: Favori) => {
    if (!user || enCours !== null) return;
    setEnCours(film.id);
    try {
      await retirerFavori(user.uid, favoris, film.id);
      setMessage('Retiré de ta liste');
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
          <IonTitle>Ma liste</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {favoris.length === 0 ? (
          <div className="collection-vide">
            <h2>Ta liste est vide</h2>
            <p>Touche le ♡ sur un film dans l'onglet Films pour commencer ta liste.</p>
          </div>
        ) : (
          <>
            <div className="stats">
              <div className="stat principal">
                <div className="stat-label">Tickets</div>
                <div className="stat-valeur">{favoris.length}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Genre fétiche</div>
                <div className="stat-valeur">{genreFetiche}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Acteur fétiche</div>
                <div className="stat-valeur">{acteurFetiche}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Décennie</div>
                <div className="stat-valeur">{decennie}</div>
              </div>
            </div>

            {favoris.map((film, index) => (
              <div className="ticket" key={film.id}>
                {film.affiche ? (
                  <img className="ticket-affiche" src={urlAffiche(film.affiche) ?? undefined} alt={film.titre} />
                ) : (
                  <div className="ticket-affiche vide">?</div>
                )}

                <div className="ticket-corps">
                  <div className="ticket-haut">
                    <span className="ticket-numero mono">
                      N° {String(index + 1).padStart(3, '0')}
                    </span>
                    <button
                      className="ticket-coeur actif"
                      onClick={() => retirer(film)}
                      disabled={enCours === film.id}
                      aria-label="Retirer des favoris"
                    >
                      <IonIcon icon={heart} />
                    </button>
                  </div>
                  <h2 className="ticket-titre">{film.titre}</h2>
                  <p className="ticket-genres">{(film.genres ?? []).slice(0, 3).join(' · ')}</p>
                  <p className="ticket-acteurs">{(film.acteurs ?? []).slice(0, 3).join(', ')}</p>
                  <div className="ticket-talon mono">
                    <span>{film.annee || '—'}</span>
                    <span className="note">★ {(film.note ?? 0).toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

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

export default Favoris;