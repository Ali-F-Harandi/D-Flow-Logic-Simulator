export class PropertyEditor {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.dialog = null;
    this.component = null;
    this._escapeHandler = null;
    this._createDOM();
  }

  _createDOM() {
    this.dialog = document.createElement('div');
    this.dialog.id = 'property-dialog';
    // Styling is provided entirely by CSS (see components.css)
    document.body.appendChild(this.dialog);
  }

  open(component) {
    this.component = component;
    const props = component.getProperties();
    if (!props || props.length === 0) {
      this.dialog.innerHTML = `<p>No editable properties.</p><button id="prop-close">Close</button>`;
      this.dialog.querySelector('#prop-close').onclick = () => this.close();
      this.dialog.style.display = 'block';
      return;
    }

    let html = `<h3>Properties: ${component.type}</h3>`;
    props.forEach(prop => {
      html += `<label>${prop.label}: <input type="${prop.type}" id="prop-${prop.name}" value="${prop.value}"`;
      if (prop.min !== undefined) html += ` min="${prop.min}"`;
      if (prop.max !== undefined) html += ` max="${prop.max}"`;
      if (prop.step !== undefined) html += ` step="${prop.step}"`;
      html += `></label><br>`;
    });
    html += `<div style="margin-top:15px; display:flex; gap:10px; justify-content:flex-end;">`;
    html += `<button id="prop-cancel">Cancel</button>`;
    html += `<button id="prop-save">Save</button>`;
    html += `</div>`;
    this.dialog.innerHTML = html;
    this.dialog.style.display = 'block';

    this.dialog.querySelector('#prop-cancel').onclick = () => this.close();
    this.dialog.querySelector('#prop-save').onclick = () => this._save();

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
    props.forEach(prop => {
      const inputEl = this.dialog.querySelector(`#prop-${prop.name}`);
      if (inputEl) {
        const newValue = inputEl.type === 'number' ? parseFloat(inputEl.value) : inputEl.value;
        if (newValue !== prop.value) {
          this.component.setProperty(prop.name, newValue);
          changed = true;
        }
      }
    });
    if (changed) {
      this.eventBus.emit('component-modified', this.component);
    }
    this.close();
  }

  close() {
    this.dialog.style.display = 'none';
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
  }
}