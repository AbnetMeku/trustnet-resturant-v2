import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

import { getMenuItems } from "@/api/menu_item";
import { getStations } from "@/api/stations";
import {
  getPurchases,
  getTransfers,
  createPurchase,
  createTransfer,
} from "@/api/inventory";

// Dialog from shadcn/ui
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 10;

export default function InventoryManagement() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("purchases");

  // Dropdown options
  const [menuItems, setMenuItems] = useState([]);
  const [stations, setStations] = useState([]);

  // Data
  const [purchases, setPurchases] = useState([]);
  const [transfers, setTransfers] = useState([]);

  // Pagination
  const [purchasePage, setPurchasePage] = useState(1);
  const [transferPage, setTransferPage] = useState(1);

  // Dialog states
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  // Error state
  const [error, setError] = useState("");

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
      } catch (err) {
        console.error("Failed to load dropdowns:", err);
      }
    })();
  }, [token]);

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
    setError("");
    try {
      if (!purchaseForm.menu_item_id || !purchaseForm.quantity) {
        setError("Please fill in all required fields.");
        return;
      }
      await createPurchase(
        {
          menu_item_id: parseInt(purchaseForm.menu_item_id),
          quantity: parseFloat(purchaseForm.quantity),
          unit_price: parseFloat(purchaseForm.unit_price) || null,
        },
        token
      );
      setPurchaseForm({ menu_item_id: "", quantity: "", unit_price: "" });
      setShowPurchaseDialog(false);
      loadPurchases();
    } catch (err) {
      console.error("Purchase failed:", err);
      setError("Failed to add purchase. Try again.");
    }
  };

  // Handle transfer submit
  const handleTransferSubmit = async () => {
    setError("");
    try {
      if (!transferForm.menu_item_id || !transferForm.station_id || !transferForm.quantity) {
        setError("Please fill in all required fields.");
        return;
      }

      // Check if item was purchased first
      const purchasedItemIds = purchases.map((p) => p.menu_item_id);
      if (!purchasedItemIds.includes(parseInt(transferForm.menu_item_id))) {
        setError("This item has not been purchased yet and cannot be transferred.");
        return;
      }

      await createTransfer(
        {
          menu_item_id: parseInt(transferForm.menu_item_id),
          station_id: parseInt(transferForm.station_id),
          quantity: parseFloat(transferForm.quantity),
        },
        token
      );
      setTransferForm({ menu_item_id: "", station_id: "", quantity: "" });
      setShowTransferDialog(false);
      loadTransfers();
    } catch (err) {
      console.error("Transfer failed:", err);
      setError("Insufficient stock or transfer failed.");
    }
  };

  // Pagination helper
  const paginate = (data, page) =>
    data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="p-6 w-full">
      <h2 className="text-xl font-bold mb-4">Inventory Management</h2>

      {error && (
        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        {/* Purchases */}
        <TabsContent value="purchases">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Purchases</h3>
            <Button onClick={() => setShowPurchaseDialog(true)}>+ Add Purchase</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg shadow-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">#</th>
                  <th className="p-2 border">Item</th>
                  <th className="p-2 border">Quantity</th>
                  <th className="p-2 border">Unit Price</th>
                  <th className="p-2 border">Date</th>
                </tr>
              </thead>
              <tbody>
                {paginate(purchases, purchasePage).map((p, i) => (
                  <tr key={p.id}>
                    <td className="p-2 border">
                      {(purchasePage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="p-2 border">{p.menu_item}</td>
                    <td className="p-2 border">{p.quantity}</td>
                    <td className="p-2 border">{p.unit_price ?? "-"}</td>
                    <td className="p-2 border">{p.created_at ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-3">
            <Button
              disabled={purchasePage === 1}
              onClick={() => setPurchasePage(purchasePage - 1)}
            >
              Prev
            </Button>
            <span>
              Page {purchasePage} of{" "}
              {Math.ceil(purchases.length / PAGE_SIZE) || 1}
            </span>
            <Button
              disabled={purchasePage * PAGE_SIZE >= purchases.length}
              onClick={() => setPurchasePage(purchasePage + 1)}
            >
              Next
            </Button>
          </div>
        </TabsContent>

        {/* Transfers */}
        <TabsContent value="transfers">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Transfers</h3>
            <Button onClick={() => setShowTransferDialog(true)}>+ Transfer Item</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg shadow-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="p-2 border">#</th>
                  <th className="p-2 border">Item</th>
                  <th className="p-2 border">Station</th>
                  <th className="p-2 border">Quantity</th>
                  <th className="p-2 border">Date</th>
                </tr>
              </thead>
              <tbody>
                {paginate(transfers, transferPage).map((t, i) => (
                  <tr key={t.id}>
                    <td className="p-2 border">
                      {(transferPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="p-2 border">{t.menu_item}</td>
                    <td className="p-2 border">{t.station}</td>
                    <td className="p-2 border">{t.quantity}</td>
                    <td className="p-2 border">{t.created_at ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-3">
            <Button
              disabled={transferPage === 1}
              onClick={() => setTransferPage(transferPage - 1)}
            >
              Prev
            </Button>
            <span>
              Page {transferPage} of{" "}
              {Math.ceil(transfers.length / PAGE_SIZE) || 1}
            </span>
            <Button
              disabled={transferPage * PAGE_SIZE >= transfers.length}
              onClick={() => setTransferPage(transferPage + 1)}
            >
              Next
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Purchase Dialog */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Purchase</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <select
              value={purchaseForm.menu_item_id}
              onChange={(e) =>
                setPurchaseForm({ ...purchaseForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2 bg-white dark:bg-gray-800"
            >
              <option value="">Select Menu Item</option>
              {menuItems
                .filter((m) => m.category !== "food") // exclude food
                .map((m) => (
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
            <Button onClick={handlePurchaseSubmit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Item</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <select
              value={transferForm.menu_item_id}
              onChange={(e) =>
                setTransferForm({ ...transferForm, menu_item_id: e.target.value })
              }
              className="border rounded p-2 bg-white dark:bg-gray-800"
            >
              <option value="">Select Item</option>
              {menuItems
                .filter((m) =>
                  purchases.some((p) => p.menu_item_id === m.id) // must be purchased first
                )
                .map((m) => (
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
              className="border rounded p-2 bg-white dark:bg-gray-800"
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
        </DialogContent>
      </Dialog>
    </Card>
  );
}
