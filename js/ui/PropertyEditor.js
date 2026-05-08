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
      return;
    }

    const h3 = document.createElement('h3');
    h3.textContent = `Properties: ${component.type}`;
    this.dialog.appendChild(h3);

    props.forEach(prop => {
      const label = document.createElement('label');
      label.textContent = `${prop.label}: `;
      const input = document.createElement('input');
      input.type = prop.type;
      input.id = `prop-${prop.name}`;
      input.value = prop.value;
      if (prop.min !== undefined) input.min = prop.min;
      if (prop.max !== undefined) input.max = prop.max;
      if (prop.step !== undefined) input.step = prop.step;
      label.appendChild(input);
      this.dialog.appendChild(label);
      this.dialog.appendChild(document.createElement('br'));
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