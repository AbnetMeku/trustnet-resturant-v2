import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchOrders, addOrderItems, updateOrderStatus } from "@/api/orders";
import ActiveMenuSelection from "./ActiveMenuSelection";
import ActiveOrderSummary from "./ActiveOrderSummary";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/apiError";

export default function ActiveOrders({ goBack }) {
  const { authToken, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [openOrders, setOpenOrders] = useState([]);
  const [step, setStep] = useState("list");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [confirmCloseId, setConfirmCloseId] = useState(null);
  const [detailsOrder, setDetailsOrder] = useState(null);

  useEffect(() => {
    if (!authToken || !user) return;

    const loadOrders = async () => {
      try {
        setLoading(true);
        const orders = await fetchOrders(authToken, { status: "open" });
        setOpenOrders(orders);
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Failed to load open orders."));
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken, user]);

  const selectOrder = (order) => {
    setSelectedOrder(order);
    setOrderItems([]);
    setStep("menu");
  };

  const addItem = (item) => {
    const increment = item.increment || 1;
    setOrderItems((prev) => {
      const idx = prev.findIndex((i) => i.menu_item_id === item.menu_item_id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx].quantity = Number((updated[idx].quantity + increment).toFixed(1));
        return updated;
      }
      return [...prev, { ...item, quantity: increment }];
    });
  };

  const removeItem = (itemId) => setOrderItems((prev) => prev.filter((i) => i.menu_item_id !== itemId));

  const updateQuantity = (itemId, delta) => {
    setOrderItems((prev) =>
      prev
        .map((i) => {
          if (i.menu_item_id === itemId) {
            const newQty = Number((i.quantity + delta).toFixed(1));
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean)
    );
  };

  const nextStep = () => setStep("summary");
  const prevStep = () => setStep(step === "summary" ? "menu" : "list");

  const refreshOrders = async () => {
    try {
      const orders = await fetchOrders(authToken, { status: "open" });
      setOpenOrders(orders);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!authToken || !selectedOrder || orderItems.length === 0) return;

    const itemsToSend = orderItems.map((i) => ({
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      notes: i.notes || "",
    }));

    await addOrderItems(authToken, selectedOrder.id, itemsToSend);
    setOrderItems([]);
    await refreshOrders();
    setSelectedOrder(null);
    setStep("list");
  };

  const handleCloseOrder = async (orderId) => {
    if (!authToken) return;
    try {
      await updateOrderStatus(authToken, orderId, "closed");
      toast.success("Order closed");
      await refreshOrders();

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
        setOrderItems([]);
        setStep("list");
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to close order."));
    } finally {
      setConfirmCloseId(null);
    }
  };

  if (step === "menu" && selectedOrder) {
    return (
      <ActiveMenuSelection
        selectedOrder={selectedOrder}
        orderItems={orderItems}
        addItem={addItem}
        removeItem={removeItem}
        updateQuantity={updateQuantity}
        onNext={nextStep}
        onBack={prevStep}
      />
    );
  }

  if (step === "summary" && selectedOrder) {
    return (
      <ActiveOrderSummary
        selectedOrder={selectedOrder}
        orderItems={orderItems}
        removeItem={removeItem}
        updateQuantity={updateQuantity}
        onBack={prevStep}
        onSave={handleSave}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">የተከፈተ ትዕዛዝ</h2>
          {!loading && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{openOrders.length} ትዕዛዝ</p>}
        </div>
        <Button variant="outline" onClick={goBack}>
          {"\u2190"} ተመለስ
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-44 rounded-2xl border bg-white/60 dark:bg-gray-800/60 animate-pulse" />
          ))}
        </div>
      ) : openOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-gray-500">ምንም የተከፈተ ትዕዛዝ የለም</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {openOrders.map((order) => (
            <div
              key={order.id}
              role="button"
              tabIndex={0}
              onClick={() => selectOrder(order)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectOrder(order);
                }
              }}
              className="relative cursor-pointer bg-white/85 dark:bg-gray-800/85 backdrop-blur-md border border-slate-200/70 dark:border-slate-700 rounded-2xl p-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-xl text-gray-900 dark:text-white">Table {order.table.number}</h3>
                  <span className="inline-block px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-full dark:bg-slate-700 dark:text-slate-100">
                    #{order.id}
                  </span>
                </div>
                <span className="inline-block mt-3 px-3 py-1 text-sm font-semibold bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900 dark:text-blue-200">
                  ጠቅላላ ዋጋ: ${order.total_amount.toFixed(2)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailsOrder(order);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  ዝርዝር ይመልከቱ
                </Button>
                <Button
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmCloseId(order.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  ትዕዛዝ ዝጋ
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmCloseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[calc(100vh-2rem)]">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">እርግጠኛ ነዎት ይህ ትዕዛዝ ይዘጋ?</h3>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmCloseId(null)}>
                አይ
              </Button>
              <Button variant="destructive" onClick={() => handleCloseOrder(confirmCloseId)}>
                አዎ ዝጋ
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[calc(100vh-2rem)]">
            <h3 className="text-xl font-bold mb-4">
              Table {detailsOrder.table.number} - Order #{detailsOrder.id}
            </h3>
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/90">
                  <tr className="border-b dark:border-gray-600">
                    <th className="px-3 py-2">ትዕዛዝ</th>
                    <th className="px-3 py-2">ብዛት</th>
                    <th className="px-3 py-2">ዋጋ</th>
                    <th className="px-3 py-2">አጠቃላይ ዋጋ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(detailsOrder.active_items || []), ...(detailsOrder.voided_items || [])].map((item) => {
                    const isVoided = item.status?.includes("void");
                    return (
                      <tr
                        key={item.id}
                        className={`border-b dark:border-gray-700 ${
                          isVoided ? "bg-red-100 dark:bg-red-800/50 line-through text-gray-500 dark:text-gray-300" : ""
                        }`}
                      >
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2">${item.price.toFixed(2)}</td>
                        <td className="px-3 py-2">${(item.price * item.quantity).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-bold text-right text-lg">አጠቃላይ: ${detailsOrder.total_amount.toFixed(2)}</p>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setDetailsOrder(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
