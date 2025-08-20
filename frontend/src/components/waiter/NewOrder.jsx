import React, { useState, useEffect } from "react";
import TableSelection from "./TableSelection";
import MenuSelection from "./MenuSelection";
import OrderSummary from "./OrderSummary";
import { createOrder } from "@/api/orders"; // From orders.js (artifact version 1e61e1c9-364b-4f45-891e-0a063fe99dae)

export default function NewOrder({ goBack, setError }) {
  const [step, setStep] = useState("table"); // table | menu | review
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("auth_token"); // JWT token

  // Check token on mount
  useEffect(() => {
    if (!token) {
      setLocalError("You are not logged in.");
      setError("You are not logged in.");
    }
  }, [token, setError]);

  // Add item with quantity rule
  const addItem = (item) => {
    if (!item.id || !Number.isInteger(item.id)) {
      setLocalError("Invalid menu item selected.");
      return;
    }
    const increment = item.increment || 1;
    if (!Number.isFinite(increment) || increment <= 0) {
      setLocalError("Invalid increment value for menu item.");
      return;
    }
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex].quantity = Number(
          (updated[existingIndex].quantity + increment).toFixed(1)
        );
        return updated;
      }
      return [...prev, { ...item, quantity: increment }];
    });
    setLocalError("");
  };

  const removeItem = (itemId) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== itemId));
    setLocalError("");
  };

  const updateQuantity = (itemId, delta) => {
    setOrderItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const increment = item.increment || 1;
            const newQuantity = Number((item.quantity + delta * increment).toFixed(1));
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
    setLocalError("");
  };

  const nextStep = () => {
    if (step === "table" && !selectedTable) {
      setLocalError("Please select a table.");
      setError("Please select a table.");
      return;
    }
    if (step === "menu" && orderItems.length === 0) {
      setLocalError("Please add at least one item to the order.");
      setError("Please add at least one item to the order.");
      return;
    }
    setLocalError("");
    setError("");
    setStep(step === "table" ? "menu" : "review");
  };

  const prevStep = () => {
    setLocalError("");
    setError("");
    if (step === "review") setStep("menu");
    else if (step === "menu") setStep("table");
    else goBack();
  };

  const handlePlaceOrder = async () => {
    if (!token) {
      setLocalError("You are not logged in.");
      setError("You are not logged in.");
      return;
    }
    setLoading(true);
    try {
      const items = orderItems.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        notes: item.notes && typeof item.notes === "string" ? item.notes.slice(0, 255) : "",
      }));
      if (items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        setLocalError("All items must have a positive quantity.");
        setError("All items must have a positive quantity.");
        setLoading(false);
        return;
      }
      await createOrder(token, selectedTable.id, items);
      alert("Order placed successfully!");
      setStep("table");
      setSelectedTable(null);
      setOrderItems([]);
      goBack();
    } catch (err) {
      const errorMessage = err.message || "Failed to submit order.";
      console.error("Order submission error:", errorMessage);
      setLocalError(errorMessage);
      setError(errorMessage);
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="flex flex-col h-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <p className="text-red-500 mb-4 text-sm">You must be logged in to create an order.</p>
        <Button variant="outline" onClick={goBack}>
          Back to Hub
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
      {localError && <p className="text-red-500 mb-4 text-sm">{localError}</p>}
      {loading && <p className="text-center py-4">Submitting order...</p>}

      {step === "table" && (
        <TableSelection
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          onNext={nextStep}
          onBack={prevStep}
          setError={setError}
        />
      )}
      {step === "menu" && (
        <MenuSelection
          selectedTable={selectedTable}
          orderItems={orderItems}
          addItem={addItem}
          removeItem={removeItem}
          updateQuantity={updateQuantity}
          onNext={nextStep}
          onBack={prevStep}
          setError={setError}
        />
      )}
      {step === "review" && (
        <OrderSummary
          selectedTable={selectedTable}
          orderItems={orderItems || []}
          removeItem={removeItem}
          onPlaceOrder={handlePlaceOrder}
          onBack={prevStep}
          setError={setError}
        />
      )}
    </div>
  );
}