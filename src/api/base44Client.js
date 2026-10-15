import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, functionsVersion, appBaseUrl } = appParams;

// Let the SDK read the current session. A constructor token remains captured
// by actor reconnects even after an expired token is removed from storage.
const clientConfig = {
  appId,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
};

export let base44 = createClient(clientConfig);

// Keep notebooks on the app's own origin when the separate realtime host
// cannot be reached. The SDK still owns authentication and reconnection.
const notebookClientConfig = {
  ...clientConfig,
  analytics: { enabled: false },
  options: { actorsTransport: 'proxy' },
};
export let notebookBase44 = createClient(notebookClientConfig);

export function resetBase44Client() {
  base44.cleanup();
  notebookBase44.cleanup();
  base44 = createClient(clientConfig);
  notebookBase44 = createClient(notebookClientConfig);
}