import { SetPropertyCommand } from '../utils/UndoManager.js';

/**
 * PropertyEditor — Modal dialog for editing component properties.
 *
 * Opens as a centered modal with a real backdrop (click-to-close).
 * Supports number inputs (with min/max clamping for mobile browsers),
 * select dropdowns, and integrates with the UndoManager for undo/redo.
 *
 * Key behaviors:
 *   - Number inputs are clamped to [min, max] on save (mobile browsers
 *     don't enforce HTML min/max attributes on type="number")
 *   - NaN values are reverted to the current property value
 *   - Step values >= 1 are rounded to integers
 *   - Uses SetPropertyCommand for all changes (undo/redo support)
 *   - Clicking the backdrop or pressing Escape closes the dialog
 */
export class PropertyEditor {
  constructor(eventBus, engine, canvas, undoManager) {
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.undoManager = undoManager;
    this.dialog = null;
    this.component = null;
    this._escapeHandler = null;
    this._createDOM();
  }

  _createDOM() {
    // Create a real backdrop div (instead of a CSS pseudo-element) so
    // users can click outside the dialog to close it.
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'property-dialog-backdrop';
    this.backdrop.addEventListener('click', () => this.close());
    document.body.appendChild(this.backdrop);

    this.dialog = document.createElement('div');
    this.dialog.id = 'property-dialog';
    // Styling is provided entirely by CSS (see components.css)
    document.body.appendChild(this.dialog);
  }

  open(component) {
    this.component = component;
    const props = component.getProperties();

    // Clear previous content
    this.dialog.textContent = '';

    if (!props || props.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No editable properties.';
      this.dialog.appendChild(p);
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => this.close());
      this.dialog.appendChild(closeBtn);
      this.dialog.style.display = 'block';
      this.backdrop.style.display = 'block';
      return;
    }

    const h3 = document.createElement('h3');
    h3.textContent = `Properties: ${component.type}`;
    this.dialog.appendChild(h3);

    props.forEach(prop => {
      const fieldGroup = document.createElement('div');
      fieldGroup.className = 'prop-field';

      const label = document.createElement('label');
      label.textContent = prop.label;
      label.htmlFor = `prop-${prop.name}`;
      
      let input;
      if (prop.type === 'select' && prop.options) {
        // Dropdown select for enum properties (e.g., facing direction)
        input = document.createElement('select');
        input.id = `prop-${prop.name}`;
        prop.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (opt === prop.value) option.selected = true;
          input.appendChild(option);
        });
      } else {
        input = document.createElement('input');
        input.type = prop.type;
        input.id = `prop-${prop.name}`;
        input.value = prop.value;
        if (prop.min !== undefined) input.min = prop.min;
        if (prop.max !== undefined) input.max = prop.max;
        if (prop.step !== undefined) input.step = prop.step;
      }
      
      fieldGroup.appendChild(label);
      fieldGroup.appendChild(input);
      this.dialog.appendChild(fieldGroup);
    });

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'margin-top:15px; display:flex; gap:10px; justify-content:flex-end;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this._save());
    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    this.dialog.appendChild(btnContainer);

    this.dialog.style.display = 'block';
    this.backdrop.style.display = 'block';

    this._escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', this._escapeHandler);
      }
    };
    document.addEventListener('keydown', this._escapeHandler);
  }

  _save() {
    const props = this.component.getProperties();
    let changed = false;
    const commands = [];

    // Use for...of instead of forEach so that 'continue' skips correctly.
    // (Previously, 'return' inside forEach only exited the callback, not the loop.)
    for (const prop of props) {
      const inputEl = this.dialog.querySelector(`#prop-${prop.name}`);
      if (!inputEl) continue;

      let newValue;
      if (inputEl.tagName === 'SELECT') {
        newValue = inputEl.value;
      } else {
        newValue = inputEl.type === 'number' ? parseFloat(inputEl.value) : inputEl.value;
      }

      // Validate and clamp number inputs to min/max bounds.
      // This is critical for mobile browsers where <input type="number">
      // min/max attributes are not enforced and users can type any value.
      if (inputEl.type === 'number') {
        if (isNaN(newValue)) {
          // Revert to current value if user entered non-numeric input
          inputEl.value = prop.value;
          continue;
        }
        if (prop.min !== undefined && newValue < prop.min) {
          newValue = prop.min;
          inputEl.value = newValue;
        }
        if (prop.max !== undefined && newValue > prop.max) {
          newValue = prop.max;
          inputEl.value = newValue;
        }
        // Round to step precision
        if (prop.step !== undefined && prop.step >= 1) {
          newValue = Math.round(newValue);
          inputEl.value = newValue;
        }
      }

      if ((inputEl.tagName === 'SELECT' && newValue !== prop.value) ||
          (inputEl.type === 'number' ? !isNaN(newValue) && newValue !== prop.value : newValue !== prop.value)) {
        // Use SetPropertyCommand for undo/redo support
        if (this.engine && this.canvas && this.undoManager) {
          commands.push(new SetPropertyCommand(
            this.engine, this.canvas,
            this.component, prop.name, prop.value, newValue
          ));
        } else {
          this.component.setProperty(prop.name, newValue);
        }
        changed = true;
      }
    }
    // Execute commands through undo manager
    if (commands.length > 0 && this.undoManager) {
      for (const cmd of commands) {
        this.undoManager.execute(cmd);
      }
    }
    if (changed && commands.length === 0) {
      this.eventBus.emit('component-modified', this.component);
    }
    this.close();
  }

  close() {
    this.dialog.style.display = 'none';
    this.backdrop.style.display = 'none';
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
  }
}