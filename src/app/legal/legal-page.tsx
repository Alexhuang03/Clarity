"use client";

import { useSyncExternalStore } from "react";
import { LegalTabs } from "@/components/legal/legal-dialog";
import { LEGAL_TABS, LegalContent, type LegalTab } from "@/components/legal/content";

// L'onglet affiché suit l'ancre de l'URL (/legal#confidentialite) : la page reste statique et partageable
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function currentTab(): LegalTab {
  const hash = window.location.hash.slice(1);
  return LEGAL_TABS.find((t) => t.id === hash)?.id ?? "cgu";
}

export function LegalPage() {
  const tab = useSyncExternalStore(subscribe, currentTab, () => "cgu" as LegalTab);
  return (
    <div className="card overflow-hidden">
      <LegalTabs
        tab={tab}
        onTab={(t) => {
          history.replaceState(null, "", `#${t}`);
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }}
      />
      <div id="legal-panel" role="tabpanel" aria-labelledby={`legal-tab-${tab}`} className="px-4 py-6 sm:px-8">
        <LegalContent tab={tab} />
      </div>
    </div>
  );
}
