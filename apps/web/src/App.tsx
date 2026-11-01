import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { MaterialPage } from './MaterialPage';
import './styles.css';

function ComingSoon({ title }: { title: string }) { return <section className="page"><header className="page-header"><div><p className="eyebrow">皮作手帐</p><h1>{title}</h1><p>这个功能正在开发中，敬请期待。</p></div></header><div className="state-card"><strong>开发中</strong><span>我们正在认真打磨这个功能。</span></div></section>; }

export default function App() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><BrowserRouter><Routes><Route element={<AppShell />}>
    <Route index element={<Navigate to="/materials" replace />} />
    <Route path="materials" element={<MaterialPage />} />
    <Route path="dashboard" element={<ComingSoon title="仪表盘" />} />
    <Route path="projects" element={<ComingSoon title="作品库" />} />
    <Route path="finished-goods" element={<ComingSoon title="成品档案" />} />
    <Route path="settings" element={<ComingSoon title="设置" />} />
    <Route path="*" element={<Navigate to="/materials" replace />} />
  </Route></Routes></BrowserRouter></QueryClientProvider>;
}
