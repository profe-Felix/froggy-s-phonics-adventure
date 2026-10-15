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

export function resetBase44Client() {
  base44.cleanup();
  base44 = createClient(clientConfig);
}