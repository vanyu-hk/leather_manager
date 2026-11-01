import { NavLink, Outlet } from 'react-router-dom';
import { useMediaQuery } from './useMediaQuery';

const navItems = [
  { to: '/dashboard', label: '仪表盘', icon: '⌂' },
  { to: '/materials', label: '材料库存', icon: '▦' },
  { to: '/projects', label: '作品库', icon: '◇' },
  { to: '/finished-goods', label: '成品档案', icon: '▤' },
  { to: '/settings', label: '设置', icon: '⚙' },
];

function Navigation({ mobile }: { mobile: boolean }) {
  return <nav className={mobile ? 'mobile-nav' : 'sidebar-nav'} aria-label={mobile ? '移动端主导航' : '桌面端主导航'}>
    {navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
      <span aria-hidden="true" className="nav-icon">{item.icon}</span><span>{item.label}</span>
    </NavLink>)}
  </nav>;
}

export function AppShell() {
  const mobile = useMediaQuery('(max-width: 760px)');
  return <div className="app-shell">
    {!mobile && <aside className="sidebar"><div className="brand-mark">LM</div><div className="brand"><strong>皮作手帐</strong><small>Leather Manager</small></div><Navigation mobile={false} /></aside>}
    <main className="main-content"><Outlet /></main>
    {mobile && <Navigation mobile />}
  </div>;
}
