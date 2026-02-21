import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaBoxes } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../context/AuthContext";

import PurchaseManagement from "@/components/inventory/PurchaseManagement";
import TransferManagement from "@/components/inventory/TransferManagement";
import StoreStationView from "@/components/inventory/ViewStock";
import InventoryItemManagement from "@/components/inventory/InventoryItemManagement";

export default function InventoryDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState("inventory-register");

  const goBack = () => {
    if (user?.role === "manager") {
      navigate("/manager");
      return;
    }
    navigate("/admin");
  };

  const menuItems = [
    { id: "inventory-register", label: "Register" },
    { id: "inventory-add", label: "Purchase" },
    { id: "inventory-transfer", label: "Transfer" },
    { id: "inventory-view", label: "View Stock" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-label="Back"
          >
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2">
            <FaBoxes />
            <span className="font-semibold">Inventory</span>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={logout}>
          Logout
        </Button>
      </header>

      <main className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {menuItems.map((item) => (
            <Button
              key={item.id}
              variant={active === item.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {active === "inventory-register" && (
          <Card className="p-6 w-full">
            <h2 className="text-xl font-bold mb-4">Register</h2>
            <InventoryItemManagement />
          </Card>
        )}

        {active === "inventory-add" && (
          <Card className="p-6 w-full">
            <h2 className="text-xl font-bold mb-4">Purchase</h2>
            <PurchaseManagement />
          </Card>
        )}

        {active === "inventory-transfer" && (
          <Card className="p-6 w-full">
            <h2 className="text-xl font-bold mb-4">Transfer</h2>
            <TransferManagement />
          </Card>
        )}

        {active === "inventory-view" && (
          <Card className="p-6 w-full">
            <StoreStationView />
          </Card>
        )}
      </main>
    </div>
  );
}
