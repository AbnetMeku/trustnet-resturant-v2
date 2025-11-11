import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getInventoryItems,
  getInventoryLinks,
  createInventoryLinks,
  updateInventoryLink,
  deleteInventoryLink,
} from "@/api/inventory/items";
import { getMenuItems } from "@/api/menu_item";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactSelect from "react-select";

export default function InventoryLinksTab() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  const [selectedMenuItems, setSelectedMenuItems] = useState([]);
  const [deductionQuantity, setDeductionQuantity] = useState(1.0);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const [editLinkModalOpen, setEditLinkModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  // ---------------- Load items, menu items, and links ----------------
  const loadData = async () => {
    try {
      const [i, m] = await Promise.all([
        getInventoryItems(token),
        getMenuItems({}, token),
      ]);
      setItems(i);
      setMenuItems(m);

      const allLinks = [];
      for (const item of i) {
        const data = await getInventoryLinks(item.id, token);
        data.forEach((group) => {
          allLinks.push({
            inventory_item_id: item.id,
            inventory_item_name: item.name,
            deduction_ratio: group.deduction_ratio,
            menu_items: group.menu_items,
            menu_item_ids: group.menu_item_ids,
            ids: group.ids,
          });
        });
      }
      setLinks(allLinks);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // ---------------- Create Link ----------------
  const closeLinkModal = () => {
    setLinkModalOpen(false);
    setSelectedInventoryItem(null);
    setSelectedMenuItems([]);
    setDeductionQuantity(1.0);
  };

  const handleLinkSubmit = async () => {
    if (!selectedInventoryItem || selectedMenuItems.length === 0) return;
    setLinkSubmitting(true);

    try {
      const payload = [
        {
          menu_item_ids: selectedMenuItems,
          deduction_ratio: parseFloat(deductionQuantity) || 1.0,
        },
      ];

      const res = await createInventoryLinks(
        selectedInventoryItem,
        payload,
        token
      );

      if (res.skipped && res.skipped.length > 0) {
        const skippedNames = res.skipped
          .map(
            (s) =>
              menuItems.find((m) => m.id === s.menu_item_id)?.name ||
              s.menu_item_id
          )
          .join(", ");
        toast.error(`Some items already linked: ${skippedNames}`);
      }

      if (res.created && res.created.length > 0) {
        toast.success("Links created successfully");
      }

      loadData();
      closeLinkModal();
    } catch (err) {
      toast.error(err.message || "Failed to create links");
    } finally {
      setLinkSubmitting(false);
    }
  };

  // ---------------- Edit Link ----------------
  const openEditLinkModal = (group) => {
    // Store original deduction ratio to prevent the "needs 2 clicks" issue
    setEditingGroup({
      ...group,
      original_ratio: group.deduction_ratio,
      original_menu_ids: [...group.menu_item_ids],
    });
    setEditLinkModalOpen(true);
  };

  const handleEditLinkSubmit = async () => {
  if (!editingGroup) return;

  try {
    const { deduction_ratio, menu_item_ids: newMenuIds, inventory_item_id , original_ratio } =
      editingGroup;

    const ratio = parseFloat(deduction_ratio);
    // Fetch all existing links for this inventory item
    const currentGroups = await getInventoryLinks(inventory_item_id, token);
    const flatLinks = currentGroups.flatMap((g) => g.menu_items);

    // Check if another group already exists with the same ratio (merge target)
    const mergeTargetGroup = currentGroups.find(
      (g) =>
        g.deduction_ratio === ratio &&
        g.deduction_ratio !== parseFloat(original_ratio)
    );

    if (mergeTargetGroup) {
      // Merge logic
      const mergedMenuIds = Array.from(
        new Set([...mergeTargetGroup.menu_item_ids, ...newMenuIds])
      );

      // Delete all old links for both groups
      const toDelete = [
        ...mergeTargetGroup.ids,
        ...editingGroup.ids,
      ];
      for (const id of toDelete) {
        await deleteInventoryLink(id, token);
      }

      // Recreate a single merged group
      await createInventoryLinks(
        inventory_item_id,
        [
          {
            menu_item_ids: mergedMenuIds,
            deduction_ratio: ratio,
          },
        ],
        token
      );

      toast.success("Groups merged successfully!");
    } else {
      // Normal update path
      const currentMenuIds = flatLinks.map((l) => l.menu_item_id);
      const toAdd = newMenuIds.filter((id) => !currentMenuIds.includes(id));
      const toRemove = currentMenuIds.filter((id) => !newMenuIds.includes(id));
      const toUpdate = flatLinks.filter((l) => newMenuIds.includes(l.menu_item_id));

      for (const link of toUpdate) {
        await updateInventoryLink(
          link.id,
          {
            deduction_ratio: ratio,
            menu_item_id: link.menu_item_id,
            inventory_item_id,
          },
          token
        );
      }

      if (toAdd.length > 0) {
        await createInventoryLinks(
          inventory_item_id,
          [
            {
              menu_item_ids: toAdd,
              deduction_ratio: ratio,
            },
          ],
          token
        );
      }

      if (toRemove.length > 0) {
        const linksToDelete = flatLinks.filter((l) => toRemove.includes(l.menu_item_id));
        for (const link of linksToDelete) {
          await deleteInventoryLink(link.id, token);
        }
      }

      toast.success("Links updated successfully!");
    }
      setEditLinkModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update links");
    }
  };

  // ---------------- Delete Link ----------------
  const handleLinkDelete = async (group) => {
    try {
      for (const id of group.ids) {
        await deleteInventoryLink(id, token);
      }
      toast.success("Links deleted successfully");
      loadData();
    } catch {
      toast.error("Failed to delete links");
    }
  };
  // ---------------- Helpers ----------------
  const allLinkedMenuIds = links.flatMap((l) => l.menu_item_ids);

  // ---------------- Render ----------------
  return (
    <div className="flex flex-col gap-4">
      {/* Header Actions */}
      <div className="flex justify-end">
        <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold">+ Link Menu Items</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Link Menu Items to Inventory</DialogTitle>
              <DialogDescription>
                Select an inventory item, menu items, and set deduction quantity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {/* Inventory Selection */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Inventory Item
                </label>
                <Select
                  value={selectedInventoryItem}
                  onValueChange={setSelectedInventoryItem}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an inventory item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Menu Items Multi Select */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Menu Items
                </label>
                <ReactSelect
                  isMulti
                  options={menuItems
                    .filter((m) => !allLinkedMenuIds.includes(m.id))
                    .map((m) => ({ value: m.id, label: m.name }))}
                  value={selectedMenuItems
                    .map((id) => {
                      const menuItem = menuItems.find((m) => m.id === id);
                      return menuItem
                        ? { value: menuItem.id, label: menuItem.name }
                        : null;
                    })
                    .filter(Boolean)}
                  onChange={(selected) =>
                    setSelectedMenuItems(selected.map((s) => s.value))
                  }
                />
              </div>

              {/* Deduction Quantity */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Deduction Quantity (applied to all selected)
                </label>
                <Input
                  type="number"
                  step="any"
                  value={deductionQuantity}
                  onChange={(e) => setDeductionQuantity(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={closeLinkModal}
                disabled={linkSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleLinkSubmit} disabled={linkSubmitting}>
                {linkSubmitting ? "Linking..." : "Link Selected"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ---------------- Edit Modal ---------------- */}
      <Dialog open={editLinkModalOpen} onOpenChange={setEditLinkModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Link</DialogTitle>
            <DialogDescription>
              Update menu items or deduction quantity for this inventory item.
            </DialogDescription>
          </DialogHeader>
          {editingGroup && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Inventory Item
                </label>
                <Select value={editingGroup.inventory_item_id} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Menu Items
                </label>
                <ReactSelect
                  isMulti
                  options={menuItems
                    .filter(
                      (m) =>
                        editingGroup.menu_item_ids.includes(m.id) ||
                        !allLinkedMenuIds.includes(m.id)
                    )
                    .map((m) => ({ value: m.id, label: m.name }))}
                  value={editingGroup.menu_item_ids
                    .map((id) => {
                      const menuItem = menuItems.find((m) => m.id === id);
                      return menuItem ? { value: menuItem.id, label: menuItem.name } : null;
                    })
                    .filter(Boolean)}
                  onChange={(selected) =>
                    setEditingGroup({
                      ...editingGroup,
                      menu_item_ids: selected.map((s) => s.value),
                      menu_items: selected.map((s) => ({
                        menu_item_id: s.value,
                        menu_item_name: s.label,
                      })),
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Deduction Quantity
                </label>
                <Input
                  type="number"
                  step="any"
                  value={editingGroup.deduction_ratio}
                  onChange={(e) =>
                    setEditingGroup({
                      ...editingGroup,
                      deduction_ratio: e.target.value,
                    })
                  }
                  className="w-32"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditLinkModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditLinkSubmit}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Table ---------------- */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-muted-foreground">
                <th className="px-4 py-2 text-left">Inventory Item</th>
                <th className="px-4 py-2 text-left">Menu Items</th>
                <th className="px-4 py-2 text-left">Deduction Ratio</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingLinks ? (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center py-4 text-muted-foreground"
                  >
                    Loading...
                  </td>
                </tr>
              ) : links.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center py-4 text-muted-foreground"
                  >
                    No links found
                  </td>
                </tr>
              ) : (
                links.map((group) => (
                  <tr
                    key={group.inventory_item_id + "-" + group.deduction_ratio}
                    className="border-b hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-2">{group.inventory_item_name}</td>
                    <td className="px-4 py-2">
                      {group.menu_items
                        .map((m) => m.menu_item_name)
                        .join(", ")}
                    </td>
                    <td className="px-4 py-2">{group.deduction_ratio}</td>
                    <td className="px-4 py-2 space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditLinkModal(group)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleLinkDelete(group)}
                      >
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
    </div>
  );
}
