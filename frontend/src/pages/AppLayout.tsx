import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';


export function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
