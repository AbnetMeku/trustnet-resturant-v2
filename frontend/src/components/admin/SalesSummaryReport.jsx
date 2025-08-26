import React, { useState, useEffect, useRef } from "react";
import { getSalesSummary } from "@/api/reportApi";
import { getUsers } from "@/api/users";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as fontModule from "@/fonts/NotoSansEthiopic.js";

import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SalesSummaryReport({ darkMode }) {
  const [data, setData] = useState(null);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState(new Date("2025-08-20"));
  const [endDate, setEndDate] = useState(new Date("2025-08-21"));
  const [waiterId, setWaiterId] = useState("");
  const [vipOnly, setVipOnly] = useState("all");
  const font = fontModule.default || fontModule.font;
  const reportRef = useRef(null);
jsPDF.API.events.push([
  "addFonts",
  function() {
    this.addFileToVFS("NotoSansEthiopic.ttf", font);
    this.addFont("NotoSansEthiopic.ttf", "NotoSansEthiopic", "normal");
  }
]);
  // Fetch waiters for dropdown filter
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

  // Fetch report
  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const vipParam = vipOnly === "all" ? null : vipOnly === "vip" ? true : false;
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
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchReportData();
  };

  // Export PDF preserving styles using the html content ref
  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF("p", "pt", "a4");
    doc.setFontSize(18);
    doc.text("Sales Summary Report", 40, 30);
    doc.setFontSize(12);
    doc.setFont("NotoSansEthiopic");
    //doc.text(`From: ${data.from} To: ${data.to}`, 40, 50);

    doc.html(reportRef.current, {
      callback: (doc) => {
        doc.save("sales_summary_report.pdf");
      },
      margin: [20, 40, 40, 40],
      autoPaging: "text",
      x: 0,
      y: 60,
      width: 500,
      windowWidth: 900
    });
  };

  // Flattened Excel export with all data and totals in a single sheet
  const exportExcel = () => {
    if (!data) return;
    const wsData = [];

    data.report.forEach(category => {
      wsData.push([category.category]);
      category.subcategories.forEach(subcat => {
        wsData.push([subcat.name, "Quantity", "Total Amount"]);
        subcat.items.forEach(item => {
          wsData.push([item.name, item.quantity, item.total_amount]);
        });
        // Subcategory total row
        wsData.push([
          `${subcat.name} Total`,
          subcat.total_qty,
          subcat.total_amount,
        ]);
        wsData.push([]);
      });
      // Category total row
      wsData.push([
        `${category.category} Total`,
        category.total_qty,
        category.total_amount,
      ]);
      wsData.push([]);
    });
    // Grand total row
    wsData.push([
      "Grand Total",
      "",
      data.grand_totals.total_amount,
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Sales Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "sales_summary_report.xlsx");
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <form onSubmit={handleFilterSubmit} className="flex flex-col md:flex-row md:items-center md:gap-4 mb-6 space-y-2 md:space-y-0">
        <label className="flex flex-col">
          <span className="mb-1 font-medium">Start Date</span>
          <DatePicker
            selected={startDate}
            onChange={setStartDate}
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full md:w-auto"
          />
        </label>

        <label className="flex flex-col">
          <span className="mb-1 font-medium">End Date</span>
          <DatePicker
            selected={endDate}
            onChange={setEndDate}
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full md:w-auto"
          />
        </label>

        <label className="flex flex-col">
          <span className="mb-1 font-medium">Waiter</span>
          <select
            value={waiterId}
            onChange={e => setWaiterId(e.target.value)}
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full md:w-auto"
          >
            {waiters.map(w => (
              <option key={w.id} value={w.id}>
                {w.username || w.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col">
          <span className="mb-1 font-medium">Table Type</span>
          <select
            value={vipOnly}
            onChange={e => setVipOnly(e.target.value)}
            className="border p-2 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full md:w-auto"
          >
            <option value="all">All</option>
            <option value="vip">VIP Only</option>
            <option value="normal">Normal Only</option>
          </select>
        </label>

        <div className="flex space-x-2 mt-2 md:mt-0">
          <button
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={exportPDF}
            className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
          >
            Export Excel
          </button>
        </div>
      </form>

      {loading && <p>Loading sales summary...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && data && data.report.length === 0 && (
        <p>No sales data available.</p>
      )}

      {!loading && !error && data && data.report.length > 0 && (
        <div ref={reportRef} className="space-y-8">
          <h3 className="text-xl font-semibold mb-4">
            Sales Summary: {data.from} - {data.to}
          </h3>

          {data.report.map(category => (
            <section
              key={category.category}
              className="border rounded p-4 bg-white dark:bg-gray-800 shadow"
            >
              <h4 className="text-2xl font-bold mb-3 text-teal-600 dark:text-teal-400">
                {category.category} 
              </h4>

              {category.subcategories.map(subcat => (
                <div
                  key={subcat.name}
                  className="pl-6 border-l-4 border-indigo-500 mb-6"
                >
                  <h5 className="font-semibold mb-2 text-indigo-700 dark:text-indigo-400">
                    {subcat.name}
                  </h5>
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 rounded-md">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">
                          Item
                        </th>
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-right">
                          VIP Status
                        </th>
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-right">
                          Quantity
                        </th>
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-right">
                          Unit Price
                        </th>
                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-right">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                {subcat.items.map(item => (
                <tr key={`${item.menu_item_id}-${item.vip_status}`}
                    className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-800 dark:even:bg-gray-900"
                >
                    <td className="border border-gray-300 dark:border-gray-600 p-2">{item.name}</td>
                    <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{item.vip_status}</td>
                    <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{item.quantity}</td>
                    <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{item.average_price.toFixed(2)}</td>
                    <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{item.total_amount.toFixed(2)}</td>
                </tr>
                ))}

                {/* Subcategory total row */}
                <tr className="bg-cyan-500 font-bold">
                <td className="border border-gray-300 dark:border-gray-600 p-2">Subtotal for {subcat.name}</td>
                <td className="border border-gray-300 dark:border-gray-600 p-2"></td>
                <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{subcat.total_qty}</td>
                <td className="border border-gray-300 dark:border-gray-600 p-2"></td>
                <td className="border border-gray-300 dark:border-gray-600 p-2 text-right">{subcat.total_amount.toFixed(2)}</td>
                </tr>

                                    </tbody>
                                </table>
                                </div>

                            ))}
                            <div className="bg-cyan-300 dark:bg-teal-700 text-teal-900 dark:text-teal-100 rounded p-3 font-semibold mt-4 text-right">
  Total for {category.category}: Quantity: {category.total_qty} &nbsp;|&nbsp; Amount: {category.total_amount.toFixed(2)}
</div>

            </section>
          ))}

          {/* Grand Total Display */}
          {data.grand_totals && (
            <div className="mt-6 p-4 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded font-semibold text-right">
              Grand Total Sales Amount: {data.grand_totals.total_amount.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
