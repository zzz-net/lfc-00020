import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  Wrench,
  FileDown,
  ScrollText,
  User,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const navItems = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true },
  { to: '/tickets/new', label: '新建工单', icon: PlusCircle },
  { to: '/technicians', label: '技师管理', icon: Wrench },
  { to: '/export', label: '导出中心', icon: FileDown },
  { to: '/audit', label: '审计日志', icon: ScrollText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { operator, setOperator } = useAppStore();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 bg-slate-900 text-white flex flex-col shadow-xl">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <Wrench className="w-6 h-6 text-blue-400 mr-2" />
          <h1 className="text-lg font-bold tracking-wide">维修排班工作台</h1>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mr-3">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-400 text-xs">当前操作人</div>
              <input
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                className="bg-transparent border-none outline-none text-white text-sm font-medium w-full focus:bg-slate-800 px-1 py-0.5 rounded"
              />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
