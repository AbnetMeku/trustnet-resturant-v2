import React, { useState, useEffect, useRef } from "react";
import { getSalesSummary, reopenWaiterDay } from "@/api/reportApi";
import { fetchWaiterDayCloseStatusForWaiter } from "@/api/order_history";
import { getUsers } from "@/api/users";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Loader2 } from "lucide-react";
import { eatBusinessDateISO, eatDateISO, msUntilNextBusinessStart } from "@/lib/timezone";

function getAdjustedEATDate() {
  const now = new Date();
  const utcHour = now.getUTCHours(); // UTC time hour

  // EAT = UTC +3 â†’ So between UTC 0â€“2 means before local 3AM â†’ still show previous day
  if (utcHour < 3) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return yesterday;
  }

  return now;
}

export default function SalesSummaryReport({ darkMode }) {
  const [data, setData] = useState(null);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState(null);
  const [waiterDayStatus, setWaiterDayStatus] = useState(null);
  const [waiterDayLoading, setWaiterDayLoading] = useState(false);
  const [waiterDayError, setWaiterDayError] = useState(null);

  // âœ… Adjusted â€œtodayâ€ based on EATâ€“UTC difference
  const adjustedToday = new Date(`${eatBusinessDateISO()}T12:00:00`);

  // âœ… Make sure these are defined before they are used
  const [waiterId, setWaiterId] = useState("");
  const [vipOnly, setVipOnly] = useState("all");
  const [startDate, setStartDate] = useState(adjustedToday);
  const [endDate, setEndDate] = useState(adjustedToday);

  const reportRef = useRef(null);
  const authToken = localStorage.getItem("auth_token");
  const selectedWaiter = waiters.find((w) => String(w.id) === String(waiterId));
  const selectedWaiterName = selectedWaiter?.username || selectedWaiter?.name || "Waiter";
  const waiterStatusLabel = waiterDayStatus
    ? waiterDayStatus.isClosedForToday
      ? "Closed"
      : "Open"
    : "Loading...";
  const waiterStatusClass = waiterDayStatus
    ? waiterDayStatus.isClosedForToday
      ? "text-rose-600"
      : "text-emerald-600"
    : "text-gray-500";



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

  const refreshWaiterDayStatus = async (targetWaiterId) => {
    if (!authToken || !targetWaiterId) {
      setWaiterDayStatus(null);
      return;
    }
    setWaiterDayLoading(true);
    setWaiterDayError(null);
    try {
      const status = await fetchWaiterDayCloseStatusForWaiter(authToken, targetWaiterId);
      setWaiterDayStatus(status);
    } catch (err) {
      setWaiterDayError(err?.message || "Failed to load waiter shift status.");
      setWaiterDayStatus(null);
    } finally {
      setWaiterDayLoading(false);
    }
  };

  useEffect(() => {
    if (!waiterId) {
      setWaiterDayStatus(null);
      setWaiterDayError(null);
      return;
    }
    refreshWaiterDayStatus(waiterId);
  }, [waiterId, authToken]);

  useEffect(() => {
    if (!authToken || !waiterId) return;
    let timerId;
    let cancelled = false;

    const scheduleNextRefresh = () => {
      if (cancelled) return;
      const delay = msUntilNextBusinessStart();
      timerId = setTimeout(async () => {
        if (cancelled) return;
        await refreshWaiterDayStatus(waiterId);
        scheduleNextRefresh();
      }, delay);
    };

    scheduleNextRefresh();

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [authToken, waiterId]);

    const handleReopenWaiterDay = async () => {
    if (!waiterId) return;
    setWaiterDayLoading(true);
    setWaiterDayError(null);
    try {
      await reopenWaiterDay(waiterId);
      await refreshWaiterDayStatus(waiterId);
    } catch (err) {
      setWaiterDayError(err?.response?.data?.error || err?.message || "Failed to reopen waiter day.");
    } finally {
      setWaiterDayLoading(false);
    }
  };

  // Fetch report data dynamically
  useEffect(() => {
    async function fetchReportData() {
      setLoading(true);
      setError(null);
      try {
        const vipParam = vipOnly === "all" ? null : vipOnly === "vip";
        const result = await getSalesSummary(
          eatDateISO(startDate),
          eatDateISO(endDate),
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

  // PDF Export
  const exportPDF = async () => {
    if (!data) {
      setError("No data available to export.");
      return;
    }

    setPdfLoading(true);
    setError(null);

    try {
      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const lineHeight = 20;
      let yPosition = margin;

      // Load Noto Serif Ethiopic font
      const fontUrl = "/fonts/NotoSerifEthiopic-Regular.ttf";
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error("Failed to load font file");
      const fontArrayBuffer = await response.arrayBuffer();
      const fontBase64 = btoa(
        new Uint8Array(fontArrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      pdf.addFileToVFS("NotoSerifEthiopic-Regular.ttf", fontBase64);
      pdf.addFont("NotoSerifEthiopic-Regular.ttf", "NotoSerifEthiopic", "normal");
      pdf.setFont("NotoSerifEthiopic");

      const addNewPageIfNeeded = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };

      // Title
      pdf.setFontSize(16);
      pdf.setTextColor(17, 24, 39); // Gray-900
      pdf.text(`Sales Summary: ${data.from} - ${data.to}`, margin, yPosition);
      pdf.setLineWidth(1);
      pdf.setDrawColor(59, 130, 246); // Blue-500
      pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
      yPosition += lineHeight * 2;

      // Categories
      data.report.forEach((category) => {
        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(14);
        pdf.setTextColor(17, 24, 39); // Gray-900
        pdf.text(category.category, margin, yPosition);
        yPosition += lineHeight + 10;

        category.subcategories.forEach((subcat) => {
          addNewPageIfNeeded(lineHeight);
          pdf.setFontSize(12);
          pdf.setTextColor(79, 70, 229); // Indigo-600
          pdf.text(subcat.name, margin + 20, yPosition);
          yPosition += lineHeight + 5;

          const tableData = subcat.items.map((item) => [
            item.name,
            item.vip_status,
            item.quantity.toString(),
            item.average_price.toFixed(2),
            item.total_amount.toFixed(2),
          ]);

          tableData.push([
            `Subtotal for ${subcat.name}`,
            "",
            subcat.total_qty.toString(),
            "",
            subcat.total_amount.toFixed(2),
          ]);

          addNewPageIfNeeded(100);
          autoTable(pdf, {
            startY: yPosition,
            head: [["Item", "VIP Status", "Quantity", "Unit Price", "Total"]],
            body: tableData,
            theme: "grid",
            headStyles: {
              fillColor: [59, 130, 246], // Blue-500
              textColor: [255, 255, 255],
              font: "NotoSerifEthiopic",
              fontStyle: "normal",
            },
            bodyStyles: {
              textColor: [17, 24, 39], // Gray-900
              font: "NotoSerifEthiopic",
              fontStyle: "normal",
            },
            alternateRowStyles: {
              fillColor: [243, 244, 246], // Gray-100
            },
            margin: { left: margin + 20, right: margin },
            styles: { fontSize: 10, font: "NotoSerifEthiopic", cellPadding: 8 },
            columnStyles: {
              0: { cellWidth: "auto" },
              1: { cellWidth: 80 },
              2: { cellWidth: 60, halign: "right" },
              3: { cellWidth: 60, halign: "right" },
              4: { cellWidth: 80, halign: "right" },
            },
          });

          yPosition = (pdf.lastAutoTable?.finalY || yPosition) + lineHeight;
        });

        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39); // Gray-900
        pdf.text(
          `Total for ${category.category}: Quantity: ${category.total_qty} | Amount: ${category.total_amount.toFixed(2)}`,
          margin + 10,
          yPosition
        );
        pdf.setDrawColor(59, 130, 246); // Blue-500
        pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
        yPosition += lineHeight + 10;
      });

      // Grand Total
      if (data.grand_totals) {
        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(12);
        pdf.setTextColor(255, 255, 255);
        pdf.setFillColor(17, 24, 39); // Gray-900
        pdf.rect(margin, yPosition - 5, pageWidth - 2 * margin, 25, "F");
        pdf.text(
          `Grand Total Sales Amount: ${data.grand_totals.total_amount.toFixed(2)}`,
          margin + 10,
          yPosition + 10
        );
        yPosition += lineHeight + 10;
      }

      pdf.save("sales_summary_report.pdf");
    } catch (err) {
      setError("Failed to export PDF: " + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // PDF Preview
  const previewPDF = async () => {
    if (!data) {
      setError("No data available to preview.");
      return;
    }

    setPdfLoading(true);
    setError(null);

    try {
      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const lineHeight = 20;
      let yPosition = margin;

      // Load Noto Serif Ethiopic font
      const fontUrl = "/fonts/NotoSerifEthiopic-Regular.ttf";
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error("Failed to load font file");
      const fontArrayBuffer = await response.arrayBuffer();
      const fontBase64 = btoa(
        new Uint8Array(fontArrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      pdf.addFileToVFS("NotoSerifEthiopic-Regular.ttf", fontBase64);
      pdf.addFont("NotoSerifEthiopic-Regular.ttf", "NotoSerifEthiopic", "normal");
      pdf.setFont("NotoSerifEthiopic");

      const addNewPageIfNeeded = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
      };

      // Title
      pdf.setFontSize(16);
      pdf.setTextColor(17, 24, 39); // Gray-900
      pdf.text(`Sales Summary: ${data.from} - ${data.to}`, margin, yPosition);
      pdf.setLineWidth(1);
      pdf.setDrawColor(59, 130, 246); // Blue-500
      pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
      yPosition += lineHeight * 2;

      // Categories
      data.report.forEach((category) => {
        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(14);
        pdf.setTextColor(17, 24, 39); // Gray-900
        pdf.text(category.category, margin, yPosition);
        yPosition += lineHeight + 10;

        category.subcategories.forEach((subcat) => {
          addNewPageIfNeeded(lineHeight);
          pdf.setFontSize(12);
          pdf.setTextColor(79, 70, 229); // Indigo-600
          pdf.text(subcat.name, margin + 20, yPosition);
          yPosition += lineHeight + 5;

          const tableData = subcat.items.map((item) => [
            item.name,
            item.vip_status,
            item.quantity.toString(),
            item.average_price.toFixed(2),
            item.total_amount.toFixed(2),
          ]);

          tableData.push([
            `Subtotal for ${subcat.name}`,
            "",
            subcat.total_qty.toString(),
            "",
            subcat.total_amount.toFixed(2),
          ]);

          addNewPageIfNeeded(100);
          autoTable(pdf, {
            startY: yPosition,
            head: [["Item", "VIP Status", "Quantity", "Unit Price", "Total"]],
            body: tableData,
            theme: "grid",
            headStyles: {
              fillColor: [59, 130, 246], // Blue-500
              textColor: [255, 255, 255],
              font: "NotoSerifEthiopic",
              fontStyle: "normal",
            },
            bodyStyles: {
              textColor: [17, 24, 39], // Gray-900
              font: "NotoSerifEthiopic",
              fontStyle: "normal",
            },
            alternateRowStyles: {
              fillColor: [243, 244, 246], // Gray-100
            },
            margin: { left: margin + 20, right: margin },
            styles: { fontSize: 10, font: "NotoSerifEthiopic", cellPadding: 8 },
            columnStyles: {
              0: { cellWidth: "auto" },
              1: { cellWidth: 80 },
              2: { cellWidth: 60, halign: "right" },
              3: { cellWidth: 60, halign: "right" },
              4: { cellWidth: 80, halign: "right" },
            },
          });

          yPosition = (pdf.lastAutoTable?.finalY || yPosition) + lineHeight;
        });

        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39); // Gray-900
        pdf.text(
          `Total for ${category.category}: Quantity: ${category.total_qty} | Amount: ${category.total_amount.toFixed(2)}`,
          margin + 10,
          yPosition
        );
        pdf.setDrawColor(59, 130, 246); // Blue-500
        pdf.line(margin, yPosition + 5, pageWidth - margin, yPosition + 5);
        yPosition += lineHeight + 10;
      });

      // Grand Total
      if (data.grand_totals) {
        addNewPageIfNeeded(lineHeight);
        pdf.setFontSize(12);
        pdf.setTextColor(255, 255, 255);
        pdf.setFillColor(17, 24, 39); // Gray-900
        pdf.rect(margin, yPosition - 5, pageWidth - 2 * margin, 25, "F");
        pdf.text(
          `Grand Total Sales Amount: ${data.grand_totals.total_amount.toFixed(2)}`,
          margin + 10,
          yPosition + 10
        );
      }

      window.open(pdf.output("bloburl"), "_blank");
    } catch (err) {
      setError("Failed to preview PDF: " + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // Excel Export
  const exportExcel = () => {
    if (!data) {
      setError("No data available to export.");
      return;
    }

    const wsData = [];
    data.report.forEach((category) => {
      wsData.push([category.category]);
      category.subcategories.forEach((subcat) => {
        wsData.push([subcat.name, "Quantity", "Total Amount"]);
        subcat.items.forEach((item) => {
          wsData.push([item.name, item.quantity, item.total_amount]);
        });
        wsData.push([`${subcat.name} Total`, subcat.total_qty, subcat.total_amount]);
        wsData.push([]);
      });
      wsData.push([`${category.category} Total`, category.total_qty, category.total_amount]);
      wsData.push([]);
    });
    wsData.push(["Grand Total", "", data.grand_totals.total_amount]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Sales Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "sales_summary_report.xlsx");
  };

  return (
    <div className={`p-6 max-w-6xl mx-auto ${darkMode ? "dark bg-gray-800 " : "bg-gray-800 "}`}>
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
        <div className="flex space-x-4 mt-6">
          <button
            type="button"
            onClick={exportPDF}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50 transition-colors"
            disabled={loading || pdfLoading}
          >
            {pdfLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Exporting...
              </>
            ) : (
              "Export PDF"
            )}
          </button>
          <button
            type="button"
            onClick={previewPDF}
            className="bg-gray-600 text-white px-5 py-2 rounded-lg hover:bg-gray-700 flex items-center disabled:opacity-50 transition-colors"
            disabled={loading || pdfLoading}
          >
            {pdfLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Previewing...
              </>
            ) : (
              "Preview PDF"
            )}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 flex items-center disabled:opacity-50 transition-colors"
            disabled={loading || pdfLoading}
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="mb-8 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Waiter Shift Control
            </h3>
            {waiterDayLoading && (
              <span className="text-sm text-gray-500 dark:text-gray-400">Updating...</span>
            )}
          </div>

          {!waiterId ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Select a waiter above to close or reopen their shift.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-gray-900/40 rounded-lg p-3 border border-slate-200/80 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Waiter</p>
                  <p className="text-sm font-semibold">{selectedWaiterName}</p>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/40 rounded-lg p-3 border border-slate-200/80 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                  <p className={`text-sm font-semibold ${waiterStatusClass}`}>
                    {waiterStatusLabel}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/40 rounded-lg p-3 border border-slate-200/80 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Open Orders</p>
                  <p className="text-sm font-semibold">{waiterDayStatus?.openOrdersCount ?? "â€”"}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReopenWaiterDay}
                  disabled={waiterDayLoading}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Reopen Waiter Day
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Reopens automatically on the next business day.
                </span>
              </div>
            </>
          )}

          {waiterDayError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{waiterDayError}</p>
          )}
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







