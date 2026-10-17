import React from "react";
import { isExternalNotebookActive } from "@/lib/external-notebook/runtime";
import ExternalNotebookSurface from "./ExternalNotebookSurface";

// children is the EXACT existing activity; never duplicate the old writer.
// With the shipped switches/readiness values this returns children unchanged.
export default function ExternalNotebookSlot({ context, children, registerSave, onComplete }) {
  if (!isExternalNotebookActive(context)) return <>{children}</>;
  return <ExternalNotebookSurface context={context} registerSave={registerSave} onComplete={onComplete} />;
}