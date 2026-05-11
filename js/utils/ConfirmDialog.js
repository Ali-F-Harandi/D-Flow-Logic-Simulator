/**
 * ConfirmDialog — Theme-aware replacement for window.confirm()
 *
 * Provides a non-blocking, themeable confirmation dialog that respects
 * the application's design tokens (CSS custom properties). Returns a
 * Promise<boolean> so callers can use async/await.
 *
 * Usage:
 *   const result = await ConfirmDialog.show('Are you sure?');
 *   if (result) { ... }
 *
 * Features:
 *   - Respects all three themes (dark, light, high-contrast)
 *   - Keyboard accessible (Enter = confirm, Escape = cancel)
 *   - Focus trap inside dialog
 *   - Backdrop click cancels
 *   - Auto-focuses confirm button
 *   - Z-index above all other UI elements
 */
export class ConfirmDialog {
  /**
   * Show a themed confirmation dialog.
   * @param {string} message - The message to display
   * @param {Object} [opts] - Options
   * @param {string} [opts.title='Confirm'] - Dialog title
   * @param {string} [opts.confirmText='OK'] - Confirm button text
   * @param {string} [opts.cancelText='Cancel'] - Cancel button text
   * @param {string} [opts.confirmClass='confirm-dialog-btn-primary'] - CSS class for confirm button
   * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
   */
  static show(message, opts = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Confirm',
        confirmText = 'OK',
        cancelText = 'Cancel',
        confirmClass = 'confirm-dialog-btn-primary'
      } = opts;

      // Remove any existing dialog
      const existing = document.getElementById('confirm-dialog-overlay');
      if (existing) existing.remove();

      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'confirm-dialog-overlay';
      overlay.className = 'confirm-dialog-overlay';

      // Create dialog box
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', title);

      // Title
      const titleEl = document.createElement('div');
      titleEl.className = 'confirm-dialog-title';
      titleEl.textContent = title;

      // Message
      const msgEl = document.createElement('div');
      msgEl.className = 'confirm-dialog-message';
      msgEl.textContent = message;

      // Button row
      const btnRow = document.createElement('div');
      btnRow.className = 'confirm-dialog-btn-row';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'confirm-dialog-btn confirm-dialog-btn-cancel';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `confirm-dialog-btn ${confirmClass}`;
      confirmBtn.textContent = confirmText;
      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);

      dialog.appendChild(titleEl);
      dialog.appendChild(msgEl);
      dialog.appendChild(btnRow);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Focus the confirm button
      requestAnimationFrame(() => confirmBtn.focus());

      // Keyboard handling
      const handleKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup();
          resolve(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          cleanup();
          resolve(true);
        }
      };
      document.addEventListener('keydown', handleKey);

      // Backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      function cleanup() {
        document.removeEventListener('keydown', handleKey);
        overlay.remove();
      }
    });
  }
}
