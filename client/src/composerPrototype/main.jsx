import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ComposerPrototype from './ComposerPrototype.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ComposerPrototype />
  </StrictMode>,
);
