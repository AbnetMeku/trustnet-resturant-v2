// src/components/waiter/HistoryPage.jsx
import React from "react";

export default function HistoryPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-2xl font-bold mb-6">History</h2>
      <button className="px-8 py-4 bg-blue-500 text-white rounded-lg text-lg">
        Completed Orders
      </button>
    </div>
  );
}
