// src/pages/WaiterDashboard.jsx
import React, { useState, useEffect } from "react";
import { FaBars, FaUtensils, FaHistory, FaTable } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../context/AuthContext";

// Import your components
import OrdersHub from "@/components/waiter/OrdersHub";
import HistoryPage from "@/components/waiter/HistoryPage";
import MyTables from "@/components/waiter/MyTables";

export default function WaiterDashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState("orders"); // default to Orders
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  // Handle resize
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (mobile && !sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarOpen]);

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
    { id: "orders", icon: FaUtensils, label: "Orders" },
    { id: "history", icon: FaHistory, label: "History" },
    { id: "tables", icon: FaTable, label: "My Tables" },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">

        {/* Sidebar */}
        <aside
          className={`fixed md:relative z-30 top-0 left-0 h-full md:h-auto
            bg-white dark:bg-gray-800 shadow-lg transition-all duration-300
            flex flex-col
            ${isMobile ? (sidebarOpen ? "w-64" : "w-0") : sidebarOpen ? "w-64" : "w-20"}`}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <img src="/logo.png" alt="Logo" className="w-8 h-8" />
              {sidebarOpen && <span className="font-bold text-lg">Waiter Panel</span>}
            </div>
          </div>

          {/* Sidebar Menu */}
          <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar px-2">
            {menuSections.map((item) => (
              <div
                key={item.id}
                className={`flex items-center cursor-pointer px-3 py-2 rounded-md mb-1
                  hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors
                  ${active === item.id ? "bg-gray-300 dark:bg-gray-700 font-semibold" : ""}`}
                onClick={() => handleSelect(item.id)}
              >
                <item.icon className="text-lg" />
                {sidebarOpen && <span className="ml-3">{item.label}</span>}
              </div>
            ))}
          </nav>
        </aside>

        {/* Backdrop for mobile */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={toggleSidebar}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <header className="flex justify-between items-center bg-white dark:bg-gray-800 shadow px-4 py-3">
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleSidebar}
                className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <FaBars />
              </button>
              <span>
                Welcome, <strong>{user?.username || "Waiter"}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={toggleDarkMode}>
                {darkMode ? "Light Mode" : "Dark Mode"}
              </Button>
              <Button variant="destructive" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          </header>

          {/* Content Area */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4">
            {active === "orders" && <OrdersHub />}
            {active === "history" && <HistoryPage />}
            {active === "tables" && <MyTables />}
          </main>
        </div>
      </div>
    </div>
  );
}
