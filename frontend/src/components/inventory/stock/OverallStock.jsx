import React, { useState, useEffect } from "react";
import { getOverallStock } from "@/api/inventory";

export default function TotalStock() {
  const [stockItems, setStockItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStock() {
      try {
        setLoading(true);
        const data = await getOverallStock();
        setStockItems(data);
        setFilteredItems(data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchStock();
  }, []);

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

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading total stock...</p>;
  if (error) return <p className="text-red-500 dark:text-red-400">Error: {error}</p>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Total Stock</h2>

      {/* Search Bar */}
      <div className="mb-4 flex justify-start">
        <input
          type="text"
          placeholder="Search menu item..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="p-2 w-52 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition duration-150"
        />
      </div>

      {/* Stock Table */}
      <div className="overflow-x-auto rounded-md shadow-sm border border-gray-300 dark:border-gray-600">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-700 dark:text-gray-200">Menu Item</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Store Quantity</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Station Quantity</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-700 dark:text-gray-200">Total Quantity</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr
                key={`${item.menu_item_id}-${item.menu_item}`}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
              >
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">{item.menu_item}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">{item.store_quantity}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right">{item.station_quantity}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{item.total_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
