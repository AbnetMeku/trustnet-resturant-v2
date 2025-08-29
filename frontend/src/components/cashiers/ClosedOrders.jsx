import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders, updateOrderStatus } from "@/api/orders";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import axios from "axios";
import toast from "react-hot-toast";

export default function ClosedOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Fetch closed orders
  useEffect(() => {
    if (!authToken) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, { status: "closed" });
        setOrders(data);
      } catch (err) {
        toast.error(err.message || "Failed to load closed orders");
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken]);

  // Mark order as paid
  const handleMarkPaid = async (orderId) => {
    try {
      await updateOrderStatus(authToken, orderId, "paid");
      toast.success("Order marked as paid!");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      toast.error(err.message || "Failed to update order status");
    }
  };

  // Print receipt
  const handlePrintReceipt = async (orderId) => {
    try {
      await axios.post(
        "http://localhost:5000/api/print-jobs/cashier/manual",
        { order_id: orderId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      toast.success("Receipt print job created!");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to print receipt");
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Closed Orders (Pending Payment)</h2>

      {loading ? (
        <p>Loading...</p>
      ) : orders.length === 0 ? (
        <p>No closed orders pending payment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map(order => (
            <Card
              key={order.id}
              className="shadow-lg rounded-lg border border-gray-300 dark:border-gray-700 p-6 hover:scale-[1.02] transition-transform relative"
            >
              <h3 className="text-lg font-semibold mb-2">Table {order.table_id}</h3>
              <p className="mb-1">
                Total: <strong>${order.total_amount.toFixed(2)}</strong>
              </p>
              <p className="mb-3">Items: {order.items.length}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                Time: {new Date(order.created_at).toLocaleTimeString()}
              </p>
              <p className="mt-1 font-semibold text-yellow-600 dark:text-yellow-400">
                Pending Payment
              </p>

              {/* Action buttons */}
              <div className="mt-4 flex flex-col space-y-2">
                <Button variant="outline" onClick={() => setSelectedOrder(order)}>
                  More Details
                </Button>
                <Button variant="secondary" onClick={() => handleMarkPaid(order.id)}>
                  Mark as Paid
                </Button>
                <Button variant="destructive" onClick={() => handlePrintReceipt(order.id)}>
                  Print Receipt
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal for selected closed order */}
      {selectedOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-11/12 max-w-lg">
            <h3 className="text-xl font-bold mb-4">
              Table {selectedOrder.table_id} - Order #{selectedOrder.id}
            </h3>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b dark:border-gray-600">
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Total</th>
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
              Total: ${selectedOrder.total_amount.toFixed(2)}
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
