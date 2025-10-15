import React, { useState, useEffect } from "react";
import { getWaiterSummary, getWaiterDetails } from "@/api/reportApi";
import toast from "react-hot-toast";

export default function WaiterSummaryReport() {
  // Default to today
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalWaiter, setModalWaiter] = useState("");
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Fetch summary report
  const fetchReport = async () => {
    if (!startDate || !endDate) return;

    // Validation: startDate must not be after endDate
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date cannot be after end date");
      return;
    }

    setLoading(true);
    try {
      const data = await getWaiterSummary(startDate, endDate);
      setReport(data.report || []);
      setGrandTotal(data.grand_total || 0);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch waiter report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const viewDetails = async (waiter) => {
    setModalLoading(true);
    setShowModal(true);
    setModalWaiter(waiter.waiter_name);

    try {
      const data = await getWaiterDetails(waiter.waiter_id, startDate, endDate);
      setModalItems(data.details || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch waiter details");
    } finally {
      setModalLoading(false);
    }
  };

  // Tailwind dark mode classes added
  const tableHeadClass = "border p-2 text-left bg-gray-200 dark:bg-gray-700 dark:text-white";
  const tableCellClass = "border p-2 dark:text-white";
  const tableRowHover = "hover:bg-gray-100 dark:hover:bg-gray-800";

  return (
    <div className="p-4 dark:bg-gray-900 dark:text-white min-h-screen">
      <h2 className="text-xl font-bold mb-4">Waiter Summary Report</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="date"
          className="border p-1 rounded dark:bg-gray-700 dark:text-white"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          type="date"
          className="border p-1 rounded dark:bg-gray-700 dark:text-white"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : report.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-300">No data available for selected dates</p>
      ) : (
        <table className="w-full border-collapse border dark:border-gray-700">
          <thead>
            <tr>
              <th className={tableHeadClass}>Waiter Name</th>
              <th className={tableHeadClass + " text-right"}>Total Sales</th>
              <th className={tableHeadClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {report.map((waiter, idx) => (
              <tr key={idx} className={tableRowHover}>
                <td className={tableCellClass}>{waiter.waiter_name}</td>
                <td className={`${tableCellClass} text-right`}>{(waiter.total_sales || 0).toFixed(2)}</td>
                <td className={`${tableCellClass} text-center`}>
                  <button
                    className="bg-green-600 text-white px-2 py-1 rounded"
                    onClick={() => viewDetails(waiter)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
            <tr className={`font-bold ${tableRowHover}`}>
              <td className={tableCellClass}>Grand Total</td>
              <td className={`${tableCellClass} text-right`}>{(grandTotal || 0).toFixed(2)}</td>
              <td className={tableCellClass}></td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded w-11/12 max-w-2xl relative">
            <h3 className="text-lg font-bold mb-2 dark:text-white">Details for {modalWaiter}</h3>
            <button
              className="absolute top-2 right-2 text-red-600 font-bold"
              onClick={() => setShowModal(false)}
            >
              ✕
            </button>

            {modalLoading ? (
              <p>Loading...</p>
            ) : modalItems.length === 0 ? (
              <p className="dark:text-gray-300">No items sold by this waiter</p>
            ) : (
              <table className="w-full border-collapse border mt-2 dark:border-gray-700">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-700 dark:text-white">
                    <th className="border p-1 text-left">Item Name</th>
                    <th className="border p-1 text-right">Quantity</th>
                    <th className="border p-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {modalItems.map((item, idx) => (
                    <tr key={idx} className={tableRowHover}>
                      <td className="border p-1 dark:text-white">{item.item_name}</td>
                      <td className="border p-1 text-right dark:text-white">{item.quantity_sold || 0}</td>
                      <td className="border p-1 text-right dark:text-white">{(item.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
