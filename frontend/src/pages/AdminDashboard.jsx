import React, { useState, useEffect } from "react";
import {
  FaTable,
  FaStore,
  FaUtensils,
  FaBars,
  FaChartBar,
  FaUsers,
  FaReceipt,
  FaPrint,
  FaFileAlt,
  FaBoxes,
  FaPalette,
  FaSun,
  FaMoon,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import UserManagement from "@/components/admin/UserManagement";
import TableManagement from "@/components/admin/TableManagement";
import StationManagement from "@/components/admin/StationManagement";
import MenuManagement from "@/components/admin/MenuManagement";
import SalesSummaryReport from "@/components/admin/SalesSummaryReport";
import WaiterSummaryReport from "@/components/admin/WaiterSummaryReport";
import OverView from "@/components/admin/OverView";
import OrderTracker from "@/components/admin/OrderTracker";
import PrintJobs from "@/components/admin/PrintJobs";
import BrandingManagement from "@/components/admin/BrandingManagement";
import { useBranding } from "@/hooks/useBranding";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [active, setActive] = useState("overview");
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

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const handleSelect = (id) => {
    if (id === "inventory") {
      navigate("/inventory");
      return;
    }
    setActive(id);
    if (isMobile) setSidebarOpen(false);
  };

  const menuSections = [
    {
      title: "Operations",
      items: [
        {
          id: "overview",
          icon: FaChartBar,
          label: "Overview",
        },
        {
          id: "order",
          icon: FaReceipt,
          label: "Order Tracker",
        },
        {
          id: "print",
          icon: FaPrint,
          label: "Print Jobs",
        },
        {
          id: "reports",
          icon: FaFileAlt,
          label: "Reports",
        },
        {
          id: "waiter-summary",
          icon: FaUsers,
          label: "Waiter Summary",
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          id: "users",
          icon: FaUsers,
          label: "Users",
        },
        {
          id: "tables",
          icon: FaTable,
          label: "Tables",
        },
        {
          id: "stations",
          icon: FaStore,
          label: "Stations",
        },
        {
          id: "menu",
          icon: FaUtensils,
          label: "Menu",
        },
        {
          id: "branding",
          icon: FaPalette,
          label: "Branding",
        },
      ],
    },
    {
      title: "Inventory",
      items: [
        {
          id: "inventory",
          icon: FaBoxes,
          label: "Inventory",
        },
      ],
    },
  ];

  const contentTitles = {
    overview: {
      title: "Overview",
    },
    users: {
      title: "Users",
    },
    tables: {
      title: "Tables",
    },
    stations: {
      title: "Stations",
    },
    menu: {
      title: "Menu",
    },
    reports: {
      title: "Sales Reports",
    },
    "waiter-summary": {
      title: "Waiter Summary",
    },
    order: {
      title: "Order Tracker",
    },
    print: {
      title: "Print Jobs",
    },
    branding: {
      title: "Branding",
    },
  };

  const currentTitle = contentTitles[active] || contentTitles.overview;

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <aside
          className={`
            fixed md:relative z-30 top-0 left-0 h-full md:h-auto
            bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800
            shadow-xl transition-all duration-300 backdrop-blur-sm
            flex flex-col
            ${isMobile ? (sidebarOpen ? "w-72" : "w-0") : sidebarOpen ? "w-72" : "w-20"}
          `}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <img src={branding.logo_url} alt="Logo" className="w-9 h-9 object-contain rounded" />
              {sidebarOpen && (
                <div className="leading-tight">
                  <p className="font-semibold text-base">Admin Panel</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">TrustNet Restaurant</p>
                </div>
              )}
            </div>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
              </button>
            )}
          </div>

          <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar px-2 pb-4">
            {menuSections.map((section) => (
              <div key={section.title} className="mb-4">
                {sidebarOpen && (
                  <p className="px-3 pb-2 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {section.title}
                  </p>
                )}
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    className={`w-full text-left flex items-center rounded-lg px-3 py-2.5 mb-1.5 transition-all
                    ${
                      active === item.id
                        ? "bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => handleSelect(item.id)}
                  >
                    <item.icon className="text-lg shrink-0" />
                    {sidebarOpen && (
                      <span className="ml-3 text-sm font-medium">{item.label}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={toggleSidebar}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-3 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                {isMobile && (
                  <button
                    onClick={toggleSidebar}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <FaBars />
                  </button>
                )}
                <div>
                  <h1 className="text-lg font-semibold">{currentTitle.title}</h1>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <div className="hidden md:flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">
                  Logged in as&nbsp;<strong>{user?.username || "Admin"}</strong>
                </div>
                <Button variant="outline" size="sm" onClick={toggleDarkMode}>
                  {darkMode ? <FaSun className="mr-2" /> : <FaMoon className="mr-2" />}
                  {darkMode ? "Light" : "Dark"}
                </Button>
                <Button variant="destructive" size="sm" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4 md:p-5 dark:bg-slate-950">
            {active === "overview" && (
              <Card className="p-5 md:p-6 w-full border-slate-200 dark:border-slate-800 shadow-sm">
                <OverView />
              </Card>
            )}

            {active === "users" && (
              <Card className="p-5 md:p-6 w-full border-slate-200 dark:border-slate-800 shadow-sm">
                <UserManagement />
              </Card>
            )}

            {active === "tables" && (
              <Card className="p-5 md:p-6 w-full border-slate-200 dark:border-slate-800 shadow-sm">
                <TableManagement />
              </Card>
            )}

            {active === "stations" && (
              <Card className="p-5 md:p-6 w-full border-slate-200 dark:border-slate-800 shadow-sm">
                <StationManagement />
              </Card>
            )}

            {active === "menu" && (
              <Card className="p-5 md:p-6 w-full border-slate-200 dark:border-slate-800 shadow-sm">
                <MenuManagement />
              </Card>
            )}

            {active === "reports" && (
              <Card className="p-5 md:p-6 w-full overflow-auto max-h-[82vh] border-slate-200 dark:border-slate-800 shadow-sm">
                <SalesSummaryReport />
              </Card>
            )}

            {active === "waiter-summary" && (
              <Card className="p-5 md:p-6 w-full overflow-auto max-h-[82vh] border-slate-200 dark:border-slate-800 shadow-sm">
                <WaiterSummaryReport />
              </Card>
            )}

            {active === "order" && (
              <Card className="p-5 md:p-6 w-full overflow-auto max-h-[82vh] border-slate-200 dark:border-slate-800 shadow-sm">
                <OrderTracker />
              </Card>
            )}

            {active === "print" && (
              <Card className="p-5 md:p-6 w-full overflow-auto max-h-[82vh] border-slate-200 dark:border-slate-800 shadow-sm">
                <PrintJobs />
              </Card>
            )}

            {active === "branding" && (
              <Card className="p-5 md:p-6 w-full overflow-auto max-h-[82vh] border-slate-200 dark:border-slate-800 shadow-sm">
                <BrandingManagement />
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
