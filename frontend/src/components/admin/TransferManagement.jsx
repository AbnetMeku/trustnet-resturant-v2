import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

import {
  getStoreStock,
  getTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getStations,
} from "@/api/inventory";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

export default function TransferManagement() {
  const { token, user } = useAuth();

  const [storeItems, setStoreItems] = useState([]);
  const [stations, setStations] = useState([]);
  const [transfers, setTransfers] = useState([]);

  const [page, setPage] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ menu_item_id: "", quantity: "", station_id: "" });
  const [editingId, setEditingId] = useState(null);

  const [deleteId, setDeleteId] = useState(null);
  const [confirmEdit, setConfirmEdit] = useState(false);

  const dialogOpenRef = useRef(false);

  // Load store stock and stations
  useEffect(() => {
    (async () => {
      try {
        const stock = await getStoreStock(token);
        setStoreItems(stock || []);
        const sts = await getStations(token);
        setStations(sts || []);
      } catch {
        toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
      }
    })();
  }, [token]);

  // Load transfers
  const loadTransfers = async () => {
    try {
      const data = await getTransfers(token);
      setTransfers(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch {
      toast({ title: "Error", description: "Failed to load transfers", variant: "destructive" });
    }
  };
  useEffect(() => {
    loadTransfers();
  }, []);

  // Submit (create/update)
  const handleSubmit = async () => {
    if (!form.menu_item_id || !form.quantity || !form.station_id) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingId) {
        await updateTransfer(
          editingId,
          {
            menu_item_id: parseInt(form.menu_item_id),
            quantity: parseFloat(form.quantity),
            station_id: parseInt(form.station_id),
          },
          token
        );
        toast({ title: "Success", description: "Transfer updated successfully" });
      } else {
        await createTransfer(
          {
            menu_item_id: parseInt(form.menu_item_id),
            quantity: parseFloat(form.quantity),
            station_id: parseInt(form.station_id),
          },
          token
        );
        toast({ title: "Success", description: "Transfer created successfully" });
      }
      setForm({ menu_item_id: "", quantity: "", station_id: "" });
      setEditingId(null);
      setShowDialog(false);
      loadTransfers();
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to save transfer. Try again.",
        variant: "destructive",
      });
    }
  };

  // Delete
  const handleDelete = async (id) => {
    try {
      await deleteTransfer(id, token);
      toast({ title: "Deleted", description: "Transfer deleted successfully" });
      loadTransfers();
    } catch {
      toast({ title: "Error", description: "Failed to delete transfer.", variant: "destructive" });
    }
  };

  // Edit click
  const handleEditClick = (t) => {
    setEditingId(t.id);
    setShowDialog(true);
    setForm({
      menu_item_id: t.menu_item_id?.toString() || "",
      quantity: t.quantity?.toString() || "",
      station_id: t.station_id?.toString() || "",
    });
  };

  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (user?.role !== "admin")
    return <div className="p-4 text-red-600">Access denied. Admins only.</div>;

  // Searchable Select
  function SearchableSelect({ items = [], value, onChange, placeholder = "Search..." }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const wrapperRef = useRef(null);
    useEffect(() => {
      function onDocClick(e) {
        if (!wrapperRef.current?.contains(e.target)) setOpen(false);
      }
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);
    useEffect(() => setQ(""), [items]);
    const selectedItem = items.find((it) => String(it.id) === String(value));
    const displayValue = selectedItem ? selectedItem.name : q;
    const filtered = items.filter((it) =>
      it.name.toLowerCase().includes(q.trim().toLowerCase())
    );
    return (
      <div ref={wrapperRef} className="relative">
        <input
          className="border rounded p-2 w-full"
          placeholder={placeholder}
          value={displayValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (selectedItem && e.target.value !== selectedItem.name) onChange("");
          }}
        />
        {open && (
          <ul className="absolute z-50 bg-white border rounded mt-1 max-h-48 overflow-auto w-full shadow">
            {filtered.length ? (
              filtered.map((it) => (
                <li
                  key={it.id}
                  className="p-2 hover:bg-gray-100 cursor-pointer"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    onChange(String(it.id));
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {it.name}
                </li>
              ))
            ) : (
              <li className="p-2 text-gray-500">No items found</li>
            )}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Card className="p-6 w-full">
      <h2 className="text-xl font-bold mb-4">Transfer Management</h2>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Transfers</h3>
        <Button
          onClick={() => {
            setForm({ menu_item_id: "", quantity: "", station_id: "" });
            setEditingId(null);
            setShowDialog(true);
          }}
        >
          + Add Transfer
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
              <th className="p-2 border">Station</th>
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginate(transfers, page).map((t, i) => (
              <tr key={t.id}>
                <td className="p-2 border">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="p-2 border">{t.menu_item}</td>
                <td className="p-2 border">{t.quantity}</td>
                <td className="p-2 border">{t.station}</td>
                <td className="p-2 border">
                  {t.created_at
                    ? new Date(t.created_at).toISOString().split("T")[0]
                    : "-"}
                </td>
                <td className="p-2 border space-x-2">
                  <Button size="sm" variant="outline" onClick={() => handleEditClick(t)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteId(t.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between mt-3">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Prev
        </Button>
        <span>
          Page {page} of {Math.ceil(transfers.length / PAGE_SIZE) || 1}
        </span>
        <Button
          disabled={page * PAGE_SIZE >= transfers.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(v) => {
          setShowDialog(v);
          dialogOpenRef.current = v;
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Transfer" : "Add Transfer"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <SearchableSelect
              items={storeItems}
              value={form.menu_item_id}
              onChange={(val) => setForm({ ...form, menu_item_id: val })}
              placeholder="Select Item from Store"
            />
            <Input
              placeholder="Quantity"
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <select
              value={form.station_id}
              onChange={(e) => setForm({ ...form, station_id: e.target.value })}
              className="border rounded p-2 bg-white dark:bg-gray-800"
            >
              <option value="">Select Station</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <Button
              onClick={() => {
                if (editingId) {
                  setConfirmEdit(true); // confirm before update
                } else {
                  handleSubmit(); // direct add
                }
              }}
            >
              {editingId ? "Update" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p>Are you sure you want to delete this transfer?</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  handleDelete(deleteId);
                  setDeleteId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation */}
      <Dialog
        open={confirmEdit}
        onOpenChange={(v) => {
          if (!v) setConfirmEdit(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Update</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p>Are you sure you want to update this transfer?</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmEdit(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  handleSubmit();
                  setConfirmEdit(false);
                }}
              >
                Update
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
