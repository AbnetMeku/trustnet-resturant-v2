import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DEFAULT_BRANDING, getBrandingSettings, updateBrandingSettings } from "@/api/branding";

export default function BrandingManagement() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const handleChange = (field, value) => {
    const nextForm = { ...form, [field]: value };
    setForm(nextForm);
    setPreview({
      ...preview,
      logo_url: nextForm.logo_url.trim() || DEFAULT_BRANDING.logo_url,
      background_url: nextForm.background_url.trim() || DEFAULT_BRANDING.background_url,
      custom_logo_url: nextForm.logo_url.trim() || null,
      custom_background_url: nextForm.background_url.trim() || null,
    });
  };

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

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-300">Loading branding settings...</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div>
          <Label htmlFor="branding-logo">Logo URL</Label>
          <Input
            id="branding-logo"
            placeholder="https://example.com/logo.png"
            value={form.logo_url}
            onChange={(e) => handleChange("logo_url", e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty to use default `/logo.png`.</p>
        </div>

        <div>
          <Label htmlFor="branding-background">Background URL</Label>
          <Input
            id="branding-background"
            placeholder="https://example.com/background.jpg"
            value={form.background_url}
            onChange={(e) => handleChange("background_url", e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty to use default `/Background.jpeg`.</p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Branding"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Preview</h3>
        <div
          className="relative h-48 rounded-md bg-cover bg-center overflow-hidden"
          style={{ backgroundImage: `url('${preview.background_url}')` }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 h-full flex items-center justify-center">
            <img
              src={preview.logo_url}
              alt="Brand Logo"
              className="w-24 h-24 object-contain bg-white/90 rounded-full p-2"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
