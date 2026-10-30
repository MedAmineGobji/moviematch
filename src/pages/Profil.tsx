import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon,
} from '@ionic/react';
import { logOutOutline } from 'ionicons/icons';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';
import './Profil.css';

const Profil: React.FC = () => {
  const { user, profil } = useAuth();

  // Numéro de membre : les 8 premiers caractères de l'identifiant Firebase
  const numeroMembre = (user?.uid ?? '').slice(0, 8).toUpperCase();

  // Date de création du compte, fournie par Firebase
  const membreDepuis = user?.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('fr-FR')
    : '—';

  const deconnecter = () => {
    signOut(auth);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Mon profil</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {profil && (
          <>
            <div className="carte-membre">
              <div className="carte-bande mono">
                <span>CARTE MEMBRE</span>
                <span>MOVIE MATCH</span>
              </div>

              <div className="carte-contenu">
                {profil.photo ? (
                  <img className="carte-photo" src={profil.photo} alt="Photo de profil" />
                ) : (
                  <div className="carte-photo vide" />
                )}
                <div className="carte-infos">
                  <h2 className="carte-nom">
                    {profil.prenom}
                    <br />
                    {profil.nom}
                  </h2>
                  <p className="carte-detail mono">{profil.age} ans</p>
                  <p className="carte-detail mono">{profil.email}</p>
                </div>
              </div>

              <div className="carte-pied mono">
                <span>N° {numeroMembre}</span>
                <span className="carte-role">
                  {profil.role === 'admin' ? 'ADMIN' : 'MEMBRE'}
                </span>
              </div>
            </div>

            <div className="profil-ligne">
              <span>Films dans ma collection</span>
              <strong>{profil.favoris?.length ?? 0}</strong>
            </div>
            <div className="profil-ligne">
              <span>Membre depuis</span>
              <strong>{membreDepuis}</strong>
            </div>
          </>
        )}

        <IonButton
          className="profil-deconnexion bouton-secondaire"
          expand="block"
          onClick={deconnecter}
        >
          <IonIcon slot="start" icon={logOutOutline} aria-hidden="true" />
          Se déconnecter
        </IonButton>

        <p className="mention-tmdb">
          Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
        </p>
      </IonContent>
    </IonPage>
  );
};

export default Profil;