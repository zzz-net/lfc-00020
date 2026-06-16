import {
  LayoutDashboard,
  PlusSquare,
  Wrench,
  FileDown,
  ScrollText,
  User2,
  ChevronRight,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV = [
  { to: "/", label: "工作台", icon: LayoutDashboard },
  { to: "/tickets/new", label: "新建工单", icon: PlusSquare },
  { to: "/technicians", label: "技师管理", icon: Wrench },
  { to: "/export", label: "导出中心", icon: FileDown },
  { to: "/audit", label: "审计日志", icon: ScrollText },
];

export default function Layout() {
  const { toast, currentOperator, setCurrentOperator, clearToast } = useAppStore();
  const [opOpen, setOpOpen] = useState(false);
  const operators = ["调度员A", "调度员B", "主管C"];
  const loc = useLocation();
  const pageTitle = NAV.find((n) => n.to === loc.pathname)?.label ?? "工单详情";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-gradient-to-b from-[#1e293b] to-[#0f172a] text-slate-200">
        <div className="flex h-16 items-center gap-2 border-b border-slate-700/50 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold">
            L
          </div>
          <div>
            <div className="text-sm font-semibold text-white">维修排班</div>
            <div className="text-[10px] text-slate-400">Maintenance Workbench</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-blue-600/90 text-white shadow"
                    : "text-slate-300 hover:bg-slate-700/40 hover:text-white"
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition group-[.active]:opacity-100" />
            </NavLink>
          ))}
        </nav>
        {/* Operator picker */}
        <div className="border-t border-slate-700/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">当前操作人</div>
          <div className="relative">
            <button
              onClick={() => setOpOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg bg-slate-700/40 px-3 py-2 text-sm hover:bg-slate-700/60"
            >
              <User2 className="h-4 w-4" />
              <span className="truncate">{currentOperator}</span>
              <ChevronRight className={cn("ml-auto h-3.5 w-3.5 transition", opOpen && "rotate-90")} />
            </button>
            {opOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-lg border border-slate-600 bg-slate-800 shadow-lg">
                {operators.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setCurrentOperator(o);
                      setOpOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-slate-700/60",
                      o === currentOperator && "text-blue-400"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
          <h1 className="text-lg font-semibold text-slate-800">{pageTitle}</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{currentOperator}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur",
            toast.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            toast.type === "error" && "border-red-200 bg-red-50 text-red-800",
            toast.type === "info" && "border-slate-200 bg-white text-slate-800"
          )}
        >
          <span className="flex-1 text-sm">{toast.message}</span>
          <button onClick={clearToast} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
