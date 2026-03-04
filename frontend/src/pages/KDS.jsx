import React, { useEffect, useState } from "react";
import { FaHistory, FaMoon, FaSun, FaUserCircle, FaUtensils } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useBranding } from "@/hooks/useBranding";

import StationOrders from "@/components/station/StationOrders";
import StationHistory from "@/components/station/StationHistory";

export default function StationDashboard() {
  const { station, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();

  const [active, setActive] = useState("orders");
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/station-login");
  };

  const menuSections = [
    { id: "orders", icon: FaUtensils, label: "Orders" },
    { id: "history", icon: FaHistory, label: "History" },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="admin-shell flex flex-col min-h-dvh w-full overflow-hidden">
        <header className="admin-header px-4 py-3 md:px-6">
          <div className="admin-header-inner">
            <div className="flex items-center gap-3">
              <div className="admin-logo-wrap">
                <img src={branding.logo_url} alt="Logo" className="w-9 h-9 object-contain rounded" />
              </div>
              <span className="font-semibold text-sm sm:text-base">KDS</span>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <span className="hidden sm:inline text-sm md:text-base">
                Hello, <strong>{station?.name || "Station"}</strong>
              </span>
              <FaUserCircle className="text-xl sm:text-2xl" />
              <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={toggleDarkMode}>
                {darkMode ? <FaSun className="mr-2" /> : <FaMoon className="mr-2" />}
                {darkMode ? "Light" : "Dark"}
              </Button>
              <Button variant="destructive" size="sm" className="text-xs sm:text-sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </header>

        <nav className="px-3 py-3 md:px-6 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/55 backdrop-blur-xl">
          <div className="w-full overflow-x-auto no-scrollbar">
            <div className="mx-auto flex w-max items-center justify-center gap-2">
              {menuSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                    active === section.id
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                  }`}
                >
                  {React.createElement(section.icon, { className: "text-sm" })}
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        <main className="admin-main text-sm sm:text-base">
          <div className="admin-card p-4 md:p-5">
            {active === "orders" && <StationOrders />}
            {active === "history" && <StationHistory />}
          </div>
        </main>
      </div>
    </div>
  );
}
