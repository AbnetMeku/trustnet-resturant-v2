import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

import { getMenuItemsByCategory, getMenuItemById } from "@/api/menu_item";
import { getCategories } from "@/api/categories";
import { getPurchases, createPurchase, deletePurchase, updatePurchase } from "@/api/inventory";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export default function PurchaseManagement() {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [page, setPage] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ menu_item_id: "", quantity: "", unit_price: "" });
  const [editingId, setEditingId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const dialogOpenRef = useRef(false);

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
      setShowDialog(false);
      loadPurchases();
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
    setShowDialog(true);
    setForm({
      menu_item_id: p.menu_item_id?.toString() || "",
      quantity: p.quantity?.toString() || "",
      unit_price: p.unit_price?.toString() || "",
    });
    try {
      const item = await getMenuItemById(p.menu_item_id, token);
      if (item?.category_id) setSelectedCategory(item.category_id.toString());
    } catch {
      toast({ title: "Error", description: "Failed to fetch menu item details", variant: "destructive" });
    }
  };

  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (user?.role !== "admin") return <div className="p-4 text-red-600">Access denied. Admins only.</div>;

  // Searchable Select component
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
        className="border rounded p-2 w-full"
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
        disabled={disabled} // ✅ properly disable typing
      />
      {open && !disabled && (
        <ul className="absolute z-50 bg-white border rounded mt-1 max-h-48 overflow-auto w-full shadow">
          {filtered.length ? filtered.map((it) => (
            <li
              key={it.id}
              className="p-2 hover:bg-gray-100 cursor-pointer"
              onMouseDown={(ev) => { ev.preventDefault(); onChange(String(it.id)); setOpen(false); setQ(""); }}
            >
              {it.name}
            </li>
          )) : <li className="p-2 text-gray-500">No items found</li>}
        </ul>
      )}
    </div>
  );
}

  return (
    <Card className="p-6 w-full">
      {/* <h2 className="text-xl font-bold mb-4">Purchase Management</h2> */}

      <div className="flex justify-between items-center mb-4">
        {/* <h3 className="font-semibold">Purchases</h3> */}
        <Button onClick={() => { setForm({ menu_item_id: "", quantity: "", unit_price: "" }); setEditingId(null); setSelectedCategory(""); setMenuItems([]); setShowDialog(true); }}>
          + Add Purchase
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className="p-2 border">#</th>
              <th className="p-2 border">Item</th>
              <th className="p-2 border">Quantity</th>
              <th className="p-2 border">Unit Price</th>
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(purchases, page).map((p, i) => (
              <tr key={p.id}>
                <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="p-2 border">{p.menu_item}</td>
                <td className="p-2 border">{p.quantity}</td>
                <td className="p-2 border">{p.unit_price ?? "-"}</td>
                <td className="p-2 border">{p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "-"}</td>
                <td className="p-2 border space-x-2">
                  <Button size="sm" variant="outline" onClick={() => handleEditClick(p)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleteId(p.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between mt-3">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
        <span>Page {page} of {Math.ceil(purchases.length / PAGE_SIZE) || 1}</span>
        <Button disabled={page * PAGE_SIZE >= purchases.length} onClick={() => setPage(page + 1)}>Next</Button>
      </div>

{/* Add/Edit Dialog */}
<Dialog open={showDialog} onOpenChange={(v) => { setShowDialog(v); dialogOpenRef.current = v; }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editingId ? "Edit Purchase" : "Add Purchase"}</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-3">
      <select
        value={selectedCategory}
        onChange={(e) => { setSelectedCategory(e.target.value); setForm({ ...form, menu_item_id: "" }); }}
        className="border rounded p-2 bg-white dark:bg-gray-800"
        disabled={!!editingId} // ✅ disable category dropdown when editing
      >
        <option value="">Select Category (optional)</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {itemsLoading 
        ? <div className="p-2">Loading items...</div>
        : <SearchableSelect 
            items={menuItems} 
            value={form.menu_item_id} 
            onChange={(val) => setForm({ ...form, menu_item_id: val })} 
            placeholder="Type to search items..." 
            disabled={!!editingId} // ✅ disable searchable input when editing
          />
      }

      <Input 
        placeholder="Quantity" 
        type="number" 
        min="1" 
        value={form.quantity} 
        onChange={(e) => setForm({ ...form, quantity: e.target.value })} 
      />
      <Input 
        placeholder="Unit Price" 
        type="number" 
        min="0" 
        value={form.unit_price} 
        onChange={(e) => setForm({ ...form, unit_price: e.target.value })} 
      />

      <Button onClick={() => editingId ? setConfirmEdit(true) : handleSubmit()}>
        {editingId ? "Update" : "Save"}
      </Button>
    </div>
  </DialogContent>
</Dialog>



      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <p>Are you sure you want to delete this purchase?</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { handleDelete(deleteId); setDeleteId(null); }}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog open={confirmEdit} onOpenChange={(v) => { if (!v) setConfirmEdit(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Update</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <p>Are you sure you want to update this purchase?</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmEdit(false)}>Cancel</Button>
              <Button onClick={() => { handleSubmit(); setConfirmEdit(false); }}>Update</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
