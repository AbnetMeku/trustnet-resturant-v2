import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders } from "@/api/orders";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OpenOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Fetch all open orders
  useEffect(() => {
    if (!authToken) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, { status: "open" });
        setOrders(data); // No date filtering applied
      } catch (err) {
        console.error("Failed to load open orders:", err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken]);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">Open Orders</h2>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No open orders available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {orders.map(order => (
            <Card
              key={order.id}
              className="shadow-sm dark:shadow-none rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all flex flex-col justify-between bg-gray-50 dark:bg-gray-800"
            >
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">
                    Table {order.table.number}
                  </h3>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    ID: {order.id}
                  </span>
                </div>

                <p className="text-gray-700 dark:text-gray-300 mb-1">
                  Total: <span className="font-semibold">${order.total_amount.toFixed(2)}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Items: {order.items.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Time: {new Date(order.created_at).toLocaleTimeString()}
                </p>

                <span className="inline-block px-2 py-1 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-medium">
                  🟢 Open
                </span>
              </div>

              <Button
                variant="outline"
                className="text-gray-800 dark:text-gray-100 border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 mt-4"
                onClick={() => setSelectedOrder(order)}
              >
                More Details
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Modal for selected order */}
      {selectedOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg w-full max-w-lg p-6 overflow-hidden">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Table {selectedOrder.table.number} - Order #{selectedOrder.id}
            </h3>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="py-2 text-gray-700 dark:text-gray-300">Item</th>
                    <th className="py-2 text-gray-700 dark:text-gray-300">Qty</th>
                    <th className="py-2 text-gray-700 dark:text-gray-300">Price</th>
                    <th className="py-2 text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map(item => (
                    <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-1 text-gray-800 dark:text-gray-100">{item.name}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">{item.quantity}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">${item.price.toFixed(2)}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">
                        ${(item.price * item.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-semibold text-right text-gray-900 dark:text-gray-100">
              Total: ${selectedOrder.total_amount.toFixed(2)}
            </p>
            <div className="flex justify-end mt-4">
              <Button
                className="bg-gray-600 text-white hover:bg-gray-700"
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
