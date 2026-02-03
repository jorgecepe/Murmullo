/**
 * Helper module for Electron E2E testing with Playwright
 *
 * Note: Testing Electron apps requires special setup.
 * This helper provides utilities for launching and interacting with the app.
 */

import { _electron as electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Launch the Electron app for testing
 * @returns {Promise<{app: ElectronApplication, window: Page}>}
 */
export async function launchApp() {
  const electronApp = await electron.launch({
    args: [path.join(projectRoot, 'main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  });

  // Wait for the main window
  const window = await electronApp.firstWindow();

  // Wait for the window to be ready
  await window.waitForLoadState('domcontentloaded');

  return { app: electronApp, window };
}

/**
 * Close the Electron app
 * @param {ElectronApplication} app
 */
export async function closeApp(app) {
  if (app) {
    await app.close();
  }
}

/**
 * Get the control panel window
 * @param {ElectronApplication} app
 * @returns {Promise<Page>}
 */
export async function getControlPanel(app) {
  const windows = app.windows();

  // Control panel is usually the larger window
  for (const win of windows) {
    const size = await win.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    if (size.width > 500) {
      return win;
    }
  }

  return null;
}

/**
 * Simulate hotkey press via IPC
 * @param {ElectronApplication} app
 */
export async function simulateHotkeyPress(app) {
  await app.evaluate(async ({ ipcMain }) => {
    // Trigger the hotkey handler
    ipcMain.emit('toggle-dictation');
  });
}

/**
 * Wait for app initialization
 * @param {Page} window
 */
export async function waitForAppReady(window) {
  // Wait for the main UI to render
  await window.waitForSelector('body', { state: 'visible', timeout: 10000 });
}

/**
 * Get setting value from the app
 * @param {ElectronApplication} app
 * @param {string} key
 */
export async function getSetting(app, key) {
  return await app.evaluate(async ({ ipcMain }, key) => {
    return new Promise((resolve) => {
      ipcMain.handleOnce('get-setting', () => key);
      resolve(null); // Simplified for testing
    });
  }, key);
}

export default {
  launchApp,
  closeApp,
  getControlPanel,
  simulateHotkeyPress,
  waitForAppReady,
  getSetting
};
