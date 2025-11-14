import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrderHistoryRaw } from "@/api/order_history";
import { updateOrderItem, voidOrderItem, unvoidOrderItem, deleteOrder } from "@/api/orders";
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
  const [itemToVoid, setItemToVoid] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Load waiters
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

  // Load orders for a given day
  useEffect(() => {
    if (!authToken || !selectedDate) return;
    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrderHistoryRaw(authToken, { date: selectedDate });
        setOrders(data);
      } catch (err) {
        toast.error(err.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken, selectedDate]);

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (filterTable ? order.table.number.toString().includes(filterTable) : true) &&
      (filterStatus ? order.status === filterStatus : true)
    );
  });

  const statusBadge = (status) => {
    switch (status) {
      case "open":
        return "🟢 Open";
      case "closed":
        return "⏳ Closed";
      case "paid":
        return "✅ Paid";
      default:
        return status;
    }
  };

  // --- Handlers ---
  const handleSaveChanges = async () => {
    try {
      const updatedItems = [];
      for (const item of selectedOrder.items) {
        if (item.status !== "void") {
          await updateOrderItem(authToken, selectedOrder.id, item.id, {
            quantity: item.quantity,
          });
        }
        updatedItems.push(item);
      }

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );

      toast.success("Order updated successfully");
      setEditMode(false);
    } catch (err) {
      toast.error(err.message || "Failed to update order");
    }
  };

  const handleVoidItem = async () => {
    try {
      await voidOrderItem(authToken, selectedOrder.id, itemToVoid.id);

      const updatedItems = selectedOrder.items.map((i) =>
        i.id === itemToVoid.id ? { ...i, status: "void" } : i
      );

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );

      toast.success("Item voided");
      setItemToVoid(null);
    } catch (err) {
      toast.error(err.message || "Failed to void item");
    }
  };

  const handleUnvoidItem = async (item) => {
    try {
      await unvoidOrderItem(authToken, selectedOrder.id, item.id);

      const updatedItems = selectedOrder.items.map((i) =>
        i.id === item.id ? { ...i, status: "pending" } : i
      );

      const updatedTotal = updatedItems
        .filter((i) => i.status !== "void")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const updatedOrder = { ...selectedOrder, items: updatedItems, total_amount: updatedTotal };
      setSelectedOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
      );

      toast.success("Item unvoided successfully");
    } catch (err) {
      toast.error(err.message || "Failed to unvoid item");
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
      toast.error(err.message || "Failed to delete order");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">
        Orders for {selectedDate} (Admin)
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <select
          value={filterWaiter}
          onChange={(e) => setFilterWaiter(e.target.value)}
          className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
          className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="paid">Paid</option>
        </select>
        <span className="text-gray-800 dark:text-gray-200">
          Showing {filteredOrders.length} orders
        </span>
      </div>

      {/* Orders List */}
      {loading ? (
        <p className="text-gray-800 dark:text-gray-200">Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-gray-800 dark:text-gray-200">No orders found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="p-5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <h3 className="font-medium">Order #{order.id}</h3>
                  <p>Total: ${order.total_amount.toFixed(2)}</p>
                  <p>Waiter: {order.user?.username || "—"}</p>
                  <p>Items: {order.items.length}</p>
                  <p>Time: {new Date(order.created_at).toLocaleTimeString()}</p>
                  <p>{statusBadge(order.status)}</p>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Table {order.table.number}
                </div>
              </div>

              <div className="mt-3 space-x-2">
                <Button
                  onClick={() => {
                    setSelectedOrder(order);
                    setEditMode(false);
                  }}
                >
                  Details
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setOrderToDelete(order)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* --- Details Modal --- */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow w-full max-w-lg max-h-[80vh] overflow-y-auto text-gray-900 dark:text-gray-100">
            <h3 className="text-xl mb-3">Order #{selectedOrder.id}</h3>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {selectedOrder.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex flex-col md:flex-row md:justify-between py-1 items-start md:items-center gap-1 md:gap-0"
                >
                  <div className="flex flex-col">
                    <span
                      className={item.status === "void" ? "line-through text-red-500" : ""}
                    >
                      {item.name} {item.status === "void" && "(voided)"}
                    </span>
                    {item.prep_tag && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Prep Tag: {item.prep_tag}
                      </span>
                    )}
                    {item.created_at && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Time: {new Date(item.created_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 md:mt-0">
                    {editMode && item.status !== "void" ? (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = parseFloat(e.target.value);
                          setSelectedOrder((prev) => {
                            const items = [...prev.items];
                            items[idx] = {
                              ...items[idx],
                              quantity: isNaN(qty) ? 0 : qty,
                            };
                            return { ...prev, items };
                          });
                        }}
                        className="w-16 border px-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span>
                        {item.quantity} × ${item.price}
                      </span>
                    )}

                    {editMode && item.status !== "void" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setItemToVoid(item)}
                      >
                        Void
                      </Button>
                    )}

                    {editMode && item.status === "void" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUnvoidItem(item)}
                      >
                        Unvoid
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex justify-between">
              <Button onClick={() => setSelectedOrder(null)}>Close</Button>
              {editMode ? (
                <Button onClick={handleSaveChanges}>Save</Button>
              ) : (
                <Button onClick={() => setEditMode(true)}>Edit</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm Void Item Modal --- */}
      {itemToVoid && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow text-gray-900 dark:text-gray-100">
            <p>
              Void item <strong>{itemToVoid.name}</strong>?
            </p>
            <div className="mt-3 flex gap-3">
              <Button onClick={() => setItemToVoid(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleVoidItem}>
                Void
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm Delete Order Modal --- */}
      {orderToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow text-gray-900 dark:text-gray-100">
            <p>
              Delete order <strong>#{orderToDelete.id}</strong>?
            </p>
            <div className="mt-3 flex gap-3">
              <Button onClick={() => setOrderToDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteOrder}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
