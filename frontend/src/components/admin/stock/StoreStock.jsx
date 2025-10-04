import React, { useState, useEffect } from "react";
import { getStoreStockWithDate } from "@/api/inventory";
import { format } from "date-fns";

export default function StoreStock() {
  const [stockItems, setStockItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch store stock whenever date changes
  useEffect(() => {
    async function fetchStock() {
      try {
        setLoading(true);
        const data = await getStoreStockWithDate({ date: selectedDate });
        setStockItems(data);
        setFilteredItems(data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchStock();
  }, [selectedDate]);

  // Filter by search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredItems(stockItems);
    } else {
      setFilteredItems(
        stockItems.filter(item =>
          item.menu_item.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }
  }, [searchTerm, stockItems]);

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading store stock...</p>;
  if (error) return <p className="text-red-500 dark:text-red-400">Error: {error}</p>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Store Stock</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* Date Picker */}
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
        />
        {/* Search */}
        <input
          type="text"
          placeholder="Search item..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="p-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
        />
      </div>

      {/* Stock Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse border border-gray-300 dark:border-gray-600 shadow-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-700 dark:text-gray-200">Item Name</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Purchased</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Transferred Out</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.menu_item_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">{item.menu_item}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">{item.purchased}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">{item.transferred_out}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{item.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
