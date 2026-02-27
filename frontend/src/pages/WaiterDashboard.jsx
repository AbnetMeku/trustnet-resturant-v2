import React, { useState } from "react";
import {
  FaUtensils,
  FaHistory,
  FaTable,
  FaUserCircle,
  FaPrint,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useBranding } from "@/hooks/useBranding";

import OrdersHub from "@/components/waiter/OrdersHub";
import HistoryPage from "@/components/waiter/HistoryPage";
import MyTables from "@/components/waiter/MyTables";
import PrintFailures from "@/components/waiter/PrintFailures";

export default function WaiterDashboard() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();

  const [active, setActive] = useState("orders");
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const handleSelect = (id) => {
    setActive(id);
  };

  const handleLogout = () => {
    logout();
    navigate("/waiter-login");
  };

  const menuSections = [
    { id: "orders", icon: FaUtensils, label: "Orders" },
    { id: "history", icon: FaHistory, label: "History" },
    { id: "tables", icon: FaTable, label: "Tables" },
    { id: "prints", icon: FaPrint, label: "Prints" },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <img src={branding.logo_url} alt="Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
            <span className="font-semibold text-sm sm:text-base">Waiter</span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <span className="hidden sm:inline text-sm md:text-base">
              Hello, <strong>{user?.username || "Waiter"}</strong>
            </span>
            <FaUserCircle className="text-xl sm:text-2xl" />
            <Button
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
              onClick={toggleDarkMode}
            >
              {darkMode ? "Light" : "Dark"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs sm:text-sm"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </header>

        <nav className="flex items-center gap-2 overflow-x-auto p-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          {menuSections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSelect(section.id)}
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
        </nav>

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 text-sm sm:text-base">
          {active === "orders" && <OrdersHub />}
          {active === "history" && <HistoryPage />}
          {active === "tables" && <MyTables />}
          {active === "prints" && <PrintFailures />}
        </main>
      </div>
    </div>
  );
}
