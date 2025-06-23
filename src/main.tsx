import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { isDevelopmentMode } from './utils/mockData';

// Log development mode status
if (isDevelopmentMode()) {
  console.log('🔒 DEVELOPMENT MODE ACTIVE');
  console.log('🚫 All API requests will be blocked');
  console.log('📊 Mock data will be used instead');
  console.log('💾 No KV operations will be performed');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
