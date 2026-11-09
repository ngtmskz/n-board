import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 書体はアプリと一緒に配信する（OS によって見え方や改行の位置が変わらないようにする）
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-jp';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
