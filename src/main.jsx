import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ControlPanel from './ControlPanel';
import './styles/globals.css';

// Simple hash-based routing
const hash = window.location.hash;
const isControlPanel = hash === '#/control-panel';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isControlPanel ? <ControlPanel /> : <App />}
  </React.StrictMode>
);
