import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import NewOrder from "@/components/waiter/NewOrder";
import ActiveOrders from "@/components/waiter/ActiveOrders";

export default function OrdersHub({ isShiftClosedToday = false }) {
  const [view, setView] = useState("hub"); // hub | new | active
  const [error, setError] = useState("");

  const handleBack = () => {
    setError("");
    setView("hub");
  };

  if (view === "new") {
    return <NewOrder goBack={handleBack} setError={setError} />;
  }

  if (view === "active") {
    return <ActiveOrders goBack={handleBack} setError={setError} />;
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-4xl">
        {error && <div className="text-red-500 mb-4">{error}</div>}

        {isShiftClosedToday && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            ዛሬ ቀንዎን ዘግተዋል። አዲስ/ጭማሪ ትዕዛዝ መክፈት እስከ ነገ አይቻልም።
          </div>
        )}

        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2">
          <Card
            onClick={() => !isShiftClosedToday && setView("new")}
            className={`h-48 sm:h-64 flex items-center justify-center text-3xl font-extrabold text-gray-800 bg-slate-200 rounded-2xl shadow-xl transition-transform transform focus:outline-none focus:ring-4 focus:ring-slate-300 ${
              isShiftClosedToday
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:scale-105 hover:bg-slate-300 hover:shadow-2xl"
            }`}
            tabIndex={0}
            role="button"
            aria-disabled={isShiftClosedToday}
            aria-label="New Order"
            onKeyDown={(e) =>
              !isShiftClosedToday && (e.key === "Enter" || e.key === " ") && setView("new")
            }
          >
            አዲስ ትዕዛዝ
          </Card>

          <Card
            onClick={() => !isShiftClosedToday && setView("active")}
            className={`h-48 sm:h-64 flex items-center justify-center text-3xl font-extrabold text-gray-800 bg-slate-200 rounded-2xl shadow-xl transition-transform transform focus:outline-none focus:ring-4 focus:ring-slate-300 ${
              isShiftClosedToday
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:scale-105 hover:bg-slate-300 hover:shadow-2xl"
            }`}
            tabIndex={0}
            role="button"
            aria-disabled={isShiftClosedToday}
            aria-label="Active Orders"
            onKeyDown={(e) =>
              !isShiftClosedToday && (e.key === "Enter" || e.key === " ") && setView("active")
            }
          >
            ጭማሪ ትዕዛዝ
          </Card>
        </div>
      </div>
    </main>
  );
}
