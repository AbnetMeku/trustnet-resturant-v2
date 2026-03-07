import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/api/inventory/items";
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
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryItemsTab() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: "",
    unit: "Bottle",
    container_size_ml: 750,
    default_shot_ml: 50,
    is_active: true,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const data = await getInventoryItems(token);
      setItems(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load inventory items."));
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [token]);

  const openItemModal = (item = null) => {
    setErrors({});
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        unit: item.unit,
        container_size_ml: item.container_size_ml || 750,
        default_shot_ml: item.default_shot_ml || 50,
        is_active: item.is_active,
      });
    } else {
      setEditingItem(null);
      setForm({
        name: "",
        unit: "Bottle",
        container_size_ml: 750,
        default_shot_ml: 50,
        is_active: true,
      });
    }
    setModalOpen(true);
  };

  const closeItemModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingItem(null);
    setForm({
      name: "",
      unit: "Bottle",
      container_size_ml: 750,
      default_shot_ml: 50,
      is_active: true,
    });
    setErrors({});
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Item name is required";
    if (!form.unit.trim()) e.unit = "Stock unit is required";
    if (Number(form.container_size_ml) <= 0) e.container_size_ml = "Must be greater than zero";
    if (Number(form.default_shot_ml) <= 0) e.default_shot_ml = "Must be greater than zero";
    if (Number(form.default_shot_ml) > Number(form.container_size_ml)) {
      e.default_shot_ml = "Cannot be greater than bottle size";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      ...form,
      container_size_ml: Number(form.container_size_ml),
      default_shot_ml: Number(form.default_shot_ml),
    };

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, payload, token);
        toast.success("Item updated successfully");
      } else {
        await createInventoryItem(payload, token);
        toast.success("Item created successfully");
      }
      closeItemModal();
      loadItems();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save inventory item."));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id) => setDeleteId(id);
  const cancelDelete = () => (!deleting ? setDeleteId(null) : null);

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteInventoryItem(deleteId, token);
      toast.success("Item deleted successfully");
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete inventory item."));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Unit</label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className={errors.unit ? "ring-2 ring-destructive" : ""}
                    disabled={submitting}
                  />
                  {errors.unit && <p className="mt-1 text-xs text-destructive">{errors.unit}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Bottle Size (ml)</label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={form.container_size_ml}
                    onChange={(e) => setForm((f) => ({ ...f, container_size_ml: e.target.value }))}
                    className={errors.container_size_ml ? "ring-2 ring-destructive" : ""}
                    disabled={submitting}
                  />
                  {errors.container_size_ml && (
                    <p className="mt-1 text-xs text-destructive">{errors.container_size_ml}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Default Shot Size (ml)</label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.default_shot_ml}
                  onChange={(e) => setForm((f) => ({ ...f, default_shot_ml: e.target.value }))}
                  className={errors.default_shot_ml ? "ring-2 ring-destructive" : ""}
                  disabled={submitting}
                />
                {errors.default_shot_ml && (
                  <p className="mt-1 text-xs text-destructive">{errors.default_shot_ml}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Example: 750ml bottle with 50ml shots gives 15 default shots per bottle.
                </p>
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
                  {submitting
                    ? editingItem
                      ? "Updating..."
                      : "Registering..."
                    : editingItem
                    ? "Update Item"
                    : "Register Item"}
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
                <th className="px-4 py-3 font-medium">No.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Stock Unit</th>
                <th className="px-4 py-3 font-medium">Bottle ml</th>
                <th className="px-4 py-3 font-medium">Shot ml</th>
                <th className="px-4 py-3 font-medium">Shots/Bottle</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    Loading items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No items found.
                  </td>
                </tr>
              ) : (
                items.map((i, idx) => (
                  <tr key={i.id} className="border-b last:border-b-0 hover:bg-muted/60 transition-colors">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">{i.name}</td>
                    <td className="px-4 py-3">{i.unit}</td>
                    <td className="px-4 py-3">{i.container_size_ml ?? "-"}</td>
                    <td className="px-4 py-3">{i.default_shot_ml ?? "-"}</td>
                    <td className="px-4 py-3">
                      {i.container_size_ml && i.default_shot_ml
                        ? (Number(i.container_size_ml) / Number(i.default_shot_ml)).toFixed(2)
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{i.is_active ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openItemModal(i)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => confirmDelete(i.id)}>
                        Delete
                      </Button>
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
    </div>
  );
}
