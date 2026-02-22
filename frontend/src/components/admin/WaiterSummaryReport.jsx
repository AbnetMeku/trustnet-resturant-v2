import React, { useState, useEffect } from "react";
import { getWaiterSummary, getWaiterDetails } from "@/api/reportApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function WaiterSummaryReport() {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalWaiter, setModalWaiter] = useState("");
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;

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

  return (
    <div className="space-y-4">
      <Card className="p-4 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Waiter Summary Report</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Sales performance by waiter for selected dates.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="date"
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">Loading report...</Card>
      ) : report.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">No data available for selected dates.</Card>
      ) : (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/70">
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-left">Waiter Name</th>
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-right">Total Sales</th>
                <th className="border border-slate-200 dark:border-slate-700 p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.map((waiter, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="border border-slate-200 dark:border-slate-700 p-3">{waiter.waiter_name}</td>
                  <td className="border border-slate-200 dark:border-slate-700 p-3 text-right">{(waiter.total_sales || 0).toFixed(2)}</td>
                  <td className="border border-slate-200 dark:border-slate-700 p-3">
                    <Button size="sm" onClick={() => viewDetails(waiter)}>View Details</Button>
                  </td>
                </tr>
              ))}

              <tr className="font-semibold bg-slate-100/70 dark:bg-slate-800/70">
                <td className="border border-slate-200 dark:border-slate-700 p-3">Grand Total</td>
                <td className="border border-slate-200 dark:border-slate-700 p-3 text-right">{(grandTotal || 0).toFixed(2)}</td>
                <td className="border border-slate-200 dark:border-slate-700 p-3" />
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="p-4 w-11/12 max-w-2xl relative border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold mb-2">Details for {modalWaiter}</h3>
            <button className="absolute top-3 right-3 text-red-600 font-bold" onClick={() => setShowModal(false)}>
              x
            </button>

            {modalLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-300">Loading...</p>
            ) : modalItems.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-300">No items sold by this waiter.</p>
            ) : (
              <table className="w-full border-collapse border border-slate-200 dark:border-slate-700 mt-2 text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/70">
                    <th className="border border-slate-200 dark:border-slate-700 p-2 text-left">Item Name</th>
                    <th className="border border-slate-200 dark:border-slate-700 p-2 text-right">Quantity</th>
                    <th className="border border-slate-200 dark:border-slate-700 p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {modalItems.map((item, idx) => (
                    <tr key={idx} className={item.is_voided ? "bg-amber-100 dark:bg-amber-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-900/60"}>
                      <td className="border border-slate-200 dark:border-slate-700 p-2">
                        {item.item_name}
                        {item.is_voided && <span className="text-xs ml-1 text-slate-600 dark:text-slate-300">(Voided)</span>}
                      </td>
                      <td className="border border-slate-200 dark:border-slate-700 p-2 text-right">{item.quantity_sold || 0}</td>
                      <td className="border border-slate-200 dark:border-slate-700 p-2 text-right">{(item.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
