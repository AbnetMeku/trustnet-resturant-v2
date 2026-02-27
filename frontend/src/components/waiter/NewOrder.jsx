import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import TableSelection from "./TableSelection";
import MenuSelection from "./MenuSelection";
import OrderSummary from "./OrderSummary";
import { createOrder } from "@/api/orders";
import { Button } from "@/components/ui/button";

export default function NewOrder({ goBack, setError }) {
  const { authToken } = useAuth();
  const [step, setStep] = useState("table"); // table | menu | review
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const token = authToken;

  useEffect(() => {
    if (!token) {
      setLocalError("You are not logged in.");
      setError("You are not logged in.");
    }
  }, [token, setError]);

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

  const nextStep = (tableArg) => {
    if (step === "table") {
      const tableToCheck = tableArg || selectedTable;
      if (!tableToCheck) {
        setLocalError("Please select a table.");
        setError("Please select a table.");
        return;
      }
      if (tableArg) setSelectedTable(tableArg);
      setStep("menu");
    } else if (step === "menu") {
      if (orderItems.length === 0) {
        setLocalError("Please add at least one item to the order.");
        setError("Please add at least one item to the order.");
        return;
      }
      setStep("review");
    }
    setLocalError("");
    setError("");
  };

  const prevStep = () => {
    setLocalError("");
    setError("");
    if (step === "review") setStep("menu");
    else if (step === "menu") setStep("table");
    else goBack();
  };

  const handlePlaceOrder = async () => {
    if (submittingRef.current) return;
    if (!token) {
      setLocalError("You are not logged in.");
      setError("You are not logged in.");
      return;
    }
    if (!selectedTable || orderItems.length === 0) return;

    submittingRef.current = true;
    setLoading(true);
    try {
      const items = orderItems.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        notes:
          item.notes && typeof item.notes === "string"
            ? item.notes.slice(0, 255)
            : "",
      }));

      if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        setLocalError("All items must have a positive quantity.");
        setError("All items must have a positive quantity.");
        return;
      }

      await createOrder(token, selectedTable.id, items);

      toast.custom(
        (t) => (
          <div
            className={`${
              t.visible ? "animate-enter" : "animate-leave"
            } max-w-sm rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-xl dark:border-emerald-900 dark:bg-gray-900`}
          >
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Order sent successfully
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Kitchen/station tickets were queued.
            </p>
          </div>
        ),
        { duration: 2200, position: "top-center" }
      );

      setStep("table");
      setSelectedTable(null);
      setOrderItems([]);
      goBack();
    } catch (err) {
      const isConflict = typeof err?.message === "string" && err.message.includes("[409]");
      if (isConflict) {
        setLocalError("This table already has an active order.");
        setError("This table already has an active order.");
      } else {
        const errorMessage = err.message || "Failed to submit order.";
        setLocalError(errorMessage);
        setError(errorMessage);
      }
      console.error("Order submission error:", err);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col h-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <p className="text-red-500 mb-4 text-sm">
          You must be logged in to create an order.
        </p>
        <Button variant="outline" onClick={goBack}>
          Back to Hub
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg relative">
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
          disabled={loading}
        />
      )}
    </div>
  );
}
