import React, { useState } from "react";
import TableSelection from "./TableSelection";
import MenuSelection from "./MenuSelection";
import OrderSummary from "./OrderSummary";

export default function NewOrder({ goBack }) {
  const [step, setStep] = useState("table"); // table | menu | review
  const [selectedTable, setSelectedTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  // Add item with quantity rule
  const addItem = (item) => {
    let increment = 1;
    if (
      item.category_name?.toLowerCase() === "alcohols" &&
      item.subcategory_name?.toLowerCase() === "butchery"
    ) {
      increment = 0.5;
    }

    setOrderItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += increment;
        return updated;
      }
      return [...prev, { ...item, quantity: increment }];
    });
  };

  const removeItem = (index) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (itemId, newQuantity) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const nextStep = () => {
    if (step === "table" && !selectedTable) return;
    if (step === "menu" && orderItems.length === 0) return;
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
    <div className="flex flex-col h-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
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
          selectedTable={selectedTable}
          orderItems={orderItems}
          addItem={addItem} // increment handled here
          removeItem={removeItem}
          updateQuantity={updateQuantity}
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
