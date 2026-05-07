/**
 * Root del router. Toda la nav vive en `AppShell` (decide mobile vs desktop)
 * y las screens se renderizan en el Outlet.
 *
 * El chat usa una ruta separada (no es un modal) para que el back del navegador
 * funcione natural — entrás al chat, escribís, retrocedés y volvés a Inicio.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { Pollers } from '@/components/Pollers';
import {
  Inicio,
  Carteras,
  AssetDetail,
  Oportunidades,
  Cuentas,
  Chat,
  Operaciones,
  Simulador,
  Staking,
  Importar,
  Settings,
  Insights,
} from '@/screens';

export default function App() {
  return (
    <BrowserRouter>
      {/* Pollers vive fuera de las rutas: corre siempre, no se reinicia al
          navegar. Renderiza null. */}
      <Pollers />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/carteras" element={<Carteras />} />
          <Route path="/carteras/:bucket" element={<Carteras />} />
          <Route path="/asset/:assetId" element={<AssetDetail />} />
          <Route path="/oportunidades" element={<Oportunidades />} />
          <Route path="/cuentas" element={<Cuentas />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/operaciones" element={<Operaciones />} />
          <Route path="/simulador" element={<Simulador />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
