import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonInput,
  IonButton, IonList, IonItem, IonText, IonLoading,
} from '@ionic/react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const messagesErreur: Record<string, string> = {
  'auth/email-already-in-use': 'Cet e-mail est déjà utilisé.',
  'auth/invalid-email': "L'adresse e-mail n'est pas valide.",
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
};

const Register: React.FC = () => {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [photo, setPhoto] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const prendrePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 50,
        width: 300, // petite photo pour pouvoir la stocker dans Firestore
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      setPhoto(image.dataUrl ?? '');
    } catch {
      // l'utilisateur a annulé la photo
    }
  };

  const inscrire = async () => {
    setErreur('');
    const nomPropre = nom.trim();
    const prenomPropre = prenom.trim();
    const emailPropre = email.trim();
    if (!nomPropre || !prenomPropre || !age || !emailPropre || !motDePasse || !photo) {
      setErreur('Remplis tous les champs et prends une photo.');
      return;
    }
    const ageNombre = Number(age);
    if (!Number.isInteger(ageNombre) || ageNombre < 10 || ageNombre > 120) {
      setErreur("L'âge doit être un nombre entre 10 et 120.");
      return;
    }
    setChargement(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailPropre, motDePasse);
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          nom: nomPropre,
          prenom: prenomPropre,
          age: ageNombre,
          photo,
          email: emailPropre,
          role: 'user',
          actif: true,
          favoris: [],
        });
      } catch (e) {
        // Le profil n'a pas pu être créé : on supprime le compte pour ne pas le laisser orphelin
        await deleteUser(cred.user).catch(() => {});
        throw e;
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setErreur(messagesErreur[code] ?? "Erreur lors de l'inscription.");
    }
    setChargement(false);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Inscription</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="ion-text-center">
          {photo ? (
            <img src={photo} alt="photo" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#ddd', margin: 'auto' }} />
          )}
          <br />
          <IonButton size="small" onClick={prendrePhoto}>
            {photo ? 'Reprendre la photo' : 'Prendre une photo'}
          </IonButton>
        </div>

        <IonList>
          <IonItem>
            <IonInput label="Nom" labelPlacement="floating" value={nom}
              onIonInput={(e) => setNom(e.detail.value ?? '')} />
          </IonItem>
          <IonItem>
            <IonInput label="Prénom" labelPlacement="floating" value={prenom}
              onIonInput={(e) => setPrenom(e.detail.value ?? '')} />
          </IonItem>
          <IonItem>
            <IonInput label="Âge" labelPlacement="floating" type="number" value={age}
              onIonInput={(e) => setAge(e.detail.value ?? '')} />
          </IonItem>
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

        <IonButton expand="block" onClick={inscrire}>S'inscrire</IonButton>
        <IonButton expand="block" fill="clear" routerLink="/login">
          Déjà un compte ? Se connecter
        </IonButton>

        <IonLoading isOpen={chargement} message="Inscription..." />
      </IonContent>
    </IonPage>
  );
};

export default Register;