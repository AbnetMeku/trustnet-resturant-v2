import React, { useEffect, useState } from "react";
import {
  FaFolderOpen,
  FaLockOpen,
  FaHistory,
  FaBars,
  FaSignOutAlt,
  FaSun,
  FaMoon,
  FaMale,
  FaChevronLeft,
  FaChevronRight,
  FaCheckCircle,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/hooks/useBranding";

import OpenOrders from "@/components/cashiers/OpenOrders";
import ClosedOrders from "@/components/cashiers/ClosedOrders";
import PaidOrders from "@/components/cashiers/PaidOrders";
import SalesSummaryReport from "@/components/admin/SalesSummaryReport";
import WaiterSummaryReport from "@/components/admin/WaiterSummaryReport";

export default function CashierDashboard() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const [active, setActive] = useState("openOrders");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 900);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const handleSelect = (id) => {
    setActive(id);
    if (isMobile) setSidebarOpen(false);
  };

  const menuSections = [
    {
      title: "Operations",
      items: [
        { id: "openOrders", icon: FaFolderOpen, label: "Open Orders" },
        { id: "closedOrders", icon: FaLockOpen, label: "Closed Orders" },
        { id: "paidOrders", icon: FaCheckCircle, label: "Paid Orders" },
      ],
    },
    {
      title: "Reports",
      items: [
        { id: "reports", icon: FaHistory, label: "Sales Summary" },
        { id: "waiterReport", icon: FaMale, label: "Waiter Report" },
      ],
    },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="admin-shell admin-shell-grid flex min-h-dvh w-full overflow-hidden">
        <aside
          className={`admin-sidebar
            fixed md:relative z-30 top-0 left-0 h-full md:h-auto
            border-r border-slate-200/70 dark:border-slate-800/80
            flex flex-col
            ${isMobile ? (sidebarOpen ? "w-72" : "w-0") : sidebarOpen ? "w-72" : "w-20"}
          `}
        >
          <div className="admin-sidebar-header flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <div className="admin-logo-wrap">
                <img
                  src={branding.logo_url}
                  alt="Logo"
                  className="w-9 h-9 object-contain rounded"
                />
              </div>
              {sidebarOpen && (
                <div className="leading-tight">
                  <p className="font-semibold text-base">Cashier Console</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    TrustNet Restaurant
                  </p>
                </div>
              )}
            </div>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                className="admin-icon-btn"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
              </button>
            )}
          </div>

          <nav className="flex-1 mt-3 overflow-y-auto no-scrollbar px-2 pb-4">
            {menuSections.map((section) => (
              <div key={section.title} className="mb-4">
                {sidebarOpen && <p className="admin-section-title">{section.title}</p>}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`admin-nav-item ${active === item.id ? "is-active" : ""}`}
                    onClick={() => handleSelect(item.id)}
                  >
                    <item.icon className="admin-nav-icon" />
                    {sidebarOpen && <span className="text-sm font-medium tracking-wide">{item.label}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={toggleSidebar} />
        )}

        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <header className="admin-header px-4 py-3 md:px-6">
            <div className="admin-header-inner">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button onClick={toggleSidebar} className="admin-icon-btn" aria-label="Open sidebar">
                    <FaBars />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="admin-user-pill">
                  <strong>{user?.username || "Cashier"}</strong>
                </div>
                <Button variant="outline" size="sm" onClick={toggleDarkMode}>
                  {darkMode ? <FaSun className="mr-2" /> : <FaMoon className="mr-2" />}
                  {darkMode ? "Light" : "Dark"}
                </Button>
                <Button variant="destructive" size="sm" onClick={logout}>
                  <FaSignOutAlt className="mr-2" /> Logout
                </Button>
              </div>
            </div>
          </header>

          <main className="admin-main">
            {active === "openOrders" && <OpenOrders />}
            {active === "closedOrders" && <ClosedOrders />}
            {active === "paidOrders" && <PaidOrders />}
            {active === "reports" && <SalesSummaryReport />}
            {active === "waiterReport" && <WaiterSummaryReport />}
          </main>
        </div>
      </div>
    </div>
  );
}
