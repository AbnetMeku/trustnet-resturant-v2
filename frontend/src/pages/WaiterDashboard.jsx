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

  const [active, setActive] = useState("orders"); // default to Orders
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on viewport resize > 640px
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
    setMobileMenuOpen(false); // close mobile menu on selection
  };

  const handleLogout = () => {
    logout();
    navigate("/waiter-login");
  };

  const menuSections = [
    { id: "orders", icon: FaUtensils, label: "Orders" },
    { id: "history", icon: FaHistory, label: "History" },
    { id: "tables", icon: FaTable, label: "My Tables" },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top bar for all screen sizes */}
        <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-4 py-3">
          <div className="flex items-center space-x-4">
            {/* Mobile Hamburger */}
            <button
              className="block sm:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
            {/* Logo & Brand */}
            <img src="/logo.png" alt="Logo" className="w-8 h-8" />
            <span className="font-bold text-lg hidden sm:inline">Waiter Panel</span>
          </div>

          {/* Desktop Menu */}
          <nav className="hidden sm:flex space-x-6">
            {menuSections.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className={`flex items-center space-x-1 px-3 py-2 rounded-md focus:outline-none ${
                  active === id
                    ? "bg-gray-300 dark:bg-gray-700 font-semibold"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                aria-current={active === id ? "page" : undefined}
              >
                <Icon className="text-lg" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* User controls */}
          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline">
              Hello, <strong>{user?.username || "Waiter"}</strong>
            </span>
            <FaUserCircle className="text-2xl" />
            <Button variant="outline" size="sm" onClick={toggleDarkMode}>
              {darkMode ? "Light Mode" : "Dark Mode"}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </header>

        {/* Mobile sliding menu */}
        {mobileMenuOpen && (
          <aside className="fixed inset-y-0 left-0 w-56 bg-white dark:bg-gray-800 shadow-lg z-40 p-4 flex flex-col">
            {menuSections.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md mb-1 focus:outline-none ${
                  active === id
                    ? "bg-gray-300 dark:bg-gray-700 font-semibold"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                aria-current={active === id ? "page" : undefined}
              >
                <Icon className="text-lg" />
                <span>{label}</span>
              </button>
            ))}
          </aside>
        )}

        {/* Overlay behind mobile menu */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black opacity-30 z-30"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {active === "orders" && <OrdersHub />}
          {active === "history" && <HistoryPage />}
          {active === "tables" && <MyTables />}
        </main>
      </div>
    </div>
  );
}
