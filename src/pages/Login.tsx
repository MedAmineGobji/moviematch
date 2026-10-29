import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonInput,
  IonButton, IonList, IonItem, IonText, IonLoading,
} from '@ionic/react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../AuthContext';

const messagesErreur: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/invalid-email': "L'adresse e-mail n'est pas valide.",
  'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth/network-request-failed': 'Pas de connexion internet.',
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const { messageDeconnexion } = useAuth();

  const connecter = async () => {
    setErreur('');
    setChargement(true);
    try {
      // Un compte désactivé est déconnecté par AuthContext (messageDeconnexion)
      await signInWithEmailAndPassword(auth, email.trim(), motDePasse);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setErreur(messagesErreur[code] ?? 'Connexion impossible, réessaie.');
    }
    setChargement(false);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Connexion</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <h1 className="ion-text-center">🎬 Movie Match</h1>
        <IonList>
          <IonItem>
            <IonInput label="E-mail" labelPlacement="floating" type="email" value={email}
              onIonInput={(e) => setEmail(e.detail.value ?? '')} />
          </IonItem>
          <IonItem>
            <IonInput label="Mot de passe" labelPlacement="floating" type="password" value={motDePasse}
              onIonInput={(e) => setMotDePasse(e.detail.value ?? '')} />
          </IonItem>
        </IonList>

        {(erreur || messageDeconnexion) && (
          <IonText color="danger"><p>{erreur || messageDeconnexion}</p></IonText>
        )}

        <IonButton expand="block" onClick={connecter}>Se connecter</IonButton>
        <IonButton expand="block" fill="clear" routerLink="/register">
          Pas de compte ? S'inscrire
        </IonButton>

        <IonLoading isOpen={chargement} message="Connexion..." />
      </IonContent>
    </IonPage>
  );
};

export default Login;