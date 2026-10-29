import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Camera } from '@capacitor/camera';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { setDoc } from 'firebase/firestore';
import Register from './Register';

// Sous Vitest, @ionic/react charge la version SSR de @lit/react qui ne branche pas
// les événements des web components (onIonInput). On remplace donc IonInput
// par un simple <input> qui appelle onIonInput comme le ferait Ionic.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  const { createElement } = await import('react');
  type Props = { label?: string; type?: string; value?: string; onIonInput?: (e: unknown) => void };
  const IonInput = ({ label, type, value, onIonInput }: Props) =>
    createElement('input', {
      'aria-label': label,
      type,
      value: value ?? '',
      onChange: (e: { target: { value: string } }) => onIonInput?.({ detail: { value: e.target.value } }),
    });
  return { ...actual, IonInput };
});
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA' },
}));
vi.mock('../firebase', () => ({ auth: { nom: 'auth-mock' }, db: {} }));
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(() => Promise.resolve()),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...chemin: string[]) => chemin.join('/')),
  setDoc: vi.fn(() => Promise.resolve()),
}));

const PHOTO = 'data:image/jpeg;base64,AAAA';
const MESSAGE_CHAMPS = 'Remplis tous les champs et prends une photo.';
const MESSAGE_AGE = "L'âge doit être un nombre entre 10 et 120.";
const NOUVEL_UTILISATEUR = { uid: 'nouvel-uid' };

function saisir(label: string, valeur: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } });
}

function remplirChamps() {
  saisir('Nom', 'Dupont');
  saisir('Prénom', 'Marie');
  saisir('Âge', '25');
  saisir('E-mail', 'marie@exemple.fr');
  saisir('Mot de passe', 'secret123');
}

async function prendrePhoto() {
  fireEvent.click(screen.getByText('Prendre une photo'));
  await screen.findByAltText('photo');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Camera.getPhoto).mockResolvedValue({ dataUrl: PHOTO } as never);
  vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: NOUVEL_UTILISATEUR } as never);
});

describe('Register', () => {
  it('affiche une erreur si le formulaire est vide', () => {
    render(<Register />);
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(screen.getByText(MESSAGE_CHAMPS)).toBeInTheDocument();
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('affiche une erreur si la photo manque', () => {
    render(<Register />);
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(screen.getByText(MESSAGE_CHAMPS)).toBeInTheDocument();
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it.each(['Nom', 'Prénom', 'Âge', 'E-mail', 'Mot de passe'])(
    'affiche une erreur si le champ "%s" est vide',
    async (champ) => {
      render(<Register />);
      await prendrePhoto();
      remplirChamps();
      saisir(champ, '');
      fireEvent.click(screen.getByText("S'inscrire"));

      expect(screen.getByText(MESSAGE_CHAMPS)).toBeInTheDocument();
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    },
  );

  it('prend la photo avec la caméra et l\'affiche', async () => {
    render(<Register />);
    await prendrePhoto();

    expect(Camera.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ resultType: 'dataUrl', source: 'CAMERA' }),
    );
    expect(screen.getByAltText('photo')).toHaveAttribute('src', PHOTO);
    expect(screen.getByText('Reprendre la photo')).toBeInTheDocument();
  });

  it('ne plante pas si l\'utilisateur annule la photo', async () => {
    vi.mocked(Camera.getPhoto).mockRejectedValue(new Error('User cancelled photos app'));
    render(<Register />);

    fireEvent.click(screen.getByText('Prendre une photo'));
    await waitFor(() => expect(Camera.getPhoto).toHaveBeenCalled());

    expect(screen.queryByAltText('photo')).not.toBeInTheDocument();
  });

  it('crée le compte puis le profil Firestore (role user, actif true, favoris [])', async () => {
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      { nom: 'auth-mock' }, 'marie@exemple.fr', 'secret123',
    );
    expect(setDoc).toHaveBeenCalledWith('users/nouvel-uid', {
      nom: 'Dupont',
      prenom: 'Marie',
      age: 25,
      photo: PHOTO,
      email: 'marie@exemple.fr',
      role: 'user',
      actif: true,
      favoris: [],
    });
    // L'ordre compte : le profil est créé après le compte
    expect(vi.mocked(createUserWithEmailAndPassword).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(setDoc).mock.invocationCallOrder[0]);
    expect(screen.queryByText(MESSAGE_CHAMPS)).not.toBeInTheDocument();
  });

  it.each([
    ['auth/email-already-in-use', 'Cet e-mail est déjà utilisé.'],
    ['auth/invalid-email', "L'adresse e-mail n'est pas valide."],
    ['auth/weak-password', 'Le mot de passe doit contenir au moins 6 caractères.'],
    ['auth/inconnu', "Erreur lors de l'inscription."],
  ])('traduit l\'erreur Firebase %s', async (code, message) => {
    vi.mocked(createUserWithEmailAndPassword).mockRejectedValue({ code });
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('affiche une erreur générique et supprime le compte si setDoc échoue', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce({ code: 'permission-denied' });
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(await screen.findByText("Erreur lors de l'inscription.")).toBeInTheDocument();
    expect(deleteUser).toHaveBeenCalledWith(NOUVEL_UTILISATEUR);
  });

  it('affiche quand même l\'erreur si deleteUser échoue aussi', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce({ code: 'permission-denied' });
    vi.mocked(deleteUser).mockRejectedValueOnce(new Error('requires-recent-login'));
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(await screen.findByText("Erreur lors de l'inscription.")).toBeInTheDocument();
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('ne supprime pas le compte si tout s\'est bien passé', async () => {
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    fireEvent.click(screen.getByText("S'inscrire"));

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('supprime les espaces autour du nom, du prénom et de l\'e-mail', async () => {
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    saisir('Nom', '  Dupont ');
    saisir('Prénom', ' Marie  ');
    saisir('E-mail', '  marie@exemple.fr ');
    fireEvent.click(screen.getByText("S'inscrire"));

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      { nom: 'auth-mock' }, 'marie@exemple.fr', 'secret123',
    );
    expect(setDoc).toHaveBeenCalledWith('users/nouvel-uid', expect.objectContaining({
      nom: 'Dupont', prenom: 'Marie', email: 'marie@exemple.fr',
    }));
  });

  it.each(['Nom', 'Prénom', 'E-mail'])(
    'refuse le champ "%s" rempli uniquement d\'espaces',
    async (champ) => {
      render(<Register />);
      await prendrePhoto();
      remplirChamps();
      saisir(champ, '   ');
      fireEvent.click(screen.getByText("S'inscrire"));

      expect(screen.getByText(MESSAGE_CHAMPS)).toBeInTheDocument();
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    },
  );

  it.each(['9', '121', '25.5', '-3', '1e3'])('refuse l\'âge "%s"', async (age) => {
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    saisir('Âge', age);
    fireEvent.click(screen.getByText("S'inscrire"));

    expect(screen.getByText(MESSAGE_AGE)).toBeInTheDocument();
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it.each([['10', 10], ['120', 120]])('accepte l\'âge limite %s', async (age, attendu) => {
    render(<Register />);
    await prendrePhoto();
    remplirChamps();
    saisir('Âge', age);
    fireEvent.click(screen.getByText("S'inscrire"));

    await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    expect(setDoc).toHaveBeenCalledWith('users/nouvel-uid', expect.objectContaining({ age: attendu }));
    expect(screen.queryByText(MESSAGE_AGE)).not.toBeInTheDocument();
  });
});
