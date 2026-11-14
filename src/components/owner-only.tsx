"use client";

import type { ReactNode } from "react";
import { useProfile } from "./shell";

export function OwnerOnly({ children }: { children: ReactNode }) {
  const profile = useProfile();
  if (profile.role !== "owner") {
    return (
      <div role="alert" className="panel p-6">
        <p className="font-semibold">Halaman ini hanya untuk pemilik warung.</p>
      </div>
    );
  }
  return <>{children}</>;
}
