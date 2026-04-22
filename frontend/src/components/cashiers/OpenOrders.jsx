import React, { useDeferredValue, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { eatBusinessDateISO, formatEatTime } from "@/lib/timezone";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";
import ModalPortal from "@/components/ui/ModalPortal";

export default function OpenOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [selectedDate, setSelectedDate] = useState(eatBusinessDateISO());
  const deferredTableFilter = useDeferredValue(filterTable.trim());

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
    if (!authToken) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, {
          status: "open",
          date: selectedDate,
          waiter_id: filterWaiter ? Number(filterWaiter) : undefined,
          table_number: deferredTableFilter || undefined,
        });
        setOrders(data);
      } catch (err) {
        console.error("Failed to load open orders:", err);
        toast.error(getApiErrorMessage(err, "Failed to load open orders."));
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken, deferredTableFilter, filterWaiter, selectedDate]);

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Open Orders</h3>
              <p className="text-sm text-slate-200">Track active dine-in orders by table and waiter.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Showing</p>
                <p className="text-sm font-medium">{orders.length}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total Open</p>
                <p className="text-sm font-medium">{orders.length}</p>
              </div>
              <div className="admin-stat col-span-2 sm:col-span-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Waiters</p>
                <p className="text-sm font-medium">{Math.max(waiters.length - 1, 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Date</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Waiter</span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={filterWaiter}
                onChange={(e) => setFilterWaiter(e.target.value)}
              >
                {waiters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Table</span>
              <input
                type="text"
                placeholder="e.g. 12"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
              />
            </label>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          Loading open orders...
        </Card>
      ) : orders.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No open orders available.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const totalItemsCount = (order.active_items?.length || 0) + (order.voided_items?.length || 0);
            return (
              <Card key={order.id} className="admin-card p-5 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Order #{order.id}</p>
                    <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Table {order.table?.number ?? "-"}</h4>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Open
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">${Number(order.total_amount || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Items</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{totalItemsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Waiter</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{order.user?.username || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Time</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{formatEatTime(order.created_at)}</p>
                  </div>
                </div>

                <Button className="mt-4 w-full" variant="outline" onClick={() => setSelectedOrder(order)}>
                  Details
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {selectedOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
            <Card className="admin-card w-full max-w-3xl overflow-hidden shadow-xl">
              <div className="admin-hero p-4 md:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-200">Order Details</p>
                    <h3 className="text-lg font-semibold">
                      Table {selectedOrder.table?.number ?? "-"} | Order #{selectedOrder.id}
                    </h3>
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
              <div className="max-h-[65vh] overflow-auto p-4 md:p-5">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-600 dark:text-slate-300">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="pb-2">Item</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">Price</th>
                      <th className="pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(selectedOrder.active_items || []), ...(selectedOrder.voided_items || [])].map((item) => {
                      const isVoided = item.status?.includes("void");
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-slate-200 dark:border-slate-700 ${
                            isVoided
                              ? "bg-red-100/70 line-through text-slate-500 dark:bg-red-900/20 dark:text-slate-300"
                              : ""
                          }`}
                        >
                          <td className="py-2">{item.name}</td>
                          <td className="py-2">{item.quantity}</td>
                          <td className="py-2">${Number(item.price || 0).toFixed(2)}</td>
                          <td className="py-2">${(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-4 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Total: $
                  {(selectedOrder.active_items || [])
                    .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
                    .toFixed(2)}
                </p>
              </div>
            </Card>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
