import React, { useEffect, useState } from "react";
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
import { fetchWaiterDayCloseStatus } from "@/api/order_history";
import { msUntilNextBusinessStart } from "@/lib/timezone";

import OrdersHub from "@/components/waiter/OrdersHub";
import HistoryPage from "@/components/waiter/HistoryPage";
import MyTables from "@/components/waiter/MyTables";
import PrintFailures from "@/components/waiter/PrintFailures";

export default function WaiterDashboard() {
  const { user, logout, authToken } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();

  const [active, setActive] = useState("orders");
  const [isShiftClosedToday, setIsShiftClosedToday] = useState(false);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true" || false
  );

  useEffect(() => {
    if (!authToken || user?.role !== "waiter") return;

    let timerId;
    let cancelled = false;

    const loadShiftStatus = async () => {
      try {
        const status = await fetchWaiterDayCloseStatus(authToken);
        const closed = Boolean(status?.isClosedForToday);
        setIsShiftClosedToday(closed);
        if (closed) {
          setActive((prev) => (prev === "orders" ? "history" : prev));
        }
      } catch {
        // Ignore status fetch errors; waiter can still navigate.
      }
    };

    const scheduleNextRefresh = () => {
      if (cancelled) return;
      const delay = msUntilNextBusinessStart(branding?.business_day_start_time);
      timerId = setTimeout(async () => {
        if (cancelled) return;
        await loadShiftStatus();
        scheduleNextRefresh();
      }, delay);
    };

    loadShiftStatus();
    scheduleNextRefresh();

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [authToken, user, branding?.business_day_start_time]);

  const handleShiftStatusChange = (status) => {
    const closed = Boolean(status?.isClosedForToday);
    setIsShiftClosedToday(closed);
    if (closed) {
      setActive((prev) => (prev === "orders" ? "history" : prev));
    }
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const handleSelect = (id) => {
    if (id === "orders" && isShiftClosedToday) {
      return;
    }
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
      <div className="admin-shell flex flex-col min-h-dvh w-full overflow-hidden">
        <header className="admin-header px-4 py-3 md:px-6">
          <div className="admin-header-inner">
            <div className="flex items-center gap-3">
              <div className="admin-logo-wrap">
                <img src={branding.logo_url} alt="Logo" className="w-9 h-9 object-contain rounded" />
              </div>
              <span className="font-semibold text-sm sm:text-base">Waiter</span>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <span className="hidden sm:inline text-sm md:text-base">
                Hello, <strong>{user?.username || "Waiter"}</strong>
              </span>
              <FaUserCircle className="text-xl sm:text-2xl" />
              <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={toggleDarkMode}>
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
                  onClick={() => handleSelect(section.id)}
                  disabled={section.id === "orders" && isShiftClosedToday}
                  data-testid={`waiter-tab-${section.id}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                    active === section.id
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                  } ${
                    section.id === "orders" && isShiftClosedToday ? "opacity-50 cursor-not-allowed" : ""
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
            {active === "orders" && <OrdersHub isShiftClosedToday={isShiftClosedToday} />}
            {active === "history" && <HistoryPage onDayCloseChange={handleShiftStatusChange} />}
            {active === "tables" && <MyTables />}
            {active === "prints" && <PrintFailures />}
          </div>
        </main>
      </div>
    </div>
  );
}
