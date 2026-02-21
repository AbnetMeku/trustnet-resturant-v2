import React, { useState, useEffect } from "react";
import {
  FaUserPlus,
  FaTable,
  FaUtensils,
  FaBars,
  FaChartBar,
  FaBoxes,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import UserManagement from "@/components/admin/UserManagement";
import TableManagement from "@/components/admin/TableManagement";
import MenuManagement from "@/components/admin/MenuManagement";

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState("overview");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (mobile && !sidebarOpen) {
        setSidebarOpen(false);
      }
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
    if (id === "inventory") {
      navigate("/inventory");
      return;
    }
    setActive(id);
    if (isMobile) setSidebarOpen(false);
  };

  // Omit 'stations' from menu for managers
  const menuItems = [
    { id: "overview", icon: FaChartBar, label: "Overview" },
    { id: "users", icon: FaUserPlus, label: "Users" },
    { id: "tables", icon: FaTable, label: "Tables" },
    { id: "menu", icon: FaUtensils, label: "Menu" },
    { id: "reports", icon: FaBars, label: "Reports" },
    { id: "inventory", icon: FaBoxes, label: "Inventory" },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">

        {/* Sidebar */}
        <aside
          className={`
            fixed md:relative z-30 top-0 left-0 h-full md:h-auto
            bg-white dark:bg-gray-800 shadow-lg transition-all duration-300
            flex flex-col
            ${isMobile ? (sidebarOpen ? "w-64" : "w-0") : sidebarOpen ? "w-64" : "w-16"}
          `}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <img src="/logo.png" alt="Logo" className="w-8 h-8" />
              {!isMobile && sidebarOpen && (
                <span className="font-bold text-lg">Manager Panel</span>
              )}
            </div>
          </div>

          {/* Sidebar Menu */}
          <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar">
            {menuItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center cursor-pointer px-4 py-3 rounded-md mx-2 mb-2
                  hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors
                  ${active === item.id ? "bg-gray-300 dark:bg-gray-700 font-semibold" : ""}
                `}
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
                Welcome, <strong>{user?.username || "Manager"}</strong>
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
            {active === "overview" && (
              <Card className="p-6 w-full">
                <h2 className="text-xl font-bold mb-4">Overview</h2>
                <p>Quick stats and KPIs will go here.</p>
              </Card>
            )}

            {active === "users" && (
              <Card className="p-6 w-full">
                <h2 className="text-xl font-bold mb-4">Users Management</h2>
                <UserManagement />
              </Card>
            )}

            {active === "tables" && (
              <Card className="p-6 w-full">
                <h2 className="text-xl font-bold mb-4">Tables Management</h2>
                <TableManagement />
              </Card>
            )}

            {active === "menu" && (
              <Card className="p-6 w-full">
                <h2 className="text-xl font-bold mb-4">Menu Items</h2>
                <MenuManagement />
              </Card>
            )}

            {active === "reports" && (
              <Card className="p-6 w-full">
                <h2 className="text-xl font-bold mb-4">Reports</h2>
                <p>Sales, orders, and performance reports will appear here.</p>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
