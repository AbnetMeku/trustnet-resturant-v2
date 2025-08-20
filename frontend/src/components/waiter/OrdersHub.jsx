import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import NewOrder from "@/components/waiter/NewOrder";
import ActiveOrders from "@/components/waiter/ActiveOrders";

export default function OrdersHub() {
  const [view, setView] = useState("hub"); // hub | new | active
  const [error, setError] = useState(""); // Add error state for child components

  const handleBack = () => {
    setError("");
    setView("hub");
  };

  if (view === "new") {
    return <NewOrder goBack={handleBack} setError={setError} />;
  } else if (view === "active") {
    return <ActiveOrders goBack={handleBack} setError={setError} />;
  } else {
    // hub view
    return (
      <main className="flex items-center justify-center h-full px-6 bg-gray-50 dark:bg-gray-900">
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-5xl">
          <Card
            onClick={() => setView("new")}
            className="cursor-pointer h-48 sm:h-64 flex items-center justify-center text-3xl font-extrabold text-gray-800 bg-slate-200 rounded-2xl shadow-xl transition-transform transform hover:scale-105 hover:bg-slate-300 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-slate-300"
            tabIndex={0}
            role="button"
            aria-label="New Order"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setView("new")}
          >
            New Order
          </Card>
          <Card
            onClick={() => setView("active")}
            className="cursor-pointer h-48 sm:h-64 flex items-center justify-center text-3xl font-extrabold text-gray-800 bg-slate-200 rounded-2xl shadow-xl transition-transform transform hover:scale-105 hover:bg-slate-300 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-slate-300"
            tabIndex={0}
            role="button"
            aria-label="Active Orders"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setView("active")}
          >
            Active Orders
          </Card>
        </div>
      </main>
    );
  }
}