import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders, updateOrderStatus } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import axios from "axios";
import toast from "react-hot-toast";
import { FaEye, FaPrint, FaCheckCircle } from "react-icons/fa";
import { eatBusinessDateISO, formatEatTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

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
  const [selectedDate, setSelectedDate] = useState(eatBusinessDateISO());

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
        const data = await fetchOrders(authToken, { status: "closed" });
        setOrders(data);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load closed orders."));
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [authToken]);

  const handleMarkPaid = async (orderId) => {
    try {
      await updateOrderStatus(authToken, orderId, "paid");
      toast.success("Order marked as paid.");
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update order status."));
    }
  };

  const handlePrintReceipt = async (orderId) => {
    try {
      await axios.post(
        "/api/print-jobs/cashier/manual",
        { order_id: orderId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      toast.success("Receipt print job created.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create receipt print job."));
    }
  };

  const filteredOrders = orders.filter((order) => {
    const orderDate = eatBusinessDateISO(order.created_at);
    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (filterTable ? String(order.table?.number || "").includes(filterTable) : true) &&
      (selectedDate ? orderDate === selectedDate : true)
    );
  });

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Closed Orders</h3>
              <p className="text-sm text-slate-200">Orders waiting for payment or receipt printing.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Showing</p>
                <p className="text-sm font-medium">{filteredOrders.length}</p>
              </div>
              <div className="admin-stat">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Pending</p>
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
                placeholder="e.g. 8"
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
          Loading closed orders...
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="admin-card p-8 text-center text-sm text-slate-500 dark:text-slate-300">
          No closed orders pending payment.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="admin-card p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Order #{order.id}</p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Table {order.table?.number ?? "-"}</h4>
                </div>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Pending Payment
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">${Number(order.total_amount || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Items</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {(order.active_items?.length || 0) + (order.voided_items?.length || 0)}
                  </p>
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

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => setSelectedOrder(order)}>
                  <FaEye className="mr-2" />
                  Details
                </Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setConfirmOrder(order)}>
                  <FaCheckCircle className="mr-2" />
                  Mark as Paid
                </Button>
                <Button className="bg-slate-700 text-white hover:bg-slate-800 sm:col-span-2" onClick={() => setConfirmPrint(order)}>
                  <FaPrint className="mr-2" />
                  Print Receipt
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
                    const isVoided = selectedOrder.voided_items?.some((v) => v.id === item.id);
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
      )}

      {confirmOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="admin-card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Confirm Payment</h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Mark table {confirmOrder.table?.number ?? "-"} (Order #{confirmOrder.id}) as paid?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOrder(null)}>Cancel</Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  handleMarkPaid(confirmOrder.id);
                  setConfirmOrder(null);
                }}
              >
                <FaCheckCircle className="mr-2" />
                Confirm
              </Button>
            </div>
          </Card>
        </div>
      )}

      {confirmPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="admin-card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Confirm Print</h3>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Print receipt for table {confirmPrint.table?.number ?? "-"} (Order #{confirmPrint.id})?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmPrint(null)}>Cancel</Button>
              <Button
                className="bg-slate-700 text-white hover:bg-slate-800"
                onClick={() => {
                  handlePrintReceipt(confirmPrint.id);
                  setConfirmPrint(null);
                }}
              >
                <FaPrint className="mr-2" />
                Print
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
