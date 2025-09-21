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
  const [activeTab, setActiveTab] = useState("purchases");

  // Dropdown options
  const [menuItems, setMenuItems] = useState([]);
  const [stations, setStations] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  // Data states
  const [stock, setStock] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [transfers, setTransfers] = useState([]);

  // Forms
  const [purchaseForm, setPurchaseForm] = useState({
    menu_item_id: "",
    quantity: "",
    unit_price: "",
  });
  const [transferForm, setTransferForm] = useState({
    menu_item_id: "",
    station_id: "",
    quantity: "",
  });

  // Load dropdowns
  useEffect(() => {
    (async () => {
      try {
        setMenuItems(await getMenuItems({}, token));
        setStations(await getStations(token));
        const stockData = await getStoreStock(token);
        setInventoryItems(
          stockData.map((s) => ({
            id: s.id ?? s.inventory_item_id ?? s.menu_item_id,
            name: s.menu_item,
          }))
        );
      } catch (err) {
        console.error("Failed to load dropdowns:", err);
      }
    })();
  }, [token]);

  // Load store stock
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

  // Load purchases
  const loadPurchases = async () => {
    try {
      setPurchases(await getPurchases(token));
    } catch (err) {
      console.error("Error loading purchases:", err);
    }
  };
  useEffect(() => {
    loadPurchases();
  }, []);

  // Load transfers
  const loadTransfers = async () => {
    try {
      setTransfers(await getTransfers(token));
    } catch (err) {
      console.error("Error loading transfers:", err);
    }
  };
  useEffect(() => {
    loadTransfers();
  }, []);

  // Handle purchase submit
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
      loadStock();
    } catch (err) {
      console.error("Purchase failed:", err);
    }
  };

  // Handle transfer submit
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
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
          <TabsTrigger value="stations">Stations</TabsTrigger>
        </TabsList>

        {/* Purchases */}
        <TabsContent value="purchases">
          <h3 className="font-semibold my-3">Add Purchase</h3>
          <div className="flex gap-2 mb-4">
            <select
              value={purchaseForm.menu_item_id}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2 bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              <option value="">Select Menu Item</option>
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

          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">Item</th>
                  <th className="p-2 border">Quantity</th>
                  <th className="p-2 border">Unit Price</th>
                  <th className="p-2 border">Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="p-2 border">{p.menu_item}</td>
                    <td className="p-2 border">{p.quantity}</td>
                    <td className="p-2 border">{p.unit_price ?? "-"}</td>
                    <td className="p-2 border">{p.created_at ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Transfers */}
        <TabsContent value="transfers">
          <h3 className="font-semibold my-3">Transfer Stock</h3>
          <div className="flex gap-2 mb-4">
            <select
              value={transferForm.menu_item_id}
              onChange={(e) =>
                setTransferForm({ ...transferForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2 bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              <option value="">Select Inventory Item</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={transferForm.station_id}
              onChange={(e) =>
                setTransferForm({ ...transferForm, station_id: e.target.value })
              }
              className="border rounded p-2 bg-white dark:bg-gray-800 text-black dark:text-white"
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

          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">Item</th>
                  <th className="p-2 border">Station</th>
                  <th className="p-2 border">Quantity</th>
                  <th className="p-2 border">Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="p-2 border">{t.menu_item}</td>
                    <td className="p-2 border">{t.station}</td>
                    <td className="p-2 border">{t.quantity}</td>
                    <td className="p-2 border">{t.created_at ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Store */}
        <TabsContent value="store">
          <h3 className="font-semibold my-3">Store Stock</h3>
          <Button variant="outline" onClick={loadStock} className="mb-3">
            Refresh
          </Button>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">Menu Item</th>
                  <th className="p-2 border">Store Qty</th>
                </tr>
              </thead>
              <tbody>
                {stock.map(
                  (s, i) =>
                    s.store_quantity !== undefined && (
                      <tr key={i}>
                        <td className="p-2 border">{s.menu_item}</td>
                        <td className="p-2 border">{s.store_quantity}</td>
                      </tr>
                    )
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Stations */}
        <TabsContent value="stations">
          <h3 className="font-semibold my-3">Station Stock</h3>
          <Button variant="outline" onClick={loadStock} className="mb-3">
            Refresh
          </Button>
          <div className="overflow-x-auto">
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">Menu Item</th>
                  <th className="p-2 border">Station</th>
                  <th className="p-2 border">Station Qty</th>
                </tr>
              </thead>
              <tbody>
                {stock.map(
                  (s, i) =>
                    s.station && (
                      <tr key={i}>
                        <td className="p-2 border">{s.menu_item}</td>
                        <td className="p-2 border">{s.station}</td>
                        <td className="p-2 border">{s.quantity ?? "-"}</td>
                      </tr>
                    )
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
