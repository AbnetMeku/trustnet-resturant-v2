import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchOrders } from "@/api/orders";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function HistoryPage() {
  const { authToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [closedOrdersToday, setClosedOrdersToday] = useState([]);

  useEffect(() => {
    if (!authToken) return;

    const fetchClosedOrdersToday = async () => {
      setLoading(true);
      try {
        const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        // Fetch closed orders for today; you may need to add filters in your API to support date filtering
        // For demo, fetch all closed and filter client side by today's date on created_at
        const orders = await fetchOrders(authToken, { status: "closed" });
        const todayOrders = orders.filter(order => order.created_at.startsWith(todayISO));
        setClosedOrdersToday(todayOrders);
      } catch (err) {
        toast.error(err.message || "Failed to load closed orders");
      } finally {
        setLoading(false);
      }
    };

    fetchClosedOrdersToday();
  }, [authToken]);

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-6">Today's Closed Orders</h1>

      {loading ? (
        <p>Loading closed orders...</p>
      ) : closedOrdersToday.length === 0 ? (
        <p>No closed orders for today.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {closedOrdersToday.map(order => (
            <Card key={order.id} className="shadow-lg rounded-lg border border-gray-300 dark:border-gray-700 p-4">
              <CardHeader>
                <CardTitle className="text-lg font-semibold truncate">
                  Table {order.table_id} - Order #{order.id}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  <strong>Total:</strong> ${order.total_amount.toFixed(2)}
                </p>
                <p>
                  <strong>Items:</strong> {order.items.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  <strong>Time:</strong> {new Date(order.created_at).toLocaleTimeString()}
                </p>
                <p className="mt-2 font-semibold text-green-600 dark:text-green-400">Closed</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
