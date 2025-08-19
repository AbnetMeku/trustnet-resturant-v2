// src/components/waiter/OrdersHub.jsx
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import NewOrder from "@/components/waiter/NewOrder";
import ActiveOrders from "@/components/waiter/ActiveOrders";

export default function OrdersHub() {
  const [view, setView] = useState("hub"); // hub | new | active

  const handleBack = () => setView("hub");

  // Conditional views
  if (view === "new") {
    return <NewOrder goBack={handleBack} />;
  }

  if (view === "active") {
    return <ActiveOrders goBack={handleBack} />;
  }

  // Hub landing view
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6">
      <Card className="p-10 w-80 text-center shadow-xl rounded-2xl">
        <h2 className="text-2xl font-bold mb-8">Orders</h2>

        <div className="flex flex-col space-y-4">
          <Button
            size="lg"
            className="py-4 text-lg font-semibold"
            onClick={() => setView("new")}
          >
            ➕ New Order
          </Button>

          <Button
            size="lg"
            className="py-4 text-lg font-semibold"
            onClick={() => setView("active")}
          >
            📂 Active Orders
          </Button>
        </div>
      </Card>
    </div>
  );
}
