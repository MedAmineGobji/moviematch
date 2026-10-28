import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonInput,
  IonButton, IonList, IonItem, IonText, IonLoading,
} from '@ionic/react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const connecter = async () => {
    setErreur('');
    setChargement(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, motDePasse);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists() && snap.data().actif === false) {
        await signOut(auth);
        setErreur("Ton compte a été désactivé par l'administrateur.");
      }
    } catch {
      setErreur('E-mail ou mot de passe incorrect.');
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

        {erreur && <IonText color="danger"><p>{erreur}</p></IonText>}

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