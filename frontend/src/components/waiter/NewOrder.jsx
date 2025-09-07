import React, { useState, useEffect } from "react";
import TableSelection from "./TableSelection";
import MenuSelection from "./MenuSelection";
import OrderSummary from "./OrderSummary";
import { createOrder } from "@/api/orders";
import { Button } from "@/components/ui/button";

export default function NewOrder({ goBack, setError }) {
  const [step, setStep] = useState("table"); // table | menu | review
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false); // ✅ modal visibility

  const token = localStorage.getItem("auth_token");

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
        notes:
          item.notes && typeof item.notes === "string"
            ? item.notes.slice(0, 255)
            : "",
      }));

      if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        setLocalError("All items must have a positive quantity.");
        setError("All items must have a positive quantity.");
        setLoading(false);
        return;
      }

      await createOrder(token, selectedTable.id, items);

      // Show success modal
      setSuccessVisible(true);

      setTimeout(() => {
        setSuccessVisible(false);
        setStep("table");
        setSelectedTable(null);
        setOrderItems([]);
        goBack();
      }, 2000);
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setLocalError("This table already has an active order.");
        setError("This table already has an active order.");
      } else {
        const errorMessage = err.message || "Failed to submit order.";
        setLocalError(errorMessage);
        setError(errorMessage);
      }
      console.error("Order submission error:", err);
    }
    setLoading(false);
  };

  // ✅ Full-screen success modal component
  const SuccessModal = ({ visible }) => {
    if (!visible) return null;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[9999]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm text-center">
          <h2 className="text-xl font-semibold mb-4 text-green-600">
            ✅ ትዕዛዙ ተሳክቷል!
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            ትዕዛዝ በተሳካ ሁኔታ ተልኳል 🚀
          </p>
        </div>
      </div>
    );
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
          disabled={loading} // ✅ disable button while submitting
        />
      )}

      {/* ✅ Success Modal */}
      <SuccessModal visible={successVisible} onClose={() => setSuccessVisible(false)} />
    </div>
  );
}
