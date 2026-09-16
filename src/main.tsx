import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AcademyProvider } from './AcademyContext';
import './index.css';
import './academy.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AcademyProvider><App /></AcademyProvider>
  </StrictMode>,
);
