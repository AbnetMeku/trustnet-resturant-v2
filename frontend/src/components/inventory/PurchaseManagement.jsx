import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

import { getMenuItemsByCategory, getMenuItemById } from "@/api/menu_item";
import { getCategories } from "@/api/categories";
import { getPurchases, createPurchase, deletePurchase, updatePurchase } from "@/api/inventory";

import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export default function PurchaseManagement() {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({ menu_item_id: "", quantity: "", unit_price: "" });
  const [editingId, setEditingId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [activeTab, setActiveTab] = useState("add"); // 'add' or 'history'

  // Load categories
  useEffect(() => {
    (async () => {
      try {
        const cats = await getCategories(token);
        setCategories(cats || []);
      } catch {
        toast({ title: "Error", description: "Failed to load categories", variant: "destructive" });
      }
    })();
  }, [token]);

  // Load purchases
  const loadPurchases = async () => {
    try {
      const data = await getPurchases(token);
      const filtered = (data || []).filter(p => p.status !== "Deleted");
      setPurchases(filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch {
      toast({ title: "Error", description: "Failed to load purchases", variant: "destructive" });
    }
  };
  useEffect(() => { loadPurchases(); }, [token]);

  // Fetch menu items when category changes
  useEffect(() => {
    (async () => {
      if (!selectedCategory) { setMenuItems([]); return; }
      setItemsLoading(true);
      try {
        const items = await getMenuItemsByCategory(Number(selectedCategory), token);
        setMenuItems(items || []);
      } catch {
        setMenuItems([]);
        toast({ title: "Error", description: "Failed to load items for category", variant: "destructive" });
      } finally { setItemsLoading(false); }
    })();
  }, [selectedCategory, token]);

  // Submit purchase (add/update)
  const handleSubmit = async () => {
    if (!form.menu_item_id || !form.quantity) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    const payload = {
      menu_item_id: parseInt(form.menu_item_id),
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
      setForm({ menu_item_id: "", quantity: "", unit_price: "" });
      setEditingId(null);
      setSelectedCategory("");
      setMenuItems([]);
      loadPurchases(); // refresh all purchases
    } catch {
      toast({ title: "Error", description: "Failed to save purchase. Try again.", variant: "destructive" });
    }
  };

  // Delete purchase
  const handleDelete = async (id) => {
    try {
      await deletePurchase(id, token);
      toast({ title: "Deleted", description: "Purchase deleted successfully" });
      loadPurchases();
    } catch {
      toast({ title: "Error", description: "Failed to delete purchase.", variant: "destructive" });
    }
  };

  // Edit purchase
  const handleEditClick = async (p) => {
    setEditingId(p.id);
    setForm({
      menu_item_id: p.menu_item_id?.toString() || "",
      quantity: p.quantity?.toString() || "",
      unit_price: p.unit_price?.toString() || "",
    });
    try {
      const item = await getMenuItemById(p.menu_item_id, token);
      if (item?.category_id) setSelectedCategory(item.category_id.toString());
      setActiveTab("add");
    } catch {
      toast({ title: "Error", description: "Failed to fetch menu item details", variant: "destructive" });
    }
  };

  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (user?.role !== "admin") return <div className="p-4 text-red-600">Access denied. Admins only.</div>;

  // SearchableSelect Component
  function SearchableSelect({ items = [], value, onChange, placeholder = "Search...", disabled = false }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const wrapperRef = useRef(null);

    useEffect(() => {
      function onDocClick(e) { if (!wrapperRef.current?.contains(e.target)) setOpen(false); }
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    useEffect(() => setQ(""), [items]);
    const selectedItem = items.find((it) => String(it.id) === String(value));
    const displayValue = selectedItem ? selectedItem.name : q;
    const filtered = items.filter((it) => it.name.toLowerCase().includes(q.trim().toLowerCase()));

    return (
      <div ref={wrapperRef} className="relative">
        <input
          className="border rounded-md p-2 w-full dark:bg-gray-800 dark:text-white dark:border-gray-700"
          placeholder={placeholder}
          value={displayValue}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            if (!disabled) {
              setQ(e.target.value);
              setOpen(true);
              if (selectedItem && e.target.value !== selectedItem.name) onChange("");
            }
          }}
          disabled={disabled}
        />
        {open && !disabled && (
          <ul className="absolute z-50 bg-white dark:bg-gray-900 border rounded-md mt-1 max-h-48 overflow-auto w-full shadow-lg dark:border-gray-700 dark:text-white">
            {filtered.length ? filtered.map((it) => (
              <li
                key={it.id}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                onMouseDown={(ev) => { ev.preventDefault(); onChange(String(it.id)); setOpen(false); setQ(""); }}
              >
                {it.name}
              </li>
            )) : <li className="p-2 text-gray-400 dark:text-gray-500">No items found</li>}
          </ul>
        )}
      </div>
    );
  }

  // last 3 added purchases
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
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setForm({ ...form, menu_item_id: "" }); }}
            className="border rounded-md p-2 dark:bg-gray-800 dark:text-white dark:border-gray-700"
            disabled={!!editingId}
          >
            <option value="">Select Category (optional)</option>
            {categories
            .filter((s) => s.name !== "Food")
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {itemsLoading 
            ? <div className="p-2">Loading items...</div>
            : <SearchableSelect 
                items={menuItems} 
                value={form.menu_item_id} 
                onChange={(val) => setForm({ ...form, menu_item_id: val })} 
                placeholder="Type to search items..." 
                disabled={!!editingId}
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

          {/* Last 3 added purchases */}
          {lastThree.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {lastThree.map((p) => (
                <Card key={p.id} className="p-3 border dark:border-gray-700 dark:bg-gray-800">
                  <p className="font-semibold">{p.menu_item}</p>
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
                  <th className="p-2 border dark:border-gray-700">#</th>
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
                    <td className="p-2 border dark:border-gray-700">{p.menu_item}</td>
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

      {/* Delete Modal */}
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
