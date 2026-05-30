// ============================================
// SCRIPTUREQUEST V4 — Toast Utility
// Lightweight toast notifications.
// Theme-aware via CSS variables.
// ============================================

let _activeToast = null;
let _removeTimeout = null;

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast immediately
  if (_activeToast) {
    _activeToast.remove();
    _activeToast = null;
  }
  if (_removeTimeout) {
    clearTimeout(_removeTimeout);
    _removeTimeout = null;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);
  _activeToast = toast;

  _removeTimeout = setTimeout(() => {
    if (toast.parentNode) toast.remove();
    if (_activeToast === toast) _activeToast = null;
  }, duration);
}

// Expose globally for legacy inline onclick handlers
window.showToast = showToast;

export default showToast;
