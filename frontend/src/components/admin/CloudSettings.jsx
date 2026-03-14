import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { getCloudConfig, updateCloudConfig } from "@/api/cloudConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/lib/apiError";

const EMPTY_CONFIG = {
  tenant_id: "",
  store_id: "",
  device_id: "",
  device_name: "",
  machine_fingerprint: "",
  cloud_base_url: "",
  license_key: "",
};

export default function CloudSettings() {
  const { authToken } = useAuth();
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getCloudConfig(authToken);
      const next = { ...EMPTY_CONFIG, ...(data || {}) };
      setConfig(next);
      setLicenseKey(next.license_key || "");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load cloud settings."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [authToken]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateCloudConfig(
        { license_key: licenseKey },
        authToken
      );
      const next = { ...EMPTY_CONFIG, ...(data || {}) };
      setConfig(next);
      setLicenseKey(next.license_key || "");
      toast.success("License key updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update license key."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-300">
        Loading cloud settings...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Cloud License</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Device identity is generated automatically and cannot be edited.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadConfig}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Device ID</Label>
          <Input value={config.device_id || ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Device Fingerprint</Label>
          <Input value={config.machine_fingerprint || ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Device Name</Label>
          <Input value={config.device_name || ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Cloud Base URL</Label>
          <Input value={config.cloud_base_url || ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Tenant ID</Label>
          <Input value={config.tenant_id ?? ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Store ID</Label>
          <Input value={config.store_id ?? ""} readOnly />
        </div>
      </div>

      <div className="space-y-2">
        <Label>License Key</Label>
        <Input
          value={licenseKey}
          onChange={(event) => setLicenseKey(event.target.value)}
          placeholder="Enter license key"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Update the license key here. The next sync cycle will re-activate the device.
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save License"}
      </Button>
    </div>
  );
}
