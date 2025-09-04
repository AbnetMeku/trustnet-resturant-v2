import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchOrders,
  deleteOrder,
  deleteOrderItem,
  updateOrderItem,
} from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function AdminOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

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
        const data = await fetchOrders(authToken);
        setOrders(data);
      } catch (err) {
        toast.error(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken]);

  const filteredOrders = orders.filter((order) => {
    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (filterTable
        ? order.table.number.toString().includes(filterTable)
        : true) &&
      (filterStatus ? order.status === filterStatus : true)
    );
  });

  const statusBadge = (status) => {
    switch (status) {
      case "open":
        return "🟢 Open";
      case "closed":
        return "⏳ Pending Payment";
      case "paid":
        return "✅ Paid";
      default:
        return status;
    }
  };

  const handleSaveChanges = async () => {
    try {
      // Update all items
      for (const item of selectedOrder.items) {
        await updateOrderItem(authToken, selectedOrder.id, item.id, {
          quantity: item.quantity,
        });
      }
      const updatedTotal = selectedOrder.items.reduce(
        (acc, i) => acc + i.price * i.quantity,
        0
      );
      setSelectedOrder((prev) => ({ ...prev, total_amount: updatedTotal }));
      toast.success("Order updated successfully");
      setEditMode(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteItem = async () => {
    try {
      await deleteOrderItem(authToken, selectedOrder.id, itemToDelete.id);
      setSelectedOrder((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== itemToDelete.id),
        total_amount:
          prev.total_amount - itemToDelete.price * itemToDelete.quantity,
      }));
      toast.success("Item removed");
      setItemToDelete(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteOrder = async () => {
    try {
      await deleteOrder(authToken, orderToDelete.id);
      setOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id));
      setSelectedOrder(null);
      toast.success("Order deleted");
      setOrderToDelete(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">
        All Orders (Admin)
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
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
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
        />

        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No orders found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="shadow-sm dark:shadow-none rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col justify-between bg-gray-50 dark:bg-gray-800 hover:shadow-md transition"
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
                  Total:{" "}
                  <span className="font-semibold">
                    ${order.total_amount.toFixed(2)}
                  </span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Waiter: {order.user?.username || "—"}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Items: {order.items.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Time: {new Date(order.created_at).toLocaleTimeString()}
                </p>

                <span className="inline-block px-2 py-1 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-medium">
                  {statusBadge(order.status)}
                </span>
              </div>

              <div className="mt-4">
                <Button
                  variant="outline"
                  className="text-gray-800 dark:text-gray-100 border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
                  onClick={() => {
                    setSelectedOrder(order);
                    setEditMode(false);
                  }}
                >
                  More Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Selected Order Modal */}
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
                    {editMode && <th className="py-2 text-gray-700 dark:text-gray-300">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-1 text-gray-800 dark:text-gray-100">{item.name}</td>
                      <td className="py-1">
                        {editMode ? (
<input
          type="number"
          value={item.quantity}
          min={1}
          className="w-16 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          onChange={(e) =>
            setSelectedOrder((prev) => ({
              ...prev,
              items: prev.items.map((i) =>
                i.id === item.id
                  ? { ...i, quantity: Number(e.target.value) }
                  : i
              ),
            }))
          }
        />
                        ) : (
                          <span className="text-gray-800 dark:text-gray-100">{item.quantity}</span>
                        )}
                      </td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">${item.price.toFixed(2)}</td>
                      <td className="py-1 text-gray-800 dark:text-gray-100">${(item.price * item.quantity).toFixed(2)}</td>
                      {editMode && (
                        <td className="py-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setItemToDelete(item)}
                          >
                            ❌
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 font-semibold text-right text-gray-900 dark:text-gray-100">
              Total: ${selectedOrder.items.reduce((acc, i) => acc + i.price * i.quantity, 0).toFixed(2)}
            </p>

            <div className="flex justify-between mt-4">
              <div className="flex gap-2">
                <Button
                  className="bg-gray-600 text-white hover:bg-gray-700"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-800 text-white"
                  onClick={() => setEditMode((prev) => !prev)}
                >
                  {editMode ? "Cancel Edit" : "Edit"}
                </Button>
                {editMode && (
                  <Button className="bg-green-600 hover:bg-green-800 text-white" onClick={handleSaveChanges}>
                    Save Changes
                  </Button>
                )}
              </div>

              <Button
                className="bg-red-600 hover:bg-red-800 text-white"
                onClick={() => setOrderToDelete(selectedOrder)}
              >
                Delete Order
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Item Delete Confirmation */}
      {itemToDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
            <p>Remove "{itemToDelete.name}" from order?</p>
            <div className="flex gap-2 mt-2 justify-end">
              <Button onClick={() => setItemToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteItem}>
                Yes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Order Delete Confirmation */}
      {orderToDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
            <p>Are you sure you want to delete order #{orderToDelete.id}?</p>
            <div className="flex gap-2 mt-2 justify-end">
              <Button onClick={() => setOrderToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteOrder}>
                Yes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
