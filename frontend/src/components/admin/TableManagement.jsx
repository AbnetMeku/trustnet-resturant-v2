// TableManagement.jsx
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    }
    setLoading(false);
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
        waiter_ids: table.waiters.map(w => w.id),
      });
    } else {
      setCurrentTable(null);
      setFormData({ number: "", status: "available", is_vip: false, waiter_ids: [] });
    }
    setModalOpen(true);
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
      fetchTables();
      setModalOpen(false);
    } catch (err) {
      toast.error("Failed to save table");
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTable(id);
      toast.success("Table deleted");
      fetchTables();
      setDeleteConfirmId(null);
    } catch (err) {
      toast.error("Failed to delete table");
    }
  };

  const removeWaiterTag = (id) => {
    setFormData({
      ...formData,
      waiter_ids: formData.waiter_ids.filter(wid => wid !== id),
    });
  };

  const filteredTables = tables.filter(t => {
    if (filters.waiterId && !t.waiters.find(w => w.id === parseInt(filters.waiterId))) return false;
    if (filters.isVip === "true" && !t.is_vip) return false;
    if (filters.isVip === "false" && t.is_vip) return false;
    return true;
  });

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        {/* <h1 className="text-2xl font-bold">Table Management</h1> */}
        <Button onClick={() => openModal()}><FaPlus className="mr-2" />Add Table</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select
          value={filters.waiterId}
          onChange={e => setFilters({ ...filters, waiterId: e.target.value })}
          className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Waiters</option>
          {waiters.map(w => (
            <option key={w.id} value={w.id}>{w.username}</option>
          ))}
        </select>
        <select
          value={filters.isVip}
          onChange={e => setFilters({ ...filters, isVip: e.target.value })}
          className="border px-2 py-1 rounded dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="">All Tables</option>
          <option value="true">VIP Only</option>
          <option value="false">Non-VIP</option>
        </select>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables
          .sort((a, b) => a.number - b.number)
          .map(table => (
            <Card
              key={table.id}
              className="relative transform hover:scale-105 hover:shadow-2xl hover:-rotate-1 transition-all duration-300 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-2 flex flex-col justify-between"
            >
              {/* VIP Ribbon */}
              {table.is_vip && (
                <div className="absolute top-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 text-white px-2 py-1 text-xs font-bold rounded-br-lg z-10 animate-pulse">
                  VIP
                </div>
              )}
              {/* Status Badge */}
              <div className={`absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded ${table.status === "available" ? "bg-green-500 animate-pulse" : table.status === "occupied" ? "bg-red-500" : "bg-yellow-500"} text-white`}>
                {table.status}
              </div>
              <CardHeader>
                <CardTitle className="text-lg font-bold text-center py-2 truncate">Table {table.number}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-1">
                <p className="text-sm font-medium">Waiters:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {table.waiters.length ? table.waiters.map(w => (
                    <span key={w.id} className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full truncate">{w.username}</span>
                  )) : <span className="text-xs text-gray-500">None</span>}
                </div>
              </CardContent>
              <div className="flex justify-end space-x-2 p-2">
                <Button variant="outline" size="sm" onClick={() => openModal(table)}><FaEdit /></Button>
                {deleteConfirmId === table.id ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(table.id)}>Yes</Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}>No</Button>
                  </div>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmId(table.id)}><FaTrash /></Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md shadow-lg">
            <h2 className="text-xl font-bold mb-4">{currentTable ? "Edit Table" : "Add Table"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block mb-1">Table Number</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={e => setFormData({ ...formData, number: e.target.value })}
                  className="w-full border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.is_vip}
                  onChange={e => setFormData({ ...formData, is_vip: e.target.checked })}
                  className="accent-indigo-500"
                />
                <label>VIP Table</label>
              </div>
              <div>
                <label className="block mb-1">Assign Waiters</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {formData.waiter_ids.map(id => {
                    const waiter = waiters.find(w => w.id === id);
                    return waiter ? (
                      <span key={id} className="bg-indigo-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 text-xs">
                        {waiter.username}
                        <FaTimes className="cursor-pointer" onClick={() => removeWaiterTag(id)} />
                      </span>
                    ) : null;
                  })}
                </div>
                <select
                  value=""
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (!formData.waiter_ids.includes(val)) {
                      setFormData({ ...formData, waiter_ids: [...formData.waiter_ids, val] });
                    }
                  }}
                  className="w-full border px-2 py-1 rounded dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">Add Waiter</option>
                  {waiters.map(w => !formData.waiter_ids.includes(w.id) && (
                    <option key={w.id} value={w.id}>{w.username}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit">{currentTable ? "Update" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
