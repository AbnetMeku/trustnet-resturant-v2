import React, { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { createPurchase, getPurchases, updatePurchase, deletePurchase } from "@/api/inventory/purchases";
import { getInventoryItems } from "@/api/inventory/items";
import { getAllStoreStock } from "@/api/inventory/stock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ReactSelect from "react-select";
import { toast } from "react-hot-toast";
import { formatEatDateTime } from "@/lib/timezone";
import { getApiErrorMessage } from "@/lib/apiError";

const PAGE_SIZE = 10;

export default function PurchaseManagement() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("add");
  const [items, setItems] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ inventory_item_id: "", quantity: "", unit_price: "" });

  const selectedItem = useMemo(
    () => items.find((i) => i.id === Number(form.inventory_item_id)),
    [items, form.inventory_item_id]
  );
  const currentStockQty = useMemo(
    () => {
      const stock = stocks.find((s) => s.inventory_item_id === Number(form.inventory_item_id));
      return stock ? stock.quantity : 0;
    },
    [stocks, form.inventory_item_id]
  );
  const parsedQuantity = Number(form.quantity || 0);
  const canSubmit =
    Boolean(form.inventory_item_id) &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    !submitting;

  // --- Load data ---
  const loadItems = async () => {
    try {
      const data = await getInventoryItems(token);
      setItems(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load inventory items."));
    }
  };

  const loadStocks = async () => {
    try {
      const data = await getAllStoreStock(token);
      setStocks(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load store stock data."));
    }
  };

  const loadPurchases = async () => {
    try {
      const data = await getPurchases(token);
      setPurchases(data.filter(p => p.status !== "Deleted").sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load purchases."));
    }
  };

  useEffect(() => {
    loadItems();
    loadStocks();
    loadPurchases();
  }, [token]);

  // --- Helper ---
  const getStockQty = (inventoryId) => {
    const stock = stocks.find((s) => s.inventory_item_id === inventoryId);
    return stock ? stock.quantity : 0;
  };

  // --- Form submission ---
const handleSubmit = async () => {
  const { inventory_item_id, quantity, unit_price } = form;

  if (!inventory_item_id) return toast.error("Please select an inventory item.");
  if (!quantity || isNaN(quantity) || quantity <= 0)
    return toast.error("Enter a valid quantity greater than zero.");

  const payload = {
    inventory_item_id: parseInt(inventory_item_id),
    quantity: parseFloat(parseFloat(quantity).toFixed(3)),
    unit_price: unit_price ? parseFloat(parseFloat(unit_price).toFixed(3)) : null,
  };

  try {
    setSubmitting(true);
    if (editId) {
      await updatePurchase(editId, payload, token);
      toast.success("Purchase updated successfully.");
    } else {
      await createPurchase(payload, token);
      toast.success("Purchase created successfully.");
    }

    setForm({ inventory_item_id: "", quantity: "", unit_price: "" });
    setEditId(null);
    await loadPurchases();
    await loadStocks();
  } catch (err) {
    toast.error(getApiErrorMessage(err, "Failed to save purchase. Please check inputs and try again."));
  } finally {
    setSubmitting(false);
  }
};

  // --- Delete handler ---
  const handleDelete = async () => {
    try {
      await deletePurchase(deleteId, token);
      toast.success("Purchase deleted successfully.");
      setShowDeleteDialog(false);
      setDeleteId(null);
      await loadPurchases();
      await loadStocks();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete purchase."));
    }
  };

  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
      boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
      "&:hover": { borderColor: "hsl(var(--ring))" },
    }),
    menu: (base) => ({ ...base, backgroundColor: "hsl(var(--popover))", color: "hsl(var(--foreground))", zIndex: 50 }),
    singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
    option: (base, { isFocused }) => ({
      ...base,
      backgroundColor: isFocused ? "hsl(var(--accent))" : "hsl(var(--popover))",
      color: "hsl(var(--foreground))",
    }),
  };

  const latestPurchases = purchases.slice(0, 3);

  return (
    <Card className="p-6 w-full dark:bg-gray-900 dark:text-white">
      {/* Tabs */}
      <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
        {["add", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 mr-4 transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-500 font-semibold"
                : "text-gray-500 dark:text-gray-300 hover:text-blue-500"
            }`}
          >
            {tab === "add" ? "Add Purchase" : "Purchase History"}
          </button>
        ))}
      </div>

      {/* Add Purchase */}
      {activeTab === "add" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <ReactSelect
              styles={selectStyles}
              isClearable
              placeholder="Select Inventory Item"
              options={items.map((i) => ({ value: i.id, label: `${i.name} (${getStockQty(i.id)} left)` }))}
              value={
                form.inventory_item_id
                  ? { value: form.inventory_item_id, label: items.find(x => x.id === +form.inventory_item_id)?.name || "" }
                  : null
              }
              onChange={(opt) => setForm({ ...form, inventory_item_id: opt?.value || "" })}
            />

            <Input
              name="quantity"
              type="number"
              step="0.001"
              placeholder="Quantity"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="dark:bg-gray-800 dark:text-white"
            />

            <Input
              name="unit_price"
              type="number"
              step="0.001"
              placeholder="Unit Price"
              value={form.unit_price}
              onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              className="dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
            <p className="text-sm font-medium">
              {selectedItem ? selectedItem.name : "No item selected"}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Current store stock: {currentStockQty}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Stock after this entry: {Number.isFinite(parsedQuantity) ? currentStockQty + parsedQuantity : currentStockQty}
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-blue-600 hover:bg-blue-700 text-white w-fit"
          >
            {submitting ? "Saving..." : editId ? "Update Purchase" : "Create Purchase"}
          </Button>

          {/* Latest 3 purchases */}
          {latestPurchases.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Recent Purchases</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {latestPurchases.map((p) => (
                  <Card key={p.id} className="p-4 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 shadow-sm">
                    <div className="font-medium text-gray-900 dark:text-white">{p.inventory_item_name}</div>
                    <div className="mt-1 text-blue-600 dark:text-blue-400 font-semibold">{p.quantity} units</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">Unit Price: {p.unit_price ?? "-"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatEatDateTime(p.created_at)}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border rounded-lg dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-2 border dark:border-gray-700">#</th>
                <th className="p-2 border dark:border-gray-700">Item</th>
                <th className="p-2 border dark:border-gray-700">Quantity</th>
                <th className="p-2 border dark:border-gray-700">Unit Price</th>
                <th className="p-2 border dark:border-gray-700">Date</th>
                {user?.role === "admin" && <th className="p-2 border dark:border-gray-700">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paginate(purchases, purchasePage).map((p, i) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="p-2 border dark:border-gray-700">{(purchasePage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="p-2 border dark:border-gray-700">{p.inventory_item_name}</td>
                  <td className="p-2 border dark:border-gray-700">{p.quantity}</td>
                  <td className="p-2 border dark:border-gray-700">{p.unit_price ?? "-"}</td>
                  <td className="p-2 border dark:border-gray-700">{formatEatDateTime(p.created_at)}</td>
                  {user?.role === "admin" && (
                    <td className="p-2 border dark:border-gray-700 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditId(p.id);
                          setForm({ inventory_item_id: p.inventory_item_id, quantity: p.quantity, unit_price: p.unit_price });
                          setActiveTab("add");
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setDeleteId(p.id); setShowDeleteDialog(true); }}>
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-3">
            <Button disabled={purchasePage === 1} onClick={() => setPurchasePage(purchasePage - 1)}>Prev</Button>
            <span>Page {purchasePage} of {Math.ceil(purchases.length / PAGE_SIZE) || 1}</span>
            <Button disabled={purchasePage * PAGE_SIZE >= purchases.length} onClick={() => setPurchasePage(purchasePage + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this purchase?</p>
          <DialogFooter className="flex justify-end gap-2">
            <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

