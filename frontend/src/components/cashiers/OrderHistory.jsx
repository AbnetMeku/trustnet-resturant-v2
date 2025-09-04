import React, { useState, useEffect, useRef } from "react";
import { getSalesSummary } from "@/api/reportApi";
import { getUsers } from "@/api/users";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Loader2 } from "lucide-react";

export default function SalesSummaryReport({ darkMode }) {
  const [data, setData] = useState(null);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const today = new Date();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [waiterId, setWaiterId] = useState("");
  const [vipOnly, setVipOnly] = useState("all");
  const reportRef = useRef(null);

  // Fetch waiters for dropdown
  useEffect(() => {
    async function fetchWaiters() {
      try {
        const waitersData = await getUsers("waiter");
        setWaiters([{ id: "", username: "All Waiters" }, ...waitersData]);
      } catch {
        setWaiters([{ id: "", username: "All Waiters" }]);
      }
    }
    fetchWaiters();
  }, []);

  // Fetch report data dynamically
  useEffect(() => {
    async function fetchReportData() {
      setLoading(true);
      setError(null);
      try {
        const vipParam = vipOnly === "all" ? null : vipOnly === "vip";
        const result = await getSalesSummary(
          startDate.toISOString().slice(0, 10),
          endDate.toISOString().slice(0, 10),
          waiterId === "" ? null : waiterId,
          vipParam
        );
        setData(result);
      } catch (err) {
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchReportData();
  }, [startDate, endDate, waiterId, vipOnly]);

  return (
    <div className={`p-6 max-w-6xl mx-auto ${darkMode ? "dark bg-gray-800 " : "bg-gray-400 "}`}>
      {/* Filter Section */}
      <div className="mb-8 bg-gray-50 dark:bg-gray-800 p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </span>
            <DatePicker
              selected={startDate}
              onChange={(date) => {
                setStartDate(date);
                if (endDate < date) setEndDate(date);
              }}
              className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholderText="Select start date"
              aria-label="Start date"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </span>
            <DatePicker
              selected={endDate}
              onChange={setEndDate}
              minDate={startDate}
              className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholderText="Select end date"
              aria-label="End date"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Waiter
            </span>
            <select
              value={waiterId}
              onChange={(e) => setWaiterId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Select waiter"
            >
              {waiters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.username || w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Table Type
            </span>
            <select
              value={vipOnly}
              onChange={(e) => setVipOnly(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Select table type"
            >
              <option value="all">All</option>
              <option value="vip">VIP Only</option>
              <option value="normal">Normal Only</option>
            </select>
          </label>
        </div>
      </div>

      {/* Loading and Error States */}
      {loading && (
        <div className="flex justify-center items-center py-4">
          <Loader2 className="animate-spin h-6 w-6 text-blue-500" />
          <span className="ml-2 text-gray-600 dark:text-gray-300">Loading report...</span>
        </div>
      )}
      {error && (
        <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/50 p-3 rounded-lg">
          Error: {error}
        </p>
      )}
      {!loading && !error && data && data.report.length === 0 && (
        <p className="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          No sales data available.
        </p>
      )}

      {/* Report Section */}
      {!loading && !error && data && data.report.length > 0 && (
        <div ref={reportRef} className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 border-b-2 border-blue-500 pb-2">
            Sales Summary: {data.from} - {data.to}
          </h3>
          {data.report.map((category) => (
            <section
              key={category.category}
              className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow-sm"
            >
              <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                {category.category}
              </h4>
              {category.subcategories.map((subcat) => (
                <div key={subcat.name} className="mb-5">
                  <h5 className="text-base font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                    {subcat.name}
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-blue-500 text-white">
                          <th className="p-3 text-left font-medium">Item</th>
                          <th className="p-3 text-right font-medium">VIP Status</th>
                          <th className="p-3 text-right font-medium">Quantity</th>
                          <th className="p-3 text-right font-medium">Unit Price</th>
                          <th className="p-3 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subcat.items.map((item) => (
                          <tr
                            key={`${item.menu_item_id}-${item.vip_status}`}
                            className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            <td className="p-3 text-gray-900 dark:text-gray-100">{item.name}</td>
                            <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                              {item.vip_status}
                            </td>
                            <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                              {item.quantity}
                            </td>
                            <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                              {item.average_price.toFixed(2)}
                            </td>
                            <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                              {item.total_amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 dark:bg-gray-700 font-medium">
                          <td className="p-3 text-gray-900 dark:text-gray-100">
                            Subtotal for {subcat.name}
                          </td>
                          <td className="p-3"></td>
                          <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                            {subcat.total_qty}
                          </td>
                          <td className="p-3"></td>
                          <td className="p-3 text-right text-gray-900 dark:text-gray-100">
                            {subcat.total_amount.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="border-t-2 border-blue-500 pt-2 text-right text-gray-900 dark:text-gray-100">
                Total for {category.category}: Quantity: {category.total_qty} | Amount: {category.total_amount.toFixed(2)}
              </div>
            </section>
          ))}
          {data.grand_totals && (
            <div className="bg-gray-900 dark:bg-gray-700 text-white p-4 rounded-lg text-right font-medium">
              Grand Total Sales Amount: {data.grand_totals.total_amount.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}