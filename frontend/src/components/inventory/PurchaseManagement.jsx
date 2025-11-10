import React, { useState, useEffect } from "react";
import Select from "react-select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getInventoryItems } from "@/api/inventory/items";
import { createPurchase, getPurchases, updatePurchase, deletePurchase } from "@/api/inventory/purchases";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export default function PurchaseManagement() {
  const { token, user } = useAuth();

  const [inventoryItems, setInventoryItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({ inventory_item_id: "", quantity: "", unit_price: "" });
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [activeTab, setActiveTab] = useState("add");
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingItems(true);
      try {
        const items = await getInventoryItems(token);
        setInventoryItems(items || []);
      } catch {
        toast({ title: "Error", description: "Failed to load inventory items", variant: "destructive" });
      } finally {
        setLoadingItems(false);
      }
    })();
  }, [token]);

  const loadPurchases = async () => {
    try {
      const data = await getPurchases(token);
      setPurchases((data || []).filter(p => p.status !== "Deleted").sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch {
      toast({ title: "Error", description: "Failed to load purchases", variant: "destructive" });
    }
  };
  useEffect(() => { loadPurchases(); }, [token]);

  const handleSubmit = async () => {
    if (!form.inventory_item_id || !form.quantity) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    const payload = {
      inventory_item_id: parseInt(form.inventory_item_id),
      quantity: parseFloat(form.quantity),
      unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
    };
    try {
      if (editingId) {
        await updatePurchase(editingId, payload, token);
        toast({ title: "Success", description: "Purchase updated successfully" });
      } else {
        await createPurchase(payload, token);
        toast({ title: "Success", description: "Purchase created successfully" });
      }
      setForm({ inventory_item_id: "", quantity: "", unit_price: "" });
      setEditingId(null);
      loadPurchases();
    } catch {
      toast({ title: "Error", description: "Failed to save purchase. Try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePurchase(id, token);
      toast({ title: "Deleted", description: "Purchase deleted successfully" });
      loadPurchases();
    } catch {
      toast({ title: "Error", description: "Failed to delete purchase.", variant: "destructive" });
    }
  };

  const handleEditClick = (p) => {
    setEditingId(p.id);
    setForm({
      inventory_item_id: p.inventory_item_id?.toString() || "",
      quantity: p.quantity?.toString() || "",
      unit_price: p.unit_price?.toString() || "",
    });
    setActiveTab("add");
  };

  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (user?.role !== "admin") return <div className="p-4 text-red-600">Access denied. Admins only.</div>;

  const selectOptions = inventoryItems.map(item => ({ value: item.id, label: item.name }));

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 44,
      borderRadius: 8,
      borderColor: state.isFocused ? "#3b82f6" : "#d1d5db",
      boxShadow: "none",
      "&:hover": { borderColor: "#3b82f6" },
      backgroundColor: user?.darkMode ? "#1f2937" : "#ffffff",
      color: user?.darkMode ? "#ffffff" : "#111827",
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 8,
      backgroundColor: user?.darkMode ? "#1f2937" : "#ffffff",
      color: user?.darkMode ? "#ffffff" : "#111827",
      zIndex: 9999,
    }),
    option: (base, { isFocused }) => ({
      ...base,
      backgroundColor: isFocused ? (user?.darkMode ? "#374151" : "#e5e7eb") : (user?.darkMode ? "#1f2937" : "#ffffff"),
      color: user?.darkMode ? "#ffffff" : "#111827",
      cursor: "pointer",
    }),
    singleValue: (base) => ({ ...base, color: user?.darkMode ? "#ffffff" : "#111827" }),
    placeholder: (base) => ({ ...base, color: user?.darkMode ? "#9ca3af" : "#6b7280" }),
  };

  const lastThree = purchases.slice(0, 3);

  return (
    <Card className="p-6 w-full dark:bg-gray-900 dark:text-white">
      {/* Tabs */}
      <div className="flex mb-6 border-b border-gray-700">
        <button
          className={`px-4 py-2 mr-4 ${activeTab === "add" ? "border-b-2 border-blue-500 font-semibold" : "text-gray-400 dark:text-gray-300"}`}
          onClick={() => setActiveTab("add")}
        >
          Add Purchase
        </button>
        <button
          className={`px-4 py-2 ${activeTab === "history" ? "border-b-2 border-blue-500 font-semibold" : "text-gray-400 dark:text-gray-300"}`}
          onClick={() => setActiveTab("history")}
        >
          Purchase History
        </button>
      </div>

      {/* Add Purchase Tab */}
      {activeTab === "add" && (
        <div className="flex flex-col gap-4">
          {loadingItems
            ? <div>Loading inventory items...</div>
            : <Select
                options={selectOptions}
                value={selectOptions.find(opt => String(opt.value) === String(form.inventory_item_id)) || null}
                onChange={(val) => setForm({ ...form, inventory_item_id: val?.value || "" })}
                placeholder="Select inventory item..."
                styles={selectStyles}
                isClearable
              />
          }

          <Input
            placeholder="Quantity"
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="dark:bg-gray-800 dark:text-white"
          />
          <Input
            placeholder="Unit Price"
            type="number"
            min="0"
            value={form.unit_price}
            onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
            className="dark:bg-gray-800 dark:text-white"
          />

          <Button onClick={handleSubmit} className="bg-blue-500 hover:bg-blue-600 text-white">
            {editingId ? "Update" : "Save"}
          </Button>

          {lastThree.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {lastThree.map((p) => (
                <Card key={p.id} className="p-3 border dark:border-gray-700 dark:bg-gray-800">
                  <p className="font-semibold">{p.inventory_item_name}</p>
                  <p>Quantity: {p.quantity}</p>
                  <p>Unit Price: {p.unit_price ?? "-"}</p>
                  <p className="text-sm text-gray-400 dark:text-gray-300">{p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "-"}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Purchase History Tab */}
      {activeTab === "history" && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg shadow-sm dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white">
                <tr>
                  <th className="p-2 border dark:border-gray-700">No.</th>
                  <th className="p-2 border dark:border-gray-700">Item</th>
                  <th className="p-2 border dark:border-gray-700">Quantity</th>
                  <th className="p-2 border dark:border-gray-700">Unit Price</th>
                  <th className="p-2 border dark:border-gray-700">Date</th>
                  <th className="p-2 border dark:border-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginate(purchases, page).map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                    <td className="p-2 border dark:border-gray-700">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="p-2 border dark:border-gray-700">{p.inventory_item_name}</td>
                    <td className="p-2 border dark:border-gray-700">{p.quantity}</td>
                    <td className="p-2 border dark:border-gray-700">{p.unit_price ?? "-"}</td>
                    <td className="p-2 border dark:border-gray-700">{p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "-"}</td>
                    <td className="p-2 border dark:border-gray-700 space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleEditClick(p)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(p.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-3">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <span>Page {page} of {Math.ceil(purchases.length / PAGE_SIZE) || 1}</span>
            <Button disabled={page * PAGE_SIZE >= purchases.length} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md shadow-md w-80 text-black dark:text-white">
            <h4 className="font-semibold mb-2">Confirm Delete</h4>
            <p className="mb-4">Are you sure you want to delete this purchase?</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { handleDelete(deleteId); setDeleteId(null); }}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
