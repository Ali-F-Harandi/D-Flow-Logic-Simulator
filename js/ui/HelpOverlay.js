/**
 * Keyboard Shortcut Overlay / Help Panel.
 * Press "?" or F1 to toggle. Shows all keyboard shortcuts
 * in a clean, organized overlay.
 */
export class HelpOverlay {
  constructor() {
    this.element = null;
    this.visible = false;
    this._createDOM();
    this._bindKeyboard();
  }

  _createDOM() {
    this.element = document.createElement('div');
    this.element.id = 'help-overlay';
    this.element.style.display = 'none';

    this.element.innerHTML = `
      <div class="help-content">
        <div class="help-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="help-close-btn" title="Close">&times;</button>
        </div>
        <div class="help-body">
          <div class="help-section">
            <h3>General</h3>
            <table class="shortcut-table">
              <tr><td><kbd>?</kbd> / <kbd>F1</kbd></td><td>Show/hide this help</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd></td><td>Copy selected</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>V</kbd></td><td>Paste copied</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all components</td></tr>
              <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Delete selected</td></tr>
              <tr><td><kbd>Escape</kbd></td><td>Clear selection / Cancel wiring</td></tr>
              <tr><td><kbd>F5</kbd></td><td>Run simulation</td></tr>
            </table>
          </div>
          <div class="help-section">
            <h3>Navigation</h3>
            <table class="shortcut-table">
              <tr><td><kbd>Arrow Keys</kbd></td><td>Move selected components (snaps to grid)</td></tr>
              <tr><td><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>Cycle focus through components</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Click</kbd> + drag</td><td>Pan canvas</td></tr>
              <tr><td><kbd>Middle Mouse</kbd> + drag</td><td>Pan canvas</td></tr>
              <tr><td><kbd>Scroll Wheel</kbd></td><td>Zoom in/out</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>Ctrl</kbd>+<kbd>-</kbd></td><td>Zoom in/out (centered)</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>0</kbd></td><td>Reset zoom to 100%</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd></td><td>Zoom to fit all components</td></tr>
              <tr><td><kbd>Home</kbd></td><td>Center canvas view</td></tr>
            </table>
          </div>
          <div class="help-section">
            <h3>Selection</h3>
            <table class="shortcut-table">
              <tr><td><kbd>Click</kbd> on component</td><td>Select component</td></tr>
              <tr><td><kbd>Shift</kbd>+<kbd>Click</kbd></td><td>Add to / remove from selection</td></tr>
              <tr><td><kbd>Click</kbd> on empty area + drag</td><td>Selection rectangle</td></tr>
              <tr><td><kbd>Click</kbd> on connector</td><td>Start wiring</td></tr>
              <tr><td><kbd>Click</kbd> on wire</td><td>Select wire</td></tr>
              <tr><td><kbd>Right-click</kbd></td><td>Context menu</td></tr>
            </table>
          </div>
          <div class="help-section">
            <h3>Touch (Mobile)</h3>
            <table class="shortcut-table">
              <tr><td>Tap component</td><td>Select / Toggle (switch)</td></tr>
              <tr><td>Drag component</td><td>Move component</td></tr>
              <tr><td>Tap connector</td><td>Start wiring</td></tr>
              <tr><td>One-finger drag on empty area</td><td>Pan canvas</td></tr>
              <tr><td>Two-finger pinch</td><td>Zoom in/out</td></tr>
              <tr><td>Long-press (500ms)</td><td>Context menu</td></tr>
            </table>
          </div>
          <div class="help-section">
            <h3>Wiring</h3>
            <table class="shortcut-table">
              <tr><td>Click output connector</td><td>Start wire from output</td></tr>
              <tr><td>Click input connector</td><td>Start wire from input</td></tr>
              <tr><td>Release on compatible connector</td><td>Complete connection</td></tr>
              <tr><td>Auto-magnet snap</td><td>Wires snap to nearest connector within 30px</td></tr>
            </table>
          </div>
          <div class="help-section">
            <h3>Wire Editing (Manual Adjustment)</h3>
            <table class="shortcut-table">
              <tr><td>Click on a wire</td><td>Select wire and show control points (green dots)</td></tr>
              <tr><td>Drag green control point</td><td>Move wire bend point to new position</td></tr>
              <tr><td>Double-click on wire segment</td><td>Add a new control point at that position</td></tr>
              <tr><td>Right-click control point</td><td>Remove that control point</td></tr>
              <tr><td>Click dashed circle on segment</td><td>Add new bend point at segment midpoint</td></tr>
              <tr><td>Right-click wire</td><td>Context menu: Delete, Reroute, Add Point, Lock</td></tr>
              <tr><td>Click empty canvas</td><td>Deselect wire and hide control points</td></tr>
            </table>
          </div>
        </div>
      </div>
    `;

    // Close button
    this.element.querySelector('.help-close-btn').addEventListener('click', () => this.hide());

    // Click on backdrop to close
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.hide();
    });

    document.body.appendChild(this.element);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.visible) {
        this.hide();
      }
    });
  }

  show() {
    this.visible = true;
    this.element.style.display = 'flex';
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }
}
