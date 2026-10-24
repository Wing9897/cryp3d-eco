import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerPwa } from './pwa';
import './styles.css';

registerPwa();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
