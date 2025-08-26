import React, { useState, useEffect } from "react";
import {
  FaUtensils,
  FaHistory,
  FaTable,
  FaUserCircle,
  FaBars,
  FaTimes,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import OrdersHub from "@/components/waiter/OrdersHub";
import HistoryPage from "@/components/waiter/HistoryPage";
import MyTables from "@/components/waiter/MyTables";

export default function WaiterDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [active, setActive] = useState("orders");
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 640) setMobileMenuOpen(false);
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

  const handleSelect = (id) => {
    setActive(id);
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/waiter-login");
  };

  const menuSections = [
    { id: "orders", icon: FaUtensils, label: "ትዓዛዞች | Orders" },
    { id: "history", icon: FaHistory, label: "የቀኑ የተዘጉ ትዓዛዝ | History" },
    { id: "tables", icon: FaTable, label: "ጠረጴዛዎች | My Tables " },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top bar */}
        <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Hamburger for small screens */}
            <button
              className="block md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>

            {/* Logo */}
            <img src="/logo.png" alt="Logo" className="w-7 h-7 sm:w-8 sm:h-8" />
            {/* <span className="font-bold text-base sm:text-lg hidden sm:inline">
              Waiter Panel
            </span> */}
          </div>

          {/* Tablet/Desktop Menu */}
          <nav className="hidden md:flex space-x-3 lg:space-x-5">
            {menuSections.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className={`flex items-center space-x-1 px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-sm sm:text-base ${
                  active === id
                    ? "bg-gray-300 dark:bg-gray-700 font-semibold"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="text-base sm:text-lg" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>

          {/* User controls */}
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

        {/* Mobile sliding menu */}
        {mobileMenuOpen && (
          <aside className="fixed inset-y-0 left-0 w-48 sm:w-56 bg-white dark:bg-gray-800 shadow-lg z-40 p-4 flex flex-col">
            {menuSections.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className={`flex items-center space-x-2 px-2 py-1.5 rounded-md mb-1 text-sm sm:text-base ${
                  active === id
                    ? "bg-gray-300 dark:bg-gray-700 font-semibold"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="text-base sm:text-lg" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </aside>
        )}

        {/* Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black opacity-30 z-30"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 text-sm sm:text-base">
          {active === "orders" && <OrdersHub />}
          {active === "history" && <HistoryPage />}
          {active === "tables" && <MyTables />}
        </main>
      </div>
    </div>
  );
}
