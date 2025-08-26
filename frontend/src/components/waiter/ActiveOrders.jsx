import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import { fetchOrders, addOrderItems, updateOrderStatus } from "@/api/orders";
import ActiveMenuSelection from "./ActiveMenuSelection";
import ActiveOrderSummary from "./ActiveOrderSummary";
import { Button } from "@/components/ui/button";
import { updateTable } from "@/api/tables";


export default function ActiveOrders({ goBack }) {
  const { authToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [openOrders, setOpenOrders] = useState([]);
  const [step, setStep] = useState("list"); // list | menu | summary
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  // New state to track order ID pending close confirmation
  const [confirmCloseId, setConfirmCloseId] = useState(null);

  // Load open orders
  useEffect(() => {
    if (!authToken) return;

    const loadOpenOrders = async () => {
      try {
        setLoading(true);
        const orders = await fetchOrders(authToken, { status: "open" });
        setOpenOrders(orders);
      } catch (err) {
        toast.error(err.message || "Failed to fetch orders");
      } finally {
        setLoading(false);
      }
    };

    loadOpenOrders();
  }, [authToken]);

  // Select an order to update
  const selectOrder = (order) => {
    setSelectedOrder(order);
    setOrderItems([]); // start with empty cart for new additions
    setStep("menu");
  };

  // Add item handler
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

  // Remove or update quantity
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

  // Go to summary
  const nextStep = () => setStep("summary");
  const prevStep = () => {
    if (step === "summary") setStep("menu");
    else if (step === "menu") setStep("list");
  };

  // Save updated items to backend
  const handleSave = async () => {
    if (!authToken) return;
    try {
      const itemsToSend = orderItems.map((i) => ({
        menu_item_id: i.menu_item_id,
        quantity: i.quantity,
        notes: i.notes || "",
      }));
      await addOrderItems(authToken, selectedOrder.id, itemsToSend);
      toast.success("Order updated successfully!");
      setStep("list");
      setSelectedOrder(null);
      setOrderItems([]);
      // Reload orders
      const orders = await fetchOrders(authToken, { status: "open" });
      setOpenOrders(orders);
    } catch (err) {
      toast.error(err.message || "Failed to update order");
    }
  };

  // Close order handler after confirmation
const handleCloseOrder = async (orderId) => {
  if (!authToken) return;
  try {
    // 1. Close the order
    await updateOrderStatus(authToken, orderId, "closed");

    // 2. Find the table associated with this order
    const order = openOrders.find(o => o.id === orderId);
    if (order?.table_id) {
      // Update table status to "available"
      await updateTable(order.table_id, { status: "available" }, authToken);
    }

    toast.success("Order closed successfully and table is now available!");

    // Reload open orders
    const orders = await fetchOrders(authToken, { status: "open" });
    setOpenOrders(orders);

    // Reset selection if closing currently selected order
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null);
      setOrderItems([]);
      setStep("list");
    }
  } catch (err) {
    toast.error(err.message || "Failed to close order");
  } finally {
    setConfirmCloseId(null); // Reset confirmation popup state
  }
};


  // Render logic
  if (step === "menu" && selectedOrder)
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

  if (step === "summary" && selectedOrder)
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

// Default: list view
return (
  <div className="p-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-2xl font-bold">Open Orders</h2>
      <Button variant="outline" onClick={goBack}>
        ← Back
      </Button>
    </div>

    {loading ? (
      <p>Loading orders...</p>
    ) : openOrders.length === 0 ? (
      <p>No open orders</p>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
{openOrders.map((order) => (
  <div
    key={order.id}
    className="relative border rounded-lg p-4 shadow cursor-pointer hover:shadow-lg transition flex flex-col justify-between"
  >
    {/* Close X button at top-right */}
    <button
      onClick={(e) => {
        e.stopPropagation(); // prevent card click
        setConfirmCloseId(order.id);
      }}
      className="absolute top-2 right-2 text-gray-500 hover:text-red-600 font-bold"
      aria-label={`Close order ${order.id}`}
    >
      ×
    </button>

    <div onClick={() => selectOrder(order)} className="cursor-pointer">
      <h3 className="font-bold text-lg mb-2">Table {order.table_id}</h3>
      <p>Total: ${order.total_amount.toFixed(2)}</p>
    </div>

    {/* Confirmation popup */}
    {confirmCloseId === order.id && (
      <div className="mt-2 flex flex-col space-y-2 p-2 border rounded bg-red-50 dark:bg-red-900">
        <p className="text-sm text-red-700 dark:text-red-300">
          Are you sure you want to close this order?
        </p>
        <div className="flex space-x-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleCloseOrder(order.id)}
          >
            Yes, Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmCloseId(null)}
          >
            Cancel
          </Button>
        </div>
      </div>
    )}
  </div>
))}

      </div>
    )}
  </div>
);

}
