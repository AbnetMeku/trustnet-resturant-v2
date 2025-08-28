import React, { useState, useEffect } from "react";
import { FaUserCircle, FaBars, FaTimes } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

import StationOrders from "@/components/station/StationOrders";

export default function StationDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Ensure Tailwind dark mode works on root element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Close mobile menu when resizing to desktop
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

  const handleLogout = () => {
    logout();
    navigate("/station-login");
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top bar */}
      <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Hamburger (only useful if we add sidebar later) */}
          <button
            className="block md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>

          {/* Logo */}
          <img
            src="/logo.png"
            alt="Station Logo"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
          />
          <span className="font-bold text-base sm:text-lg hidden sm:inline">
            Station Dashboard
          </span>
        </div>

        {/* User controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <span className="hidden sm:inline text-sm md:text-base truncate max-w-[120px]">
            Hello, <strong>{user?.username || "Station"}</strong>
          </span>
          <FaUserCircle className="text-xl sm:text-2xl shrink-0" />
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 text-sm sm:text-base">
        <StationOrders />
      </main>
    </div>
  );
}
