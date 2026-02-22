import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTables, createTable, updateTable, deleteTable } from "@/api/tables";
import { getUsers } from "@/api/users";
import { FaPlus, FaTrash, FaEdit, FaTimes } from "react-icons/fa";
import { toast } from "react-hot-toast";

export default function TableManagement() {
  const [tables, setTables] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentTable, setCurrentTable] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [filters, setFilters] = useState({ waiterId: "", isVip: "" });
  const [formData, setFormData] = useState({
    number: "",
    status: "available",
    is_vip: false,
    waiter_ids: [],
  });

  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getTables();
      setTables(data);
    } catch (err) {
      toast.error("Failed to fetch tables");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaiters = async () => {
    try {
      const data = await getUsers("waiter");
      setWaiters(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTables();
    fetchWaiters();
  }, []);

  const openModal = (table = null) => {
    if (table) {
      setCurrentTable(table);
      setFormData({
        number: table.number,
        status: table.status,
        is_vip: table.is_vip,
        waiter_ids: table.waiters.map((w) => w.id),
      });
    } else {
      setCurrentTable(null);
      setFormData({ number: "", status: "available", is_vip: false, waiter_ids: [] });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentTable(null);
    setFormData({ number: "", status: "available", is_vip: false, waiter_ids: [] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.number.trim()) {
      toast.error("Table number is required");
      return;
    }

    try {
      if (currentTable) {
        await updateTable(currentTable.id, formData);
        toast.success("Table updated successfully");
      } else {
        await createTable(formData);
        toast.success("Table created successfully");
      }
      await fetchTables();
      closeModal();
    } catch (err) {
      toast.error("Failed to save table");
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTable(id);
      toast.success("Table deleted");
      await fetchTables();
      setDeleteConfirmId(null);
    } catch {
      toast.error("Failed to delete table");
    }
  };

  const removeWaiterTag = (id) => {
    setFormData((prev) => ({
      ...prev,
      waiter_ids: prev.waiter_ids.filter((wid) => wid !== id),
    }));
  };

  const filteredTables = useMemo(
    () =>
      tables
        .filter((t) => {
          if (filters.waiterId && !t.waiters.find((w) => w.id === parseInt(filters.waiterId, 10))) return false;
          if (filters.isVip === "true" && !t.is_vip) return false;
          if (filters.isVip === "false" && t.is_vip) return false;
          return true;
        })
        .sort((a, b) => a.number - b.number),
    [tables, filters]
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Tables</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage table status, VIP flag, and waiter assignment.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <select
              value={filters.waiterId}
              onChange={(e) => setFilters((prev) => ({ ...prev, waiterId: e.target.value }))}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="">All Waiters</option>
              {waiters.map((w) => (
                <option key={w.id} value={w.id}>{w.username}</option>
              ))}
            </select>
            <select
              value={filters.isVip}
              onChange={(e) => setFilters((prev) => ({ ...prev, isVip: e.target.value }))}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="">All Tables</option>
              <option value="true">VIP Only</option>
              <option value="false">Non-VIP</option>
            </select>
            <Button onClick={() => openModal()}><FaPlus className="mr-2" />Add Table</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">Loading tables...</Card>
      ) : filteredTables.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-800">No tables found for current filters.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables.map((table) => (
            <Card key={table.id} className="relative border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
              {table.is_vip && (
                <div className="absolute top-2 left-2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 text-[10px] font-semibold px-2 py-1">
                  VIP
                </div>
              )}
              <div
                className={`absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-semibold capitalize text-white ${
                  table.status === "available" ? "bg-emerald-600" : table.status === "occupied" ? "bg-red-600" : "bg-amber-600"
                }`}
              >
                {table.status}
              </div>

              <CardHeader className="pb-2 pt-8">
                <CardTitle className="text-lg">Table {table.number}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Assigned Waiters</p>
                <div className="flex flex-wrap gap-1">
                  {table.waiters.length ? (
                    table.waiters.map((w) => (
                      <span key={w.id} className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs">
                        {w.username}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">None</span>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openModal(table)}>
                    <FaEdit className="mr-1" /> Edit
                  </Button>
                  {deleteConfirmId === table.id ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(table.id)}>Confirm</Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmId(table.id)}>
                      <FaTrash className="mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-5 border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold mb-4">{currentTable ? "Edit Table" : "Add Table"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Table Number</Label>
                <Input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, number: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_vip}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_vip: e.target.checked }))}
                  className="accent-slate-900 dark:accent-slate-200"
                />
                VIP Table
              </label>

              <div>
                <Label>Assign Waiters</Label>
                <div className="flex flex-wrap gap-1 mt-2 mb-2">
                  {formData.waiter_ids.map((id) => {
                    const waiter = waiters.find((w) => w.id === id);
                    return waiter ? (
                      <span key={id} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full flex items-center gap-1 text-xs">
                        {waiter.username}
                        <FaTimes className="cursor-pointer" onClick={() => removeWaiterTag(id)} />
                      </span>
                    ) : null;
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!Number.isNaN(val) && !formData.waiter_ids.includes(val)) {
                      setFormData((prev) => ({ ...prev, waiter_ids: [...prev.waiter_ids, val] }));
                    }
                  }}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
                >
                  <option value="">Add Waiter</option>
                  {waiters.map((w) => !formData.waiter_ids.includes(w.id) && (
                    <option key={w.id} value={w.id}>{w.username}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                <Button type="submit">{currentTable ? "Update" : "Create"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
