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
        return "Open";
      case "closed":
        return "Closed";
      case "paid":
        return "Paid";
      default:
        return status;
    }
  };

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
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

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
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

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
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

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
      <Card className="p-4 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Order Tracker</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Orders for {selectedDate}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
            />
            <select
              value={filterWaiter}
              onChange={(e) => setFilterWaiter(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
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
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="paid">Paid</option>
            </select>
            <span className="text-sm text-slate-600 dark:text-slate-300">Showing {filteredOrders.length}</span>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">Loading orders...</Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">No orders found.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="p-5 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-medium">Order #{order.id}</h3>
                  <p>Total: ${order.total_amount.toFixed(2)}</p>
                  <p>Waiter: {order.user?.username || "-"}</p>
                  <p>Items: {order.items.length}</p>
                  <p>Time: {new Date(order.created_at).toLocaleTimeString()}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{statusBadge(order.status)}</p>
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Table {order.table.number}</div>
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
                <Button variant="destructive" onClick={() => setOrderToDelete(order)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto text-slate-900 dark:text-slate-100">
            <h3 className="text-xl mb-3">Order #{selectedOrder.id}</h3>
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {selectedOrder.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex flex-col md:flex-row md:justify-between py-1 items-start md:items-center gap-1 md:gap-0"
                >
                  <div className="flex flex-col">
                    <span className={item.status === "void" ? "line-through text-red-500" : ""}>
                      {item.name} {item.status === "void" && "(voided)"}
                    </span>
                    {item.prep_tag && <span className="text-sm text-slate-500 dark:text-slate-400">Prep Tag: {item.prep_tag}</span>}
                    {item.created_at && <span className="text-sm text-slate-500 dark:text-slate-400">Time: {new Date(item.created_at).toLocaleTimeString()}</span>}
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
                              quantity: Number.isNaN(qty) ? 0 : qty,
                            };
                            return { ...prev, items };
                          });
                        }}
                        className="w-16 rounded-md border border-slate-300 px-1 bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span>
                        {item.quantity} x ${item.price}
                      </span>
                    )}

                    {editMode && item.status !== "void" && (
                      <Button variant="destructive" size="sm" onClick={() => setItemToVoid(item)}>
                        Void
                      </Button>
                    )}

                    {editMode && item.status === "void" && (
                      <Button variant="secondary" size="sm" onClick={() => handleUnvoidItem(item)}>
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

      {itemToVoid && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-slate-100">
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

      {orderToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-slate-100">
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
