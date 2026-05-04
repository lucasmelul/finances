import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { bootstrap } from '@/lib/db/bootstrap';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // polling de precios cada 30s (SPEC §6)
      refetchOnWindowFocus: false,
    },
  },
});

// Sembrar la DB antes del primer render. Idempotente: si ya hay datos, no
// hace nada. Sin esto la app abre vacía y todas las queries se ven como
// "sin datos" en lugar de "cargando" — peor UX en cold start.
bootstrap()
  .catch((err) => {
    console.error('[bootstrap] falló al sembrar la DB', err);
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </React.StrictMode>,
    );
  });
