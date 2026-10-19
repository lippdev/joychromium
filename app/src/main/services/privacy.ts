import type { Session } from "electron";

/**
 * Clearing browsing data means every storage area the app uses: the default session, its cache, and the history file.
 * Private sessions are ephemeral, so only the default one holds anything worth wiping.
 */
export interface ClearDataHost {
  session: Session;
  clearHistory: () => void;
}

export async function clearBrowsingData(host: ClearDataHost): Promise<void> {
  await host.session.clearStorageData();
  await host.session.clearCache();
  await host.session.clearAuthCache();
  host.clearHistory();
}
