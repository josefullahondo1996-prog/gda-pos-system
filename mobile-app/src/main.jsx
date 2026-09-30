import React from 'react';
import { createRoot } from 'react-dom/client';
import MobileApp from './mobile-app.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><MobileApp /></React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
