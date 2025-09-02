import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import axios from "axios";
import toast from "react-hot-toast";

export default function OrderHistory() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Fetch waiters
  useEffect(() => {
    async function loadWaiters() {
      try {
        const data = await getUsers("waiter");
        setWaiters([{ id: "", username: "All Waiters" }, ...data]);
      } catch {
        setWaiters([{ id: "", username: "All Waiters" }]);
      }
    }
    loadWaiters();
  }, []);

  // Fetch orders
  useEffect(() => {
    if (!authToken) return;
    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, { status: "paid" });
        setOrders(data);
      } catch (err) {
        toast.error(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken]);

  const handlePrintReceipt = async (orderId) => {
    try {
      await axios.post(
        "/api/print-jobs/cashier/manual",
        { order_id: orderId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      toast.success("🖨️ Receipt print job created!");
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to print receipt");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);
    const startDate = filterStartDate ? new Date(filterStartDate) : null;
    const endDate = filterEndDate ? new Date(filterEndDate) : null;

    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (!startDate || orderDate >= startDate) &&
      (!endDate || orderDate <= endDate)
    );
  });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Order History (Paid)</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterWaiter}
          onChange={(e) => setFilterWaiter(e.target.value)}
        >
          {waiters.map((w) => (
            <option key={w.id} value={w.id}>
              {w.username}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
        />
        <input
          type="date"
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
        />
      </div>

      {/* Orders */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-300">Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-300">No paid orders found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="shadow-md dark:shadow-none rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-all"
            >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">Table {order.table.number}</h3>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">ID: {order.id}</span>
                </div>
              <p className="text-gray-700 dark:text-gray-300 mb-1">
                Total: <span className="font-bold text-green-600">${order.total_amount.toFixed(2)}</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Waiter: {order.user?.username || "—"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Items: {order.items.length}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Date: {new Date(order.created_at).toLocaleDateString()}
              </p>

              <div className="flex flex-col space-y-2">
                <Button
                  variant="outline"
                  className="text-indigo-600 border-indigo-600 hover:bg-indigo-50 dark:hover:bg-gray-600"
                  onClick={() => setSelectedOrder(order)}
                >
                  More Details
                </Button>
                <Button
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => handlePrintReceipt(order.id)}
                >
                  Print Receipt
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg w-full max-w-lg p-6 overflow-hidden">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
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
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-1 text-gray-800 dark:text-gray-100">{item.name}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">{item.quantity}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">${item.price.toFixed(2)}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">${(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-bold text-right text-gray-900 dark:text-gray-100">
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
