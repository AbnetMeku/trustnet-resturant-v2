import React, { useEffect, useState } from "react";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryLinks,
  createInventoryLinks,
  updateInventoryLink,
  deleteInventoryLink,
} from "@/api/inventory/items";
import { getMenuItems } from "@/api/menu_item";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Confirm dialog
function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryItemManagement() {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState("inventory");

  // Inventory States
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "Bottle", is_active: true });
  const [errors, setErrors] = useState({});

  // Links States
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [deductionRatio, setDeductionRatio] = useState(1.0);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  // --- Load inventory and menu items ---
  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const data = await getInventoryItems(token);
      setItems(data);
    } catch (err) {
      toast.error(err.message || "Failed to load items");
    } finally {
      setLoadingItems(false);
    }
  };

  const loadMenuItems = async () => {
    try {
      const data = await getMenuItems({}, token);
      setMenuItems(data);
    } catch (err) {
      toast.error(err.message || "Failed to load menu items");
    }
  };

  const loadAllLinks = async () => {
    setLoadingLinks(true);
    try {
      const allLinks = [];
      for (const item of items) {
        const data = await getInventoryLinks(item.id, token);
        allLinks.push(...data.map(l => ({ ...l, inventory_item_name: item.name })));
      }
      setLinks(allLinks);
    } catch (err) {
      toast.error(err.message || "Failed to load links");
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    loadItems();
    loadMenuItems();
  }, [token]);

  useEffect(() => {
    if (!loadingItems && items.length > 0) {
      loadAllLinks();
    }
  }, [loadingItems, items]);

  // --- Inventory Item Modal ---
  const openItemModal = (item = null) => {
    setErrors({});
    if (item) {
      setEditingItem(item);
      setForm({ name: item.name || "", unit: item.unit || "Bottle", is_active: item.is_active });
    } else {
      setEditingItem(null);
      setForm({ name: "", unit: "Bottle", is_active: true });
    }
    setModalOpen(true);
  };

  const closeItemModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingItem(null);
    setForm({ name: "", unit: "Bottle", is_active: true });
    setErrors({});
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Item name is required";
    if (!form.unit.trim()) e.unit = "Unit is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, form, token);
        toast.success("Item updated successfully");
      } else {
        await createInventoryItem(form, token);
        toast.success("Item created successfully");
      }
      closeItemModal();
      loadItems();
    } catch (err) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Delete ---
  const confirmDelete = (id) => setDeleteId(id);
  const cancelDelete = () => (!deleting ? setDeleteId(null) : null);
  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(deleteId, token);
      toast.success("Item deleted successfully");
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      loadAllLinks(); // reload links in case any linked to deleted item
    } catch (err) {
      toast.error(err.message || "Failed to delete item");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // --- Link Modal Handlers ---
  const openLinkModal = () => {
    setSelectedMenuItems([]);
    setDeductionRatio(1.0);
    setLinkModalOpen(true);
  };

  const closeLinkModal = () => setLinkModalOpen(false);

  const handleLinkSubmit = async () => {
    if (!selectedInventoryItem || selectedMenuItems.length === 0) return;
    setLinkSubmitting(true);
    try {
      const linksPayload = selectedMenuItems.map((id) => ({ menu_item_id: id, deduction_ratio: deductionRatio }));
      await createInventoryLinks(selectedInventoryItem, linksPayload, token);
      toast.success("Links created successfully");
      loadAllLinks();
      closeLinkModal();
    } catch (err) {
      toast.error(err.message || "Failed to create links");
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleLinkDelete = async (linkId) => {
    try {
      await deleteInventoryLink(linkId, token);
      toast.success("Link deleted successfully");
      loadAllLinks();
    } catch (err) {
      toast.error(err.message || "Failed to delete link");
    }
  };

  const handleLinkUpdate = async (linkId, newRatio) => {
    if (isNaN(newRatio)) return;
    try {
      await updateInventoryLink(linkId, { deduction_ratio: newRatio }, token);
      toast.success("Link updated successfully");
      loadAllLinks();
    } catch (err) {
      toast.error(err.message || "Failed to update link");
    }
  };

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inventory">Inventory Items</TabsTrigger>
          <TabsTrigger value="links">Link Menu Items</TabsTrigger>
        </TabsList>

        {/* Inventory Tab */}
        <TabsContent value="inventory">
          <div className="flex justify-end mb-2">
            <Dialog open={modalOpen} onOpenChange={(v) => (v ? openItemModal() : closeItemModal())}>
              <DialogTrigger asChild>
                <Button onClick={() => openItemModal()}>+ Register Item</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Edit Item" : "Register Item"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className={errors.name ? "ring-2 ring-destructive" : ""}
                      disabled={submitting}
                    />
                    {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <Input
                      value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      className={errors.unit ? "ring-2 ring-destructive" : ""}
                    />
                    {errors.unit && <p className="mt-1 text-xs text-destructive">{errors.unit}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.is_active}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: !!v }))}
                    />
                    <span className="text-sm">Active</span>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={closeItemModal} disabled={submitting}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (editingItem ? "Updating..." : "Registering...") : editingItem ? "Update Item" : "Register Item"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left">
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading items…</td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No items found.</td>
                    </tr>
                  ) : (
                    items.map((i) => (
                      <tr key={i.id} className="border-b last:border-b-0 hover:bg-muted/60 transition-colors">
                        <td className="px-4 py-3">{i.id}</td>
                        <td className="px-4 py-3">{i.name}</td>
                        <td className="px-4 py-3">{i.unit}</td>
                        <td className="px-4 py-3">{i.is_active ? "Yes" : "No"}</td>
                        <td className="px-4 py-3 text-right flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openItemModal(i)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => confirmDelete(i.id)}>Delete</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <ConfirmDialog
            open={!!deleteId}
            title="Delete item?"
            description="This action cannot be undone. The item will be permanently removed."
            onConfirm={doDelete}
            onCancel={cancelDelete}
            loading={deleting}
          />
        </TabsContent>

        {/* Links Tab */}
        <TabsContent value="links">
          <div className="flex flex-col gap-4">
            {/* Modal for linking menu items */}
            <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
              <DialogTrigger asChild>
                <Button disabled={items.length === 0}>+ Link Menu Items</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Link Menu Items to Inventory</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Select Inventory Item</label>
                    <Select
                      value={selectedInventoryItem}
                      onValueChange={(v) => setSelectedInventoryItem(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an inventory item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((i, idx) => (
                          <SelectItem key={i.id} value={i.id}>
                            {idx + 1}. {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Menu Items</label>
                    <div className="max-h-60 overflow-y-auto border p-2 rounded">
                      {menuItems.map((m, idx) => (
                        <div key={m.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={selectedMenuItems.includes(m.id)}
                            onCheckedChange={(v) =>
                              setSelectedMenuItems((prev) =>
                                v ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                              )
                            }
                          />
                          <span>{idx + 1}. {m.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Deduction Ratio</label>
                    <Input
                      type="number"
                      step={0.01}
                      value={isNaN(deductionRatio) ? "" : deductionRatio}
                      onChange={(e) => setDeductionRatio(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={closeLinkModal} disabled={linkSubmitting}>
                    Cancel
                  </Button>
                  <Button onClick={handleLinkSubmit} disabled={linkSubmitting || !selectedInventoryItem}>
                    {linkSubmitting ? "Linking..." : "Link Selected Items"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

           {/* Links Table */}
<Card className="overflow-hidden">
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="bg-muted/60 text-left">
          <th className="px-4 py-3 font-medium">Inventory Item</th>
          <th className="px-4 py-3 font-medium">Menu Items</th>
          <th className="px-4 py-3 font-medium">Deduction Ratio</th>
          <th className="px-4 py-3 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {loadingLinks ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
              Loading links…
            </td>
          </tr>
        ) : links.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
              No links found.
            </td>
          </tr>
        ) : (
          links.map((l, index) => {
            // Map menu_item_ids to names using menuItems list
            const menuNames = l.menu_item_ids
              .map((id) => menuItems.find((m) => m.id === id)?.name)
              .filter(Boolean)
              .join(", ");

            return (
              <tr key={index} className="border-b last:border-b-0 hover:bg-muted/60 transition-colors">
                <td className="px-4 py-3">{l.inventory_item_name}</td>
                <td className="px-4 py-3">{menuNames}</td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    step={0.01}
                    value={isNaN(l.deduction_ratio) ? "" : l.deduction_ratio}
                    onBlur={(e) => {
                      const newVal = parseFloat(e.target.value);
                      if (!isNaN(newVal)) handleLinkUpdate(l.id, newVal);
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-right flex justify-end gap-2">
                  <Button size="sm" variant="destructive" onClick={() => handleLinkDelete(l.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
</Card>

          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
