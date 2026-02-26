import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders, updateOrderStatus } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import axios from "axios";
import toast from "react-hot-toast";
import { formatEatTime } from "@/lib/timezone";

export default function ClosedOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmOrder, setConfirmOrder] = useState(null);
  const [confirmPrint, setConfirmPrint] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");

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

  const handleMarkPaid = async (orderId) => {
    try {
      await updateOrderStatus(authToken, orderId, "paid");
      toast.success("✅ Order marked as paid!");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      toast.error(err.message || "Failed to update order status");
    }
  };

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
    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (filterTable ? order.table.number.toString().includes(filterTable) : true)
    );
  });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">የተዘጉ ትዕዛዞች (ደረሰኝ ያልተቆረጠ)</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-400"
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
          type="text"
          placeholder="Filter by table"
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-400"
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
        />
      </div>

      {/* Orders Grid */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No closed orders pending payment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="shadow-sm dark:shadow-none rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all flex flex-col justify-between bg-gray-50 dark:bg-gray-800"
            >
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">Table {order.table.number}</h3>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">ID: {order.id}</span>
                </div>

                <p className="text-gray-700 dark:text-gray-300 mb-1">
                  Total: <span className="font-semibold">${order.total_amount.toFixed(2)}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Waiter: {order.user?.username || "—"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Items: {order.active_items.length + order.voided_items.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Time: {formatEatTime(order.created_at)}
                </p>

                <span className="inline-block px-2 py-1 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-medium">
                  ⏳ Pending Payment
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="text-gray-800 dark:text-gray-100 border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setSelectedOrder(order)}
                >
                  More Details
                </Button>
                <Button
                  variant="secondary"
                  className="bg-green-600 hover:bg-green-800 text-white"
                  onClick={() => setConfirmOrder(order)}
                >
                  Mark as Paid
                </Button>
                <Button
                  variant="destructive"
                  className="bg-gray-700 hover:bg-gray-800 text-white"
                  onClick={() => setConfirmPrint(order)}
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
                  {[...selectedOrder.active_items, ...selectedOrder.voided_items].map((item) => {
                    const isVoided = selectedOrder.voided_items.includes(item);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b dark:border-gray-700 ${isVoided ? "line-through text-gray-500 dark:text-gray-300 bg-red-100 dark:bg-red-800/50" : ""}`}
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
            <p className="mt-4 font-semibold text-right text-gray-900 dark:text-gray-100">
              Total: ${selectedOrder.active_items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}
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

      {/* Confirm Paid Modal */}
      {confirmOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Confirm Payment</h3>
            <p>
              Are you sure you want to mark table {confirmOrder.table.number} (Order #{confirmOrder.id}) as <strong>Paid</strong>?
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setConfirmOrder(null)}>Cancel</Button>
              <Button
                variant="secondary"
                className="bg-lime-600 hover:bg-lime-800 text-white"
                onClick={() => {
                  handleMarkPaid(confirmOrder.id);
                  setConfirmOrder(null);
                }}
              >
                Yes, Mark Paid
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Print Modal */}
      {confirmPrint && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Confirm Print</h3>
            <p>
              Print receipt for table {confirmPrint.table.number} (Order #{confirmPrint.id})?
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setConfirmPrint(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="bg-gray-700 hover:bg-gray-800 text-white"
                onClick={() => {
                  handlePrintReceipt(confirmPrint.id);
                  setConfirmPrint(null);
                }}
              >
                Yes, Print
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

