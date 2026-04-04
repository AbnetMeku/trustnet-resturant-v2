import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import {
  closeWaiterDay,
  fetchOrderHistory,
  fetchOrderSummary,
  fetchWaiterDayCloseStatus,
} from "@/api/order_history";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { eatBusinessDateISO, formatEatTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";
import ModalPortal from "@/components/ui/ModalPortal";
import { useBranding } from "@/hooks/useBranding";

export default function HistoryPage({ onDayCloseChange }) {
  const { authToken, user } = useAuth();
  const branding = useBranding();
  const todayISO = eatBusinessDateISO();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showSummarySidebar, setShowSummarySidebar] = useState(false);
  const [dayCloseStatus, setDayCloseStatus] = useState(null);
  const [closingDay, setClosingDay] = useState(false);

  useEffect(() => {
    if (!authToken || !user) {
      toast.error("Please log in to view orders");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const filters = { date: selectedDate, user_id: user?.id };

        const [ordersData, summaryData, dayCloseData] = await Promise.all([
          fetchOrderHistory(authToken, filters),
          fetchOrderSummary(authToken, filters),
          fetchWaiterDayCloseStatus(authToken),
        ]);

        setOrders(ordersData || []);
        setSummary(summaryData || null);
        setDayCloseStatus(dayCloseData || null);
        onDayCloseChange?.(dayCloseData || null);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load order history."));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authToken, user, selectedDate, onDayCloseChange]);

  const refreshDayCloseStatus = async () => {
    if (!authToken) return;
    try {
      const status = await fetchWaiterDayCloseStatus(authToken);
      setDayCloseStatus(status || null);
      onDayCloseChange?.(status || null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load day-close status."));
    }
  };

  const isClosedForToday = Boolean(dayCloseStatus?.isClosedForToday);
  const openOrdersCount = Number(dayCloseStatus?.openOrdersCount || 0);
  const isViewingToday = selectedDate === todayISO;
  const waiterCloseEnabled = dayCloseStatus?.waiterCloseEnabled ?? Boolean(branding?.waiter_shift_close_enabled);
  const canCloseForToday = Boolean(dayCloseStatus?.canCloseForToday);

  const handleCloseDay = async () => {
    if (!authToken || closingDay) return;
    setClosingDay(true);
    try {
      const response = await closeWaiterDay(authToken);
      toast.success(response?.message || "Shift closed for today.");
      await refreshDayCloseStatus();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to close shift."));
    } finally {
      setClosingDay(false);
    }
  };

  return (
    <div className="p-4 md:p-6 dark:bg-gray-900 min-h-[70vh] text-gray-900 dark:text-gray-100 flex">
      <div className="flex-1">
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold mb-0">የቀኑ የተዘጉ እና የተከፈሉ ትዕዛዞች</h1>
            {isViewingToday && isClosedForToday && (
              <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                ዛሬ ተዘግቷል
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label htmlFor="history-date" className="text-sm font-medium">
                ቀን
              </label>
              <input
                id="history-date"
                type="date"
                value={selectedDate}
                max={todayISO}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            {isViewingToday && dayCloseStatus && waiterCloseEnabled && !isClosedForToday && (
              <div className="flex items-center gap-3">
                <Button onClick={handleCloseDay} disabled={!canCloseForToday || closingDay}>
                  {closingDay ? "በመዝጋት ላይ..." : "ቀኑን ዝጋ"}
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ክፍት ትዕዛዞች ከተጠናቀቁ በኋላ ቀኑን ዝጋ።
                </span>
              </div>
            )}
          </div>
        </div>

        {isViewingToday && dayCloseStatus && !isClosedForToday && openOrdersCount > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
            ቀኑን ከመዝጋት በፊት ክፍት ትዕዛዞችን ዝጋ ({openOrdersCount})።
          </p>
        )}

        {isViewingToday && dayCloseStatus && !waiterCloseEnabled && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            ቀን መዝጋት በካሺር/አስተዳዳሪ ይተከናወናል።
          </p>
        )}

        {isViewingToday && dayCloseStatus && isClosedForToday && (
          <p className="text-sm text-green-600 dark:text-green-400 mb-4">
            የዛሬ ስራ ቀንዎ ተዘግቷል። እስከ ነገ አዲስ ትዕዛዝ መክፈት አይቻልም።
          </p>
        )}

        {summary && (
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="bg-blue-100 dark:bg-blue-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
              <p className="text-sm font-semibold">አጠቃላይ ትዕዛዞች</p>
              <p className="text-xl font-bold">{summary.totalOrders}</p>
            </div>
            <div className="bg-green-100 dark:bg-green-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
              <p className="text-sm font-semibold">አጠቃላይ ሽያጭ</p>
              <div className="flex justify-between mt-2">
                <div>
                  <p className="text-xs">የተከፈለ</p>
                  <p className="text-lg font-bold">${summary.paidAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs">ያልተከፈለ</p>
                  <p className="text-lg font-bold">${summary.pendingAmount.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div
              className="bg-yellow-100 dark:bg-yellow-800 p-4 rounded-lg shadow flex-1 min-w-[150px] cursor-pointer"
              onClick={() => setShowSummarySidebar(!showSummarySidebar)}
            >
              <p className="text-sm font-semibold">አጠቃላይ የተሸጡ አይነቶች</p>
              <p className="text-xl font-bold">{summary.totalItems}</p>
              <p className="text-xs mt-1 underline">ሙሉ ዝርዝር እይ</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="animate-spin h-6 w-6 text-gray-600 dark:text-gray-400" />
            <span className="ml-2">Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <p>ዛሬ የተዘጉ ወይም የተከፈሉ ትዕዛዞች የሉም</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {orders.map((order) => {
              let statusText = order.status;
              let statusColor = "text-gray-600 dark:text-gray-400";

              if (order.status === "paid") {
                statusText = "የተከፈለ";
                statusColor = "text-green-600 dark:text-green-400";
              } else if (order.status === "closed") {
                statusText = "ያልተከፈለ";
                statusColor = "text-red-600 dark:text-red-400";
              } else if (order.status === "open") {
                statusText = "ክፍት ትዕዛዝ";
                statusColor = "text-yellow-600 dark:text-yellow-400";
              }

              return (
                <Card
                  key={order.id}
                  className="shadow-lg rounded-lg border border-gray-300 dark:border-gray-700 p-4 hover:scale-[1.02] transition-transform"
                >
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold truncate">
                      Table {order.table?.number || "N/A"} - ትዕዛዝ #{order.id}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>
                      <strong>አጠቃላይ:</strong> ${order.total_amount?.toFixed(2) || "0.00"}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      <strong>ጊዜ:</strong> {order.created_at ? formatEatTime(order.created_at) : "N/A"}
                    </p>
                    <p className={`mt-2 font-semibold ${statusColor}`}>{statusText}</p>
                    <Button variant="outline" className="mt-3 w-full" onClick={() => setSelectedOrder(order)}>
                      ዝርዝር እይ
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showSummarySidebar && summary && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[calc(100vh-2rem)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">አጠቃላይ ዛሬ የተሸጡ</h2>
                <Button variant="outline" size="sm" onClick={() => setShowSummarySidebar(false)}>
                  Close
                </Button>
              </div>
              {summary.dailyItemsSummary?.length === 0 ? (
                <p className="text-sm">ዛሬ የተሸጠ የለም</p>
              ) : (
                <ul className="space-y-2">
                  {summary.dailyItemsSummary?.map((item) => (
                    <li
                      key={item.name}
                      className="flex justify-between bg-slate-100 dark:bg-gray-700 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-600"
                    >
                      <span>{item.name}</span>
                      <span className="font-semibold">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {selectedOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[calc(100vh-2rem)]">
              <h3 className="text-xl font-bold mb-4">
                Table {selectedOrder.table?.number || "N/A"} - ትዕዛዝ #{selectedOrder.id}
              </h3>
              <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-[560px] w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/90">
                    <tr className="border-b dark:border-gray-600">
                      <th className="px-3 py-2">ትዕዛዝ</th>
                      <th className="px-3 py-2">ብዛት</th>
                      <th className="px-3 py-2">ዋጋ</th>
                      <th className="px-3 py-2">አጠቃላይ ዋጋ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(selectedOrder.active_items || []), ...(selectedOrder.voided_items || [])].map((item) => {
                      const isVoided = item.status?.includes("void");
                      return (
                        <tr
                          key={item.id}
                          className={`border-b dark:border-gray-700 ${
                            isVoided ? "bg-red-100 dark:bg-red-800/50 line-through text-gray-500 dark:text-gray-300" : ""
                          }`}
                        >
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">${item.price.toFixed(2)}</td>
                          <td className="px-3 py-2">${(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 font-bold text-right">አጠቃላይ: ${selectedOrder.total_amount.toFixed(2)}</p>
              <div className="flex justify-end mt-4">
                <Button onClick={() => setSelectedOrder(null)}>Close</Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}


