/**
 * Simple toast notification manager.
 * Can be used outside of the canvas (it appends to document.body).
 */
export class CanvasToast {
  constructor() {
    this.toastContainer = null;
    this._createContainer();
  }

  _createContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'toast-container';
    this.toastContainer.setAttribute('role', 'status');
    this.toastContainer.setAttribute('aria-live', 'polite');
    this.toastContainer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.toastContainer);
  }

  /**
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number} duration ms
   */
  show(message, type = 'info', duration = 2500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}