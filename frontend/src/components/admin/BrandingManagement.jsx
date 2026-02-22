import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_BRANDING,
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandingAsset,
} from "@/api/branding";

export default function BrandingManagement() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [form, setForm] = useState({
    logo_url: "",
    background_url: "",
  });
  const [preview, setPreview] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getBrandingSettings();
        setForm({
          logo_url: data.custom_logo_url || "",
          background_url: data.custom_background_url || "",
        });
        setPreview(data);
      } catch (error) {
        toast.error(error.response?.data?.error || "Failed to load branding settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: form.logo_url,
        background_url: form.background_url,
      });
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
      });
      setPreview(data);
      toast.success("Branding updated successfully");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update branding settings");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      const data = await updateBrandingSettings({
        logo_url: "",
        background_url: "",
      });
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
      });
      setPreview(data);
      toast.success("Branding reset to defaults");
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to reset branding settings");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (assetType, file) => {
    if (!file) return;

    const setLoadingState = assetType === "logo" ? setUploadingLogo : setUploadingBackground;
    setLoadingState(true);
    try {
      const data = await uploadBrandingAsset(assetType, file);
      setForm({
        logo_url: data.custom_logo_url || "",
        background_url: data.custom_background_url || "",
      });
      setPreview(data);
      toast.success(`${assetType === "logo" ? "Logo" : "Background"} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.error || "Upload failed");
    } finally {
      setLoadingState(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-300">Loading branding settings...</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Branding</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure logo and background used across admin and POS screens.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleResetDefaults}
            disabled={saving}
            className="border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reset to Default
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4 space-y-4 border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm">
          <div>
            <h4 className="font-medium">Assets</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Upload logo and background images. URL links are hidden for a cleaner flow.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-logo-upload">Logo Upload</Label>
            <Input
              id="branding-logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleUpload("logo", file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, JPEG, WEBP up to 5 MB.</p>
            {uploadingLogo && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading logo...</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="branding-background-upload">Background Upload</Label>
            <Input
              id="branding-background-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                handleUpload("background", file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, JPEG, WEBP up to 5 MB.</p>
            {uploadingBackground && <p className="text-xs text-blue-600 dark:text-blue-400">Uploading background...</p>}
          </div>

          <div className="pt-1">
            <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingBackground}>
              {saving ? "Saving..." : "Save Branding"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3 border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Live Preview</h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">Current effective branding</span>
          </div>

          <div
            className="relative h-64 rounded-lg bg-cover bg-center overflow-hidden border border-slate-200 dark:border-slate-700"
            style={{ backgroundImage: `url('${preview.background_url}')` }}
          >
            <div className="absolute inset-0 bg-black/45" />
            <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
              <img
                src={preview.logo_url}
                alt="Brand Logo"
                className="w-24 h-24 object-contain bg-white/90 rounded-full p-2"
              />
              <p className="text-white text-sm font-medium">TrustNet Restaurant</p>
              <p className="text-white/80 text-xs">Admin branding preview</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200">
              <span className="font-medium">Logo source:</span> {preview.custom_logo_url ? "Custom" : "Default"}
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200">
              <span className="font-medium">Background source:</span> {preview.custom_background_url ? "Custom" : "Default"}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
