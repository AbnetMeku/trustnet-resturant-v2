import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchOrders } from "@/api/orders";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HistoryPage() {
  const { authToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [closedOrdersToday, setClosedOrdersToday] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null); // Individual order modal
  const [showSummarySidebar, setShowSummarySidebar] = useState(false);

  useEffect(() => {
    if (!authToken) return;

    const fetchClosedOrdersToday = async () => {
      setLoading(true);
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const orders = await fetchOrders(authToken, { status: "closed" });
        const todayOrders = orders.filter(order =>
          order.created_at.startsWith(todayISO)
        );
        setClosedOrdersToday(todayOrders);
      } catch (err) {
        toast.error(err.message || "Failed to load closed orders");
      } finally {
        setLoading(false);
      }
    };

    fetchClosedOrdersToday();
  }, [authToken]);

  // Summary stats
  const summary = useMemo(() => {
    const totalRevenue = closedOrdersToday.reduce((sum, o) => sum + o.total_amount, 0);
    const totalItems = closedOrdersToday.reduce(
      (sum, o) => sum + o.items.reduce((iSum, item) => iSum + item.quantity, 0),
      0
    );

    // Daily items summary
    const dailyItemsMap = {};
    closedOrdersToday.forEach(order => {
      order.items.forEach(item => {
        if (dailyItemsMap[item.name]) dailyItemsMap[item.name] += item.quantity;
        else dailyItemsMap[item.name] = item.quantity;
      });
    });
    const dailyItemsSummary = Object.entries(dailyItemsMap).map(([name, qty]) => ({
      name,
      quantity: qty
    }));

    return { totalOrders: closedOrdersToday.length, totalRevenue, totalItems, dailyItemsSummary };
  }, [closedOrdersToday]);

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100 flex">
      {/* Main content */}
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-6">የቀኑ የተዘጉ ትዕዛዞች</h1>

        {/* Summary cards */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="bg-blue-100 dark:bg-blue-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
            <p className="text-sm font-semibold">አጠቃላይ ትዛዝ</p>
            <p className="text-xl font-bold">{summary.totalOrders}</p>
          </div>
          <div className="bg-green-100 dark:bg-green-800 p-4 rounded-lg shadow flex-1 min-w-[150px]">
            <p className="text-sm font-semibold">አጠቃላይ  ሽያጭ</p>
            <p className="text-xl font-bold">${summary.totalRevenue.toFixed(2)}</p>
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

        {loading ? (
          <p>Loading closed orders...</p>
        ) : closedOrdersToday.length === 0 ? (
          <p>ዛሬ የተዘጋ የለም</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {closedOrdersToday.map(order => (
              <Card
                key={order.id}
                className="shadow-lg rounded-lg border border-gray-300 dark:border-gray-700 p-4 hover:scale-[1.02] transition-transform"
              >
                <CardHeader>
                  <CardTitle className="text-lg font-semibold truncate">
                    Table {order.table_id} - ትዕዛዝ #{order.id}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    <strong>አጠቃላይ:</strong> ${order.total_amount.toFixed(2)}
                  </p>
                  {/* <p>
                    <strong>Items:</strong> {order.items.length}
                  </p> */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    <strong>Time:</strong> {new Date(order.created_at).toLocaleTimeString()}
                  </p>
                  <p className="mt-2 font-semibold text-green-600 dark:text-green-400">Closed</p>
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => setSelectedOrder(order)}
                  >
                    ዝርዝር እይ
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar for daily items summary */}
      {showSummarySidebar && (
        <div className="w-64 ml-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg max-h-screen overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">አጠቃላይ ዛሬ የተሸጡ</h2>
          {summary.dailyItemsSummary.length === 0 ? (
            <p className="text-sm">ዛሬ የተሸጠ የለም</p>
          ) : (
            <ul className="space-y-2">
              {summary.dailyItemsSummary.map(item => (
                <li key={item.name} className="flex justify-between bg-white dark:bg-gray-700 px-3 py-2 rounded shadow">
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
              Table {selectedOrder.table_id} - ትዕዛዝ #{selectedOrder.id}
            </h3>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="pb-2">ትዛዝ</th>
                    <th className="pb-2">ብዛት</th>
                    <th className="pb-2">ዋጋ</th>
                    <th className="pb-2">አጠቃላይ ዋጋ</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map(item => (
                    <tr key={item.id} className="border-b dark:border-gray-700">
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>${item.price.toFixed(2)}</td>
                      <td>${(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
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
