import './shims/crypto';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { installConsoleCapture } from './lib/log';

installConsoleCapture();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
