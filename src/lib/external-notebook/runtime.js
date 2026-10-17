import { EXTERNAL_NOTEBOOK_CONFIG } from "./config";
import { matchesExternalNotebook, matchesExternalNotebookControls } from "./context";
import { NOTEBOOK_ENGINE_READY } from "./engine";
import { NOTEBOOK_TRANSPORT_READY } from "./transport";
import { NOTEBOOK_PERSISTENCE_READY } from "./persistence";

export function isExternalNotebookActive(context) {
  return NOTEBOOK_ENGINE_READY && NOTEBOOK_TRANSPORT_READY && NOTEBOOK_PERSISTENCE_READY &&
    matchesExternalNotebook(context, EXTERNAL_NOTEBOOK_CONFIG);
}

export function isExternalNotebookControlEnabled(context) {
  return NOTEBOOK_ENGINE_READY && NOTEBOOK_TRANSPORT_READY && NOTEBOOK_PERSISTENCE_READY &&
    matchesExternalNotebookControls(context, EXTERNAL_NOTEBOOK_CONFIG);
}