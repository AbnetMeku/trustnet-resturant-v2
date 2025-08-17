import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStations, createStation, updateStation, deleteStation } from "@/api/stations";
import { FaPlus, FaTrash, FaEdit } from "react-icons/fa";

export default function StationManagement() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    printer_identifier: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState("");

  const fetchStations = async () => {
    setLoading(true);
    try {
      const data = await getStations();
      setStations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentStation(null);
    setFormData({ name: "", password: "", printer_identifier: "" });
    setError("");
  };

  const handleSubmit = async () => {
    setError("");

    if (!formData.name) {
      setError("Station name is required");
      return;
    }

    // PIN required if creating new station or editing with PIN provided
    if (!currentStation || formData.password) {
      if (!/^\d{4}$/.test(formData.password)) {
        setError("PIN must be 4 digits");
        return;
      }
    }

    try {
      const payload = { ...formData };
      if (currentStation && !formData.password) delete payload.password;

      if (currentStation) await updateStation(currentStation.id, payload);
      else await createStation(payload);

      closeModal();
      fetchStations();
    } catch (err) {
      setError(err.response?.data?.message || "Error occurred");
    }
  };

  const handleEdit = (station) => {
    setCurrentStation(station);
    setFormData({
      name: station.name,
      password: "",
      printer_identifier: station.printer_identifier || "",
    });
    setModalOpen(true);
  };

  const handleDelete = async (stationId) => {
    try {
      await deleteStation(stationId);
      setDeleteConfirm(null);
      fetchStations();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stations</h1>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
          <FaPlus /> Add Station
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-300">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stations.map((station) => (
            <Card
              key={station.id}
              className="p-4 relative shadow hover:shadow-lg transition-shadow dark:bg-gray-800 dark:text-gray-100"
            >
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-semibold">{station.name}</h2>
                <span
                  className="px-2 py-1 text-xs font-bold rounded-full text-white bg-green-500"
                  title="Active"
                >
                  Active
                </span>
              </div>
              <p className="mt-2">Printer: {station.printer_identifier || "N/A"}</p>
              <p className="mt-1">PIN: ****</p>

              <div className="flex gap-2 mt-4 justify-end">
                <Button
                  onClick={() => handleEdit(station)}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  <FaEdit /> Edit
                </Button>
                <Button
                  onClick={() => setDeleteConfirm(station.id)}
                  variant="destructive"
                  className="flex items-center gap-1"
                >
                  <FaTrash /> Delete
                </Button>
              </div>

              {deleteConfirm === station.id && (
                <div className="absolute top-2 left-2 right-2 bg-red-100 dark:bg-red-900 p-2 rounded text-red-800 dark:text-red-200">
                  <p>Confirm delete?</p>
                  <div className="flex gap-2 mt-1 justify-end">
                    <Button onClick={() => handleDelete(station.id)} variant="destructive" size="sm">
                      Yes
                    </Button>
                    <Button onClick={() => setDeleteConfirm(null)} size="sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-gray-100">
              {currentStation ? "Edit Station" : "Add Station"}
            </h2>

            {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}

            <Input
              name="name"
              placeholder="Station Name"
              value={formData.name}
              onChange={handleChange}
              className="mb-2"
            />
            <Input
              name="password"
              placeholder={currentStation ? "Leave blank to keep PIN" : "4-digit PIN"}
              value={formData.password}
              onChange={handleChange}
              maxLength={4}
              type="password"
              className="mb-2"
            />
            <Input
              name="printer_identifier"
              placeholder="Printer Identifier"
              value={formData.printer_identifier}
              onChange={handleChange}
              className="mb-4"
            />

            <div className="flex justify-end gap-2">
              <Button onClick={handleSubmit}>{currentStation ? "Update" : "Create"}</Button>
              <Button onClick={closeModal} variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
