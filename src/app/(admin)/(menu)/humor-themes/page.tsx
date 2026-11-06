"use client";

import HumorThemesManager from "@/components/HumorThemesManager";

export default function HumorThemesPage() {
  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Humor Themes</h1>
        <p className="page-subtitle">
          Create and manage themes that can be assigned to humor flavors.
        </p>
      </div>

      <HumorThemesManager className="w-full" addThemeMode="modal" />
    </div>
  );
}
