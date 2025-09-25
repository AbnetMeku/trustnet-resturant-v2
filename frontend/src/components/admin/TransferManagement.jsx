import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState("transfers");

  // Dropdowns
  const [availableItems, setAvailableItems] = useState([]);
  const [stations, setStations] = useState([]);

  // Data
  const [transfers, setTransfers] = useState([]);

  // Pagination
  const [transferPage, setTransferPage] = useState(1);

  // Dialog state
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Form state
  const [transferForm, setTransferForm] = useState({
    menu_item_id: "",
    station_id: "",
    quantity: "",
  });
  const [editId, setEditId] = useState(null); // track editing

  // Load available items
  const loadAvailableItems = async () => {
    try {
      const items = await getAvailableItems(token);
      setAvailableItems(items);
    } catch (err) {
      toast.error("Failed to load available items");
      console.error(err);
    }
  };

  // Load stations
  const loadStations = async () => {
    try {
      const s = await getStations(token);
      setStations(s);
    } catch (err) {
      toast.error("Failed to load stations");
      console.error(err);
    }
  };

  // Load transfers
  const loadTransfers = async () => {
    try {
      const t = await getTransfers(token);
      setTransfers(t);
    } catch (err) {
      toast.error("Failed to load transfers");
      console.error(err);
    }
  };

  // Initial load
  useEffect(() => {
    loadAvailableItems();
    loadStations();
    loadTransfers();
  }, [token]);

  // Handle transfer submit (create or update)
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

      setTransferForm({ menu_item_id: "", station_id: "", quantity: "" });
      setEditId(null);
      setShowTransferDialog(false);

      // Refresh both transfers and available items
      await loadTransfers();
      await loadAvailableItems();
    } catch (err) {
      toast.error(err.message || "Operation failed.");
      console.error(err);
    }
  };

  // Handle delete
  const handleDeleteTransfer = async () => {
    try {
      await deleteTransfer(deleteId, token);
      toast.success("Transfer deleted successfully!");
      setShowDeleteDialog(false);
      setDeleteId(null);

      // Refresh both transfers and available items
      await loadTransfers();
      await loadAvailableItems();
    } catch (err) {
      toast.error("Failed to delete transfer.");
      console.error(err);
    }
  };

  // Pagination helper
  const paginate = (data, page) => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card className="p-6 w-full">
      {/* <h2 className="text-xl font-bold mb-4">Transfers</h2> */}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* <TabsList>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList> */}

        <TabsContent value="transfers">
          <div className="flex justify-between items-center mb-4">
            {/* <h3 className="font-semibold">Transfers</h3> */}
            <Button
              onClick={() => {
                setTransferForm({ menu_item_id: "", station_id: "", quantity: "" });
                setEditId(null);
                setShowTransferDialog(true);
              }}
            >
              + Transfer Item
            </Button>
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
                  {user?.role === "admin" && <th className="p-2 border">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginate(transfers, transferPage).map((t, i) => (
                  <tr key={t.id}>
                    <td className="p-2 border">{(transferPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="p-2 border">{t.menu_item}</td>
                    <td className="p-2 border">{t.station}</td>
                    <td className="p-2 border">{t.quantity}</td>
                    <td className="p-2 border">{t.created_at?.split("T")[0] ?? "-"}</td>
                    {user?.role === "admin" && (
                      <td className="p-2 border flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(t.id);
                            setTransferForm({
                              menu_item_id: t.menu_item_id,
                              station_id: t.station_id,
                              quantity: t.quantity,
                            });
                            setShowTransferDialog(true);
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
            <Button
              disabled={transferPage === 1}
              onClick={() => setTransferPage(transferPage - 1)}
            >
              Prev
            </Button>
            <span>
              Page {transferPage} of {Math.ceil(transfers.length / PAGE_SIZE) || 1}
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

{/* Transfer Dialog */}
<Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{editId ? "Edit Transfer" : "Transfer Item"}</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-3">
      <select
        value={transferForm.menu_item_id}
        onChange={(e) =>
          setTransferForm({ ...transferForm, menu_item_id: e.target.value })
        }
        className="border rounded p-2 bg-white dark:bg-gray-800"
        disabled={!!editId} // ✅ disable if editing
      >
        <option value="">Select Item</option>
        {availableItems.map((item) => (
          <option key={item.menu_item_id} value={item.menu_item_id}>
            {item.menu_item} (Available: {item.available_quantity})
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

      <Button onClick={handleTransferSubmit}>
        {editId ? "Update Transfer" : "Transfer"}
      </Button>
    </div>
  </DialogContent>
</Dialog>


      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this transfer?</p>
          <DialogFooter className="flex justify-end gap-2">
            <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTransfer}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
