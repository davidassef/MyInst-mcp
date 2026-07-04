import { Routes, Route, Navigate } from 'react-router-dom';
import { estaAutenticado } from './lib/api';
import { LoginPage } from './pages/Login';
import { McpDocsPage } from './pages/McpDocs';
import { ConnectMcpPage } from './pages/ConnectMcp';
import { DashboardPage } from './pages/Dashboard';
import { WorkspacePage } from './pages/Workspace';
import { ProjetoPage } from './pages/Projeto';
import { ApiKeysPage } from './pages/ApiKeys';
import { SecurityPage } from './pages/Security';
import { ClientProfilesPage } from './pages/ClientProfiles';
import { ClientProfilePage } from './pages/ClientProfile';
import { Layout } from './components/Layout';

function RotaProtegida({ children }: { children: React.ReactNode }) {
  if (!estaAutenticado()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mcp" element={<McpDocsPage />} />
      <Route path="/connect-mcp" element={<ConnectMcpPage />} />
      <Route
        path="/"
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="workspaces/:workspaceSlug" element={<WorkspacePage />} />
        <Route path="workspaces/:workspaceSlug/projetos/:slug" element={<ProjetoPage />} />
        <Route path="client-profiles" element={<ClientProfilesPage />} />
        <Route path="client-profiles/:clientId" element={<ClientProfilePage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="security" element={<SecurityPage />} />
      </Route>
    </Routes>
  );
}
