import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { OrganizationSwitcher } from './OrganizationSwitcher';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Acara', end: true },
  { to: '/dashboard/wa-sessions', label: 'Session WhatsApp' },
];

export function DashboardLayout() {
  const { signOut, user, organization } = useAuth();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">SertifikatLive</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <OrganizationSwitcher />
          <div className="header-user">
            <span>{user?.email}</span>
            <span className="role-tag">{organization?.role}</span>
            <button onClick={() => signOut()}>Keluar</button>
          </div>
        </header>

        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
