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
    <div className="p-4 max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2 w-full sm:w-auto justify-center">
          <FaPlus /> Add Station
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-300">Loading...</p>
      ) : (
        <div className="flex flex-col space-y-4">
          {/* Table header row */}
          <div className="hidden sm:flex px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 select-none">
            <div className="flex-1">Station Name</div>
            <div className="w-32 text-center">Printer Identifier</div>
            <div className="w-24 text-center">PIN</div>
            <div className="w-48 text-right">Actions</div>
          </div>

          {/* Cards as rows */}
          {stations.map((station) => (
            <Card
              key={station.id}
              className="p-4 shadow hover:shadow-lg transition-shadow dark:bg-gray-800 dark:text-gray-100 flex flex-col sm:flex-row items-center gap-4"
            >
              <div className="flex-1 font-semibold text-lg truncate">{station.name}</div>
              <div className="w-32 text-center truncate">{station.printer_identifier || "N/A"}</div>
              <div className="w-24 text-center">****</div>

              <div className="w-48 flex justify-end gap-2 flex-shrink-0">
                <Button
                  onClick={() => handleEdit(station)}
                  variant="outline"
                  className="flex items-center gap-1"
                  size="sm"
                >
                  <FaEdit /> Edit
                </Button>
                <Button
                  onClick={() => setDeleteConfirm(station.id)}
                  variant="destructive"
                  className="flex items-center gap-1"
                  size="sm"
                >
                  <FaTrash /> Delete
                </Button>
              </div>

              {deleteConfirm === station.id && (
                <div className="absolute top-2 left-2 right-2 bg-red-100 dark:bg-red-900 p-2 rounded text-red-800 dark:text-red-200 mt-2 z-10">
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
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow-lg w-full max-w-md sm:max-w-lg">
            <h2 className="text-xl font-bold mb-4 dark:text-gray-100 text-center">
              {currentStation ? "Edit Station" : "Add Station"}
            </h2>

            {error && <p className="text-red-600 dark:text-red-400 mb-2 text-center">{error}</p>}

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

            <div className="flex flex-col sm:flex-row justify-center sm:justify-end gap-2">
              <Button onClick={handleSubmit} className="w-full sm:w-auto">
                {currentStation ? "Update" : "Create"}
              </Button>
              <Button onClick={closeModal} variant="outline" className="w-full sm:w-auto">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
