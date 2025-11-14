import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchOrderHistory, fetchOrderSummary } from "@/api/order_history";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function HistoryPage() {
  const { authToken, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showSummarySidebar, setShowSummarySidebar] = useState(false);

  useEffect(() => {
    if (!authToken || !user) {
      toast.error("Please log in to view orders");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const filters = { date: todayISO, user_id: user?.id };

        const [ordersData, summaryData] = await Promise.all([
          fetchOrderHistory(authToken, filters),
          fetchOrderSummary(authToken, filters),
        ]);

        setOrders(ordersData || []);
        setSummary(summaryData || null);
      } catch (err) {
        toast.error(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authToken, user]);

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100 flex">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-6">የቀኑ የተዘጉ እና የተከፈሉ ትዕዛዞች</h1>

        {/* Summary cards */}
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
                  <p className="text-xs">ይልተከፈለ</p>
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

        {/* Orders list */}
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
              let statusText, statusColor;

              if (order.status === "paid") {
                statusText = "የተከፈለ";
                statusColor = "text-green-600 dark:text-green-400";
              } else if (order.status === "closed") {
                statusText = "ይልተከፈለ";
                statusColor = "text-red-600 dark:text-red-400";
              } else if (order.status === "open") {
                statusText = "ክፍት ትዕዛዝ";
                statusColor = "text-yellow-600 dark:text-yellow-400";
              } else {
                statusText = order.status;
                statusColor = "text-gray-600 dark:text-gray-400";
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
                      <strong>አጠቃላይ:</strong> $
                      {order.total_amount?.toFixed(2) || "0.00"}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      <strong>ጊዜ:</strong>{" "}
                      {order.created_at
                        ? new Date(order.created_at).toLocaleTimeString()
                        : "N/A"}
                    </p>
                    <p className={`mt-2 font-semibold ${statusColor}`}>{statusText}</p>
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => setSelectedOrder(order)}
                    >
                      ዝርዝር እይ
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar for daily items summary */}
      {showSummarySidebar && summary && (
        <div className="w-64 ml-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg max-h-screen overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">አጠቃላይ ዛሬ የተሸጡ</h2>
          {summary.dailyItemsSummary?.length === 0 ? (
            <p className="text-sm">ዛሬ የተሸጠ የለም</p>
          ) : (
            <ul className="space-y-2">
              {summary.dailyItemsSummary?.map((item) => (
                <li
                  key={item.name}
                  className="flex justify-between bg-white dark:bg-gray-700 px-3 py-2 rounded shadow"
                >
                  <span>{item.name}</span>
                  <span className="font-semibold">{item.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Order Details Modal */}
{selectedOrder && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-11/12 max-w-lg">
      <h3 className="text-xl font-bold mb-4">
        Table {selectedOrder.table?.number || "N/A"} - ትዕዛዝ #{selectedOrder.id}
      </h3>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-600">
              <th className="pb-2">ትዕዛዝ</th>
              <th className="pb-2">ብዛት</th>
              <th className="pb-2">ዋጋ</th>
              <th className="pb-2">አጠቃላይ ዋጋ</th>
            </tr>
          </thead>
          <tbody>
            {([...selectedOrder.active_items, ...selectedOrder.voided_items] || []).map(item => {
              const isVoided = item.status?.includes("void");
              return (
                <tr
                  key={item.id}
                  className={`border-b dark:border-gray-700 ${
                    isVoided
                      ? "bg-red-100 dark:bg-red-800/50 line-through text-gray-500 dark:text-gray-300"
                      : ""
                  }`}
                >
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>${item.price.toFixed(2)}</td>
                  <td>${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-bold text-right">
        አጠቃላይ: ${selectedOrder.total_amount.toFixed(2)}
      </p>
      <div className="flex justify-end mt-4">
        <Button onClick={() => setSelectedOrder(null)}>Close</Button>
      </div>
    </div>
  </div>
)}


    </div>
  );
}
