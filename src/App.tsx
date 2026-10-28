import { Navigate, Route } from 'react-router-dom';
import {
  IonApp, IonIcon, IonLabel, IonRouterOutlet, IonTabBar,
  IonTabButton, IonTabs, IonSpinner, setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { film, heart, people } from 'ionicons/icons';

import Films from './pages/Films';
import Tab2 from './pages/Tab2';
import Tab3 from './pages/Tab3';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider, useAuth } from './AuthContext';

/* CSS Ionic */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/variables.css';

setupIonicReact();

// Les onglets (chemins relatifs à /tabs)
const Onglets: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Route path="films" element={<Films />} />
      <Route path="favoris" element={<Tab2 />} />
      <Route path="matching" element={<Tab3 />} />
      <Route index element={<Navigate to="films" replace />} />
    </IonRouterOutlet>
    <IonTabBar slot="bottom">
      <IonTabButton tab="films" href="/tabs/films">
        <IonIcon icon={film} />
        <IonLabel>Films</IonLabel>
      </IonTabButton>
      <IonTabButton tab="favoris" href="/tabs/favoris">
        <IonIcon icon={heart} />
        <IonLabel>Favoris</IonLabel>
      </IonTabButton>
      <IonTabButton tab="matching" href="/tabs/matching">
        <IonIcon icon={people} />
        <IonLabel>Matching</IonLabel>
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);

const Routes: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="ion-padding ion-text-center">
        <IonSpinner />
      </div>
    );
  }

  return (
    <IonReactRouter>
      <IonRouterOutlet>
        <Route
          path="/login"
          element={user ? <Navigate to="/tabs/films" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/tabs/films" replace /> : <Register />}
        />
        <Route
          path="/tabs/*"
          element={user ? <Onglets /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/"
          element={<Navigate to={user ? '/tabs/films' : '/login'} replace />}
        />
      </IonRouterOutlet>
    </IonReactRouter>
  );
};

const App: React.FC = () => (
  <IonApp>
    <AuthProvider>
      <Routes />
    </AuthProvider>
  </IonApp>
);

export default App;