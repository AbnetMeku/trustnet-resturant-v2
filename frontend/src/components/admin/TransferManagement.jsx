import React, { useState, useEffect } from "react"; 
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

import {
  getTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getAvailableItems,
} from "@/api/inventory";
import { getStations } from "@/api/stations";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { toast } from "react-hot-toast";

const PAGE_SIZE = 10;

export default function TransferManagement() {
  const { token, user } = useAuth();

  // Tabs
  const [activeTab, setActiveTab] = useState("add");

  // Dropdowns
  const [availableItems, setAvailableItems] = useState([]);
  const [stations, setStations] = useState([]);

  // Data
  const [transfers, setTransfers] = useState([]);

  // Pagination
  const [transferPage, setTransferPage] = useState(1);

  // Dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Form state
  const [transferForm, setTransferForm] = useState({
    menu_item_id: "",
    station_id: "",
    station_name: "",
    quantity: "",
  });
  const [editId, setEditId] = useState(null);

  // Load available items
  const loadAvailableItems = async () => {
    try {
      const items = await getAvailableItems(token);
      setAvailableItems(items);
    } catch {
      toast.error("Failed to load available items");
    }
  };

  // Load stations
  const loadStations = async () => {
    try {
      const s = await getStations(token);
      setStations(s);
    } catch {
      toast.error("Failed to load stations");
    }
  };

  // Load transfers
  const loadTransfers = async () => {
    try {
      const t = await getTransfers(token);
      const sorted = [...t].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setTransfers(sorted);
    } catch {
      toast.error("Failed to load transfers");
    }
  };

  useEffect(() => {
    loadAvailableItems();
    loadStations();
    loadTransfers();
  }, [token]);

  // Handle menu item selection
  const handleMenuItemChange = (e) => {
    const selectedId = parseInt(e.target.value);
    const item = availableItems.find(i => i.menu_item_id === selectedId);
    setTransferForm({
      ...transferForm,
      menu_item_id: selectedId,
      // Optional: default station can come from item
      station_id: item?.station_id || "",
      station_name: item?.station_name || "",
      quantity: "",
    });
  };

  // Handle station selection
  const handleStationChange = (e) => {
    const selectedId = parseInt(e.target.value);
    const station = stations.find(s => s.id === selectedId);
    setTransferForm({
      ...transferForm,
      station_id: selectedId,
      station_name: station?.name || "",
    });
  };

  // Submit transfer
  const handleTransferSubmit = async () => {
    if (!transferForm.menu_item_id || !transferForm.station_id || !transferForm.quantity) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      const payload = {
        menu_item_id: parseInt(transferForm.menu_item_id),
        station_id: parseInt(transferForm.station_id),
        quantity: parseFloat(transferForm.quantity),
      };

      if (editId) {
        await updateTransfer(editId, payload, token);
        toast.success("Transfer updated!");
      } else {
        await createTransfer(payload, token);
        toast.success("Transfer successful!");
      }

      setTransferForm({ menu_item_id: "", station_id: "", station_name: "", quantity: "" });
      setEditId(null);
      await loadTransfers();
      await loadAvailableItems();
    } catch {
      toast.error("Operation failed.");
    }
  };

  // Delete transfer
  const handleDeleteTransfer = async () => {
    try {
      await deleteTransfer(deleteId, token);
      toast.success("Transfer deleted successfully!");
      setShowDeleteDialog(false);
      setDeleteId(null);
      await loadTransfers();
      await loadAvailableItems();
    } catch {
      toast.error("Failed to delete transfer.");
    }
  };

  // Pagination helper
  const paginate = (data, page) =>
    data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Last 3 transfers
  const lastThree = transfers.slice(0, 3);

  return (
    <Card className="p-6 w-full dark:bg-gray-900 dark:text-white">
      {/* Tabs */}
      <div className="flex mb-6 border-b border-gray-700">
        <button
          className={`px-4 py-2 mr-4 ${activeTab === "add" ? "border-b-2 border-blue-500 font-semibold" : "text-gray-400 dark:text-gray-300"}`}
          onClick={() => setActiveTab("add")}
        >
          Add Transfer
        </button>
        <button
          className={`px-4 py-2 ${activeTab === "history" ? "border-b-2 border-blue-500 font-semibold" : "text-gray-400 dark:text-gray-300"}`}
          onClick={() => setActiveTab("history")}
        >
          Transfer History
        </button>
      </div>

      {/* Add Transfer */}
      {activeTab === "add" && (
        <div className="flex flex-col gap-4">
          {/* Menu Item */}
          <select
            value={transferForm.menu_item_id}
            onChange={handleMenuItemChange}
            className="border rounded p-2 dark:bg-gray-800 dark:text-white dark:border-gray-700"
          >
            <option value="">Select Item</option>
            {availableItems.map((item) => (
              <option key={`${item.menu_item_id}-${item.station_id}`} value={item.menu_item_id}>
                {item.menu_item} (Available: {item.available_quantity})
              </option>
            ))}
          </select>

          {/* Station Selection */}
          <select
            value={transferForm.station_id}
            onChange={handleStationChange}
            className="border rounded p-2 dark:bg-gray-800 dark:text-white dark:border-gray-700"
          >
            <option value="">Select Station</option>
            {stations
            .filter((s) => s.name !== "Kitchen")
            .filter((s) => s.name !== "Butcher")
            .map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Quantity */}
          <Input
            placeholder="Quantity"
            value={transferForm.quantity}
            onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
            className="dark:bg-gray-800 dark:text-white"
          />

          {/* Submit */}
          <Button onClick={handleTransferSubmit} className="bg-blue-500 hover:bg-blue-600 text-white">
            {editId ? "Update Transfer" : "Transfer"}
          </Button>

          {/* Last 3 added transfers */}
          {lastThree.length > 0 && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {lastThree.map((t) => (
                <Card key={t.id} className="p-3 border dark:border-gray-700 dark:bg-gray-800">
                  <p className="font-semibold">{t.menu_item}</p>
                  <p>Station: {t.station}</p>
                  <p>Quantity: {t.quantity}</p>
                  <p className="text-sm text-gray-400 dark:text-gray-300">
                    {t.created_at ? new Date(t.created_at).toISOString().split("T")[0] : "-"}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transfer History */}
      {activeTab === "history" && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg shadow-sm dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800 dark:text-white">
                <tr>
                  <th className="p-2 border dark:border-gray-700">#</th>
                  <th className="p-2 border dark:border-gray-700">Item</th>
                  <th className="p-2 border dark:border-gray-700">Station</th>
                  <th className="p-2 border dark:border-gray-700">Quantity</th>
                  <th className="p-2 border dark:border-gray-700">Date</th>
                  {user?.role === "admin" && <th className="p-2 border dark:border-gray-700">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginate(transfers, transferPage).map((t, i) => (
                  <tr key={t.id} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                    <td className="p-2 border dark:border-gray-700">{(transferPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="p-2 border dark:border-gray-700">{t.menu_item}</td>
                    <td className="p-2 border dark:border-gray-700">{t.station}</td>
                    <td className="p-2 border dark:border-gray-700">{t.quantity}</td>
                    <td className="p-2 border dark:border-gray-700">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : "-"}
                    </td>
                    {user?.role === "admin" && (
                      <td className="p-2 border dark:border-gray-700 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const item = availableItems.find(i => i.menu_item === t.menu_item);
                            const station = stations.find(s => s.name === t.station);
                            setEditId(t.id);
                            setTransferForm({
                              menu_item_id: item?.menu_item_id || "",
                              station_id: station?.id || "",
                              station_name: t.station,
                              quantity: t.quantity,
                            });
                            setActiveTab("add");
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setDeleteId(t.id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-3">
            <Button disabled={transferPage === 1} onClick={() => setTransferPage(transferPage - 1)}>Prev</Button>
            <span>Page {transferPage} of {Math.ceil(transfers.length / PAGE_SIZE) || 1}</span>
            <Button disabled={transferPage * PAGE_SIZE >= transfers.length} onClick={() => setTransferPage(transferPage + 1)}>Next</Button>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this transfer?</p>
          <DialogFooter className="flex justify-end gap-2">
            <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTransfer}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
