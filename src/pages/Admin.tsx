import { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonSegment, IonSegmentButton,
  IonLabel, IonList, IonItem, IonInput, IonTextarea, IonButton, IonText, IonIcon,
  IonToggle, IonToast, IonSelect, IonSelectOption,
} from '@ionic/react';
import { addCircleOutline, trashOutline } from 'ionicons/icons';
import { useAuth } from '../AuthContext';
import {
  ecouterFilmsMaison, ajouterFilmMaison, supprimerFilmMaison,
  ecouterUtilisateurs, changerActif, FilmMaison, Utilisateur,
} from '../catalogue';
import { listeGenres, urlAffiche } from '../tmdb';
import './Tickets.css';
import './Admin.css';

// Transforme "Action, Comédie ," en ["Action", "Comédie"]
function decouper(texte: string): string[] {
  return texte.split(',').map((t) => t.trim()).filter(Boolean);
}

const Admin: React.FC = () => {
  const { user } = useAuth();
  const [onglet, setOnglet] = useState<'films' | 'utilisateurs'>('films');
  const [filmsMaison, setFilmsMaison] = useState<FilmMaison[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Le formulaire d'ajout
  const [titre, setTitre] = useState('');
  const [annee, setAnnee] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [acteurs, setActeurs] = useState('');
  const [affiche, setAffiche] = useState('');
  const [synopsis, setSynopsis] = useState('');

  // Les genres TMDB (en français) proposés dans la liste
  const [genresTMDB, setGenresTMDB] = useState<string[] | null>(null);
  const [erreurGenres, setErreurGenres] = useState('');

  useEffect(() => {
    let annule = false;
    listeGenres()
      .then((liste) => {
        if (!annule) setGenresTMDB(Object.values(liste).sort((a, b) => a.localeCompare(b, 'fr')));
      })
      .catch(() => {
        if (!annule) setErreurGenres('Impossible de charger les genres TMDB. Vérifie ta connexion et ta clé TMDB.');
      });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => ecouterFilmsMaison(setFilmsMaison), []);
  useEffect(() => ecouterUtilisateurs(setUtilisateurs), []);

  const ajouter = async () => {
    setErreur('');
    const titrePropre = titre.trim();
    const anneePropre = annee.trim();
    const lienAffiche = affiche.trim();

    if (!titrePropre) {
      setErreur('Le titre est obligatoire.');
      return;
    }
    if (anneePropre) {
      const nombre = Number(anneePropre);
      if (!Number.isInteger(nombre) || nombre < 1888 || nombre > 2100) {
        setErreur("L'année doit être comprise entre 1888 et 2100.");
        return;
      }
    }
    if (genres.length === 0) {
      setErreur('Ajoute au moins un genre.');
      return;
    }
    if (lienAffiche && !/^https:\/\/\S+$/.test(lienAffiche)) {
      setErreur("Le lien de l'affiche doit commencer par https://");
      return;
    }

    setEnCours(true);
    try {
      await ajouterFilmMaison({
        titre: titrePropre,
        affiche: lienAffiche || null,
        annee: anneePropre,
        genres,
        acteurs: decouper(acteurs),
        note: 0,
        synopsis: synopsis.trim(),
      });
      setTitre('');
      setAnnee('');
      setGenres([]);
      setActeurs('');
      setAffiche('');
      setSynopsis('');
      setMessage('Film ajouté à la sélection 🎟️');
    } catch {
      setErreur("Impossible d'ajouter le film. Vérifie ta connexion et tes droits admin.");
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (film: FilmMaison) => {
    if (enCours) return;
    setEnCours(true);
    try {
      await supprimerFilmMaison(film.id);
      setMessage('« ' + film.titre + ' » supprimé de la sélection');
    } catch {
      setMessage('Impossible de supprimer le film, réessaie.');
    } finally {
      setEnCours(false);
    }
  };

  const basculerActif = async (membre: Utilisateur, actif: boolean) => {
    if (enCours || membre.actif === actif) return;
    setEnCours(true);
    try {
      await changerActif(membre.uid, actif);
      setMessage(`Compte de ${membre.prenom} ${membre.nom} ${actif ? 'réactivé' : 'désactivé'}`);
    } catch {
      setMessage('Impossible de modifier ce compte, réessaie.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Espace admin</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment
            value={onglet}
            onIonChange={(e) => setOnglet(e.detail.value === 'utilisateurs' ? 'utilisateurs' : 'films')}
          >
            <IonSegmentButton value="films">
              <IonLabel>Films</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="utilisateurs">
              <IonLabel>Utilisateurs</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {onglet === 'films' ? (
          <>
            <h2 className="admin-titre">Ajouter un film</h2>
            <IonList>
              <IonItem>
                <IonInput label="Titre" labelPlacement="floating" value={titre}
                  onIonInput={(e) => setTitre(e.detail.value ?? '')} />
              </IonItem>
              <IonItem>
                <IonInput label="Année" labelPlacement="floating" type="number" value={annee}
                  onIonInput={(e) => setAnnee(e.detail.value ?? '')} />
              </IonItem>
              <IonItem>
                <IonSelect label="Genres" labelPlacement="floating" multiple value={genres}
                  disabled={genresTMDB === null} cancelText="Annuler" okText="Valider"
                  onIonChange={(e) => setGenres(e.detail.value ?? [])}>
                  {(genresTMDB ?? []).map((g) => (
                    <IonSelectOption key={g} value={g}>{g}</IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>
              <IonItem>
                <IonInput label="Acteurs (séparés par des virgules)" labelPlacement="floating" value={acteurs}
                  onIonInput={(e) => setActeurs(e.detail.value ?? '')} />
              </IonItem>
              <IonItem>
                <IonInput label="Lien de l'affiche (https)" labelPlacement="floating" type="url" value={affiche}
                  onIonInput={(e) => setAffiche(e.detail.value ?? '')} />
              </IonItem>
              <IonItem>
                <IonTextarea label="Synopsis" labelPlacement="floating" autoGrow value={synopsis}
                  onIonInput={(e) => setSynopsis(e.detail.value ?? '')} />
              </IonItem>
            </IonList>

            <p className="admin-aide mono">
              Les genres viennent de TMDB : ce sont les mêmes que ceux des autres films,
              pour que le matching fonctionne.
            </p>

            {erreurGenres && <IonText color="danger"><p>{erreurGenres}</p></IonText>}

            {erreur && <IonText color="danger"><p>{erreur}</p></IonText>}

            <IonButton expand="block" onClick={ajouter} disabled={enCours}>
              <IonIcon slot="start" icon={addCircleOutline} aria-hidden="true" />
              Ajouter à la sélection
            </IonButton>

            <h2 className="admin-titre">Sélection Movie Match ({filmsMaison.length})</h2>
            {filmsMaison.length === 0 && <p className="admin-vide">Aucun film ajouté pour l'instant.</p>}

            {filmsMaison.map((film) => {
              const lien = urlAffiche(film.affiche);
              return (
                <div className="ticket" key={film.id}>
                  {lien ? (
                    <img className="ticket-affiche" src={lien} alt={film.titre} />
                  ) : (
                    <div className="ticket-affiche vide">?</div>
                  )}

                  <div className="ticket-corps">
                    <div className="ticket-haut">
                      <span className="ticket-numero mono">SÉLECTION</span>
                      <button
                        className="ticket-coeur ticket-poubelle"
                        onClick={() => supprimer(film)}
                        disabled={enCours}
                        aria-label={'Supprimer ' + film.titre}
                      >
                        <IonIcon icon={trashOutline} />
                      </button>
                    </div>
                    <h2 className="ticket-titre">{film.titre}</h2>
                    <p className="ticket-genres">{(film.genres ?? []).slice(0, 3).join(' · ')}</p>
                    <div className="ticket-talon mono">
                      <span>{film.annee || '—'}</span>
                      <span>{(film.acteurs ?? []).length} acteur(s)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <h2 className="admin-titre">Membres ({utilisateurs.length})</h2>
            {utilisateurs.map((membre) => {
              const estMoi = membre.uid === user?.uid;
              const estAdmin = membre.role === 'admin';
              return (
                <div className={'membre' + (membre.actif ? '' : ' desactive')} key={membre.uid}>
                  {membre.photo ? (
                    <img className="membre-photo" src={membre.photo} alt={membre.prenom} />
                  ) : (
                    <div className="membre-photo vide" />
                  )}
                  <div className="membre-infos">
                    <div className="membre-nom">
                      {membre.prenom} {membre.nom}
                    </div>
                    <div className="membre-email mono">{membre.email}</div>
                    <div className="membre-etiquettes mono">
                      {estAdmin && <span className="etiquette admin">ADMIN</span>}
                      {!membre.actif && <span className="etiquette desactive">DÉSACTIVÉ</span>}
                    </div>
                  </div>
                  <IonToggle
                    checked={membre.actif}
                    disabled={estMoi || estAdmin || enCours}
                    aria-label={`Actif ${membre.prenom} ${membre.nom}`}
                    onIonChange={(e) => basculerActif(membre, e.detail.checked)}
                  />
                </div>
              );
            })}
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

export default Admin;
