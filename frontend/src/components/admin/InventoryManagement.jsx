import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getMenuItems } from "@/api/menu_item";
import { getStations } from "@/api/stations";
import {
  getStoreStock,
  getPurchases,
  getTransfers,
  createPurchase,
  createTransfer,
} from "@/api/inventory";

export default function InventoryManagement() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("stock");

  // Dropdown data
  const [menuItems, setMenuItems] = useState([]);
  const [stations, setStations] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setMenuItems(await getMenuItems({}, token));
        setStations(await getStations(token));
      } catch (err) {
        console.error("Failed to load dropdowns:", err);
      }
    })();
  }, [token]);

  // ---------------- Stock ----------------
  const [stock, setStock] = useState([]);
  const loadStock = async () => {
    try {
      const data = await getStoreStock(token);
      setStock(data);
    } catch (err) {
      console.error("Error loading stock:", err);
    }
  };
  useEffect(() => {
    loadStock();
  }, []);

  // ---------------- Purchases ----------------
  const [purchases, setPurchases] = useState([]);
  const [purchaseForm, setPurchaseForm] = useState({
    menu_item_id: "",
    quantity: "",
    unit_price: "",
  });

  const loadPurchases = async () => {
    try {
      setPurchases(await getPurchases(token));
    } catch (err) {
      console.error("Error loading purchases:", err);
    }
  };

  const handlePurchaseSubmit = async () => {
    try {
      await createPurchase(
        {
          menu_item_id: parseInt(purchaseForm.menu_item_id),
          quantity: parseFloat(purchaseForm.quantity),
          unit_price: parseFloat(purchaseForm.unit_price) || null,
        },
        token
      );
      setPurchaseForm({ menu_item_id: "", quantity: "", unit_price: "" });
      loadPurchases();
      loadStock(); // refresh stock too
    } catch (err) {
      console.error("Purchase failed:", err);
    }
  };

  // ---------------- Transfers ----------------
  const [transfers, setTransfers] = useState([]);
  const [transferForm, setTransferForm] = useState({
    menu_item_id: "",
    station_id: "",
    quantity: "",
  });

  const loadTransfers = async () => {
    try {
      setTransfers(await getTransfers(token));
    } catch (err) {
      console.error("Error loading transfers:", err);
    }
  };

  const handleTransferSubmit = async () => {
    try {
      await createTransfer(
        {
          menu_item_id: parseInt(transferForm.menu_item_id),
          station_id: parseInt(transferForm.station_id),
          quantity: parseFloat(transferForm.quantity),
        },
        token
      );
      setTransferForm({ menu_item_id: "", station_id: "", quantity: "" });
      loadTransfers();
      loadStock();
    } catch (err) {
      console.error("Transfer failed:", err);
    }
  };

  return (
    <Card className="p-6 w-full">
      <h2 className="text-xl font-bold mb-4">Inventory Management</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        {/* -------- Stock View -------- */}
        <TabsContent value="stock">
          <h3 className="font-semibold my-3">Store & Station Stock</h3>
          <Button variant="outline" onClick={loadStock} className="mb-3">
            Refresh
          </Button>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">Menu Item</th>
                  <th className="p-2 border">Store Qty</th>
                  <th className="p-2 border">Station</th>
                  <th className="p-2 border">Station Qty</th>
                  <th className="p-2 border">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s, i) => (
                  <tr key={i}>
                    <td className="p-2 border">{s.menu_item}</td>
                    <td className="p-2 border">{s.store_quantity ?? "-"}</td>
                    <td className="p-2 border">{s.station ?? "-"}</td>
                    <td className="p-2 border">{s.quantity ?? "-"}</td>
                    <td className="p-2 border">{s.total_value ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* -------- Purchases -------- */}
        <TabsContent value="purchases">
          <h3 className="font-semibold my-3">Add Purchase</h3>
          <div className="flex gap-2 mb-4">
            <select
              value={purchaseForm.menu_item_id}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2"
            >
              <option value="">Select Item</option>
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Quantity"
              value={purchaseForm.quantity}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, quantity: e.target.value })
              }
            />
            <Input
              placeholder="Unit Price"
              value={purchaseForm.unit_price}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, unit_price: e.target.value })
              }
            />
            <Button onClick={handlePurchaseSubmit}>Add</Button>
          </div>
          <Button variant="outline" onClick={loadPurchases} className="mb-3">
            Refresh Purchases
          </Button>
        </TabsContent>

        {/* -------- Transfers -------- */}
        <TabsContent value="transfers">
          <h3 className="font-semibold my-3">Transfer Stock</h3>
          <div className="flex gap-2 mb-4">
            <select
              value={transferForm.menu_item_id}
              onChange={(e) =>
                setTransferForm({ ...transferForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2"
            >
              <option value="">Select Item</option>
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={transferForm.station_id}
              onChange={(e) =>
                setTransferForm({ ...transferForm, station_id: e.target.value })
              }
              className="border rounded p-2"
            >
              <option value="">Select Station</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Quantity"
              value={transferForm.quantity}
              onChange={(e) =>
                setTransferForm({ ...transferForm, quantity: e.target.value })
              }
            />
            <Button onClick={handleTransferSubmit}>Transfer</Button>
          </div>
          <Button variant="outline" onClick={loadTransfers} className="mb-3">
            Refresh Transfers
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
