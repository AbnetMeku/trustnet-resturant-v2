// src/components/waiter/NewOrder.jsx
import React, { useState } from "react";
import TableSelection from "./TableSelection";
import MenuSelection from "./MenuSelection";
import OrderSummary from "./OrderSummary";

export default function NewOrder({ goBack }) {
  const [step, setStep] = useState("table"); // table | menu | review
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  // Add item to order
  const addItem = (item) => {
    setOrderItems((prev) => [...prev, item]);
  };

  // Remove item
  const removeItem = (index) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Go to next step
  const nextStep = () => {
    if (step === "table") setStep("menu");
    else if (step === "menu") setStep("review");
  };

  const prevStep = () => {
    if (step === "review") setStep("menu");
    else if (step === "menu") setStep("table");
    else goBack();
  };

  const handlePlaceOrder = () => {
    console.log("Placing order:", { table: selectedTable, items: orderItems });
    alert("Order placed successfully!");
    goBack();
  };

  return (
    <div className="p-4">
      {step === "table" && (
        <TableSelection
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {step === "menu" && (
        <MenuSelection
          orderItems={orderItems}
          addItem={addItem}
          removeItem={removeItem}
          onNext={nextStep}
          onBack={prevStep}
        />
      )}

      {step === "review" && (
        <OrderSummary
          selectedTable={selectedTable}
          orderItems={orderItems}
          removeItem={removeItem}
          onPlaceOrder={handlePlaceOrder}
          onBack={prevStep}
        />
      )}
    </div>
  );
}
