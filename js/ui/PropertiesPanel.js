/**
 * PropertiesPanel — inline contextual property editor
 *
 * Shows inline in the right sidebar when a component or wire is selected.
 * Replaces the modal dialog for a more modern editing experience.
 */

import { SetPropertyCommand } from '../utils/UndoManager.js';

export class PropertiesPanel {
  constructor(container, eventBus, engine, canvas, undoManager) {
    this.container = container;
    this.eventBus = eventBus;
    this.engine = engine;
    this.canvas = canvas;
    this.undoManager = undoManager;
    this.panel = null;
    this._currentComponent = null;
    this._currentWire = null;
    this._createDOM();

    // Listen for selection changes to update the panel
    this.eventBus.on('selection-changed', () => this._onSelectionChanged());
  }

  _createDOM() {
    this.panel = document.createElement('div');
    this.panel.className = 'properties-panel';
    this.panel.id = 'properties-panel';
    this.panel.style.display = 'none';
    this.container.appendChild(this.panel);
  }

  /**
   * Show properties for a component.
   */
  showComponent(component) {
    this._currentComponent = component;
    this._currentWire = null;
    this._renderComponentPanel();
    this.panel.style.display = 'block';
  }

  /**
   * Show properties for a wire.
   */
  showWire(wire) {
    this._currentWire = wire;
    this._currentComponent = null;
    this._renderWirePanel();
    this.panel.style.display = 'block';
  }

  /**
   * Hide the panel.
   */
  hide() {
    this.panel.style.display = 'none';
    this._currentComponent = null;
    this._currentWire = null;
    this.panel.textContent = '';
  }

  /**
   * Called when selection changes — update panel content.
   */
  _onSelectionChanged() {
    // Will be called externally when selection changes
  }

  _renderComponentPanel() {
    const comp = this._currentComponent;
    if (!comp) return;

    this.panel.textContent = '';

    const header = document.createElement('div');
    header.className = 'properties-header';
    header.textContent = comp.type;
    this.panel.appendChild(header);

    const props = comp.getProperties();

    if (!props || props.length === 0) {
      const noProps = document.createElement('div');
      noProps.className = 'properties-no-props';
      noProps.textContent = 'No editable properties';
      this.panel.appendChild(noProps);
    } else {
      props.forEach(prop => {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'properties-field';

        const label = document.createElement('label');
        label.textContent = prop.label;
        label.className = 'properties-label';
        fieldGroup.appendChild(label);

        let input;
        let numberWrapper = null;
        if (prop.type === 'select' && prop.options) {
          input = document.createElement('select');
          input.className = 'properties-input';
          input.id = `pprop-${prop.name}`;
          prop.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === prop.value) option.selected = true;
            input.appendChild(option);
          });
        } else if (prop.type === 'number') {
          // Create number input with +/- buttons
          numberWrapper = document.createElement('div');
          numberWrapper.className = 'properties-number-wrapper';

          const decBtn = document.createElement('button');
          decBtn.className = 'properties-number-btn btn-decrement';
          decBtn.textContent = '−';
          decBtn.type = 'button';
          decBtn.tabIndex = -1;

          input = document.createElement('input');
          input.type = 'number';
          input.id = `pprop-${prop.name}`;
          input.value = prop.value;
          input.className = 'properties-input';
          if (prop.min !== undefined) input.min = prop.min;
          if (prop.max !== undefined) input.max = prop.max;
          if (prop.step !== undefined) input.step = prop.step;

          const incBtn = document.createElement('button');
          incBtn.className = 'properties-number-btn btn-increment';
          incBtn.textContent = '+';
          incBtn.type = 'button';
          incBtn.tabIndex = -1;

          // +/- button handlers
          const step = prop.step !== undefined ? prop.step : 1;
          decBtn.addEventListener('click', () => {
            let val = parseFloat(input.value);
            if (isNaN(val)) val = prop.value;
            val = val - step;
            if (prop.min !== undefined && val < prop.min) val = prop.min;
            if (prop.step !== undefined && prop.step >= 1) val = Math.round(val);
            input.value = val;
            input.dispatchEvent(new Event('change'));
          });
          incBtn.addEventListener('click', () => {
            let val = parseFloat(input.value);
            if (isNaN(val)) val = prop.value;
            val = val + step;
            if (prop.max !== undefined && val > prop.max) val = prop.max;
            if (prop.step !== undefined && prop.step >= 1) val = Math.round(val);
            input.value = val;
            input.dispatchEvent(new Event('change'));
          });

          numberWrapper.appendChild(decBtn);
          numberWrapper.appendChild(input);
          numberWrapper.appendChild(incBtn);
        } else {
          input = document.createElement('input');
          input.type = prop.type;
          input.id = `pprop-${prop.name}`;
          input.value = prop.value;
          input.className = 'properties-input';
          if (prop.min !== undefined) input.min = prop.min;
          if (prop.max !== undefined) input.max = prop.max;
          if (prop.step !== undefined) input.step = prop.step;
        }

        label.htmlFor = input.id;
        if (numberWrapper) {
          fieldGroup.appendChild(numberWrapper);
        } else {
          fieldGroup.appendChild(input);
        }

        // Apply on change
        input.addEventListener('change', () => {
          let newValue;
          if (input.tagName === 'SELECT') {
            newValue = input.value;
          } else {
            newValue = input.type === 'number' ? parseFloat(input.value) : input.value;
          }

          // Validate number inputs
          if (input.type === 'number') {
            if (isNaN(newValue)) {
              // Revert to current value if user cleared the field or entered non-numeric
              input.value = prop.value;
              return;
            }
            if (prop.min !== undefined && newValue < prop.min) {
              newValue = prop.min;
              input.value = newValue;
            }
            if (prop.max !== undefined && newValue > prop.max) {
              newValue = prop.max;
              input.value = newValue;
            }
            if (prop.step !== undefined && prop.step >= 1) {
              newValue = Math.round(newValue);
              input.value = newValue;
            }
          }

          // Detect value change — handle both number and text types
          const valueChanged = (input.tagName === 'SELECT' && newValue !== prop.value) ||
                              (input.type === 'number' ? newValue !== prop.value : newValue !== prop.value);
          if (valueChanged) {
            if (this.engine && this.canvas && this.undoManager) {
              const cmd = new SetPropertyCommand(
                this.engine, this.canvas, comp, prop.name, prop.value, newValue
              );
              this.undoManager.execute(cmd);
            } else {
              comp.setProperty(prop.name, newValue);
              this.eventBus.emit('component-modified', comp);
            }
            // Refresh panel to reflect new values (e.g., inputs count change, bitWidth change)
            this._currentComponent = comp;
            this._renderComponentPanel();
          }
        });

        this.panel.appendChild(fieldGroup);
      });
    }

    // Position info
    const posGroup = document.createElement('div');
    posGroup.className = 'properties-field properties-position';
    posGroup.textContent = `Position: (${comp.position.x}, ${comp.position.y})`;
    this.panel.appendChild(posGroup);

    // Feature 1 & 2: Facing and Mirror info
    if (comp.facing && comp.facing !== 'east') {
      const facingGroup = document.createElement('div');
      facingGroup.className = 'properties-field';
      facingGroup.textContent = `Facing: ${comp.facing}`;
      this.panel.appendChild(facingGroup);
    }
    if (comp.mirrored) {
      const mirrorGroup = document.createElement('div');
      mirrorGroup.className = 'properties-field';
      mirrorGroup.textContent = 'Mirrored: Yes';
      this.panel.appendChild(mirrorGroup);
    }

    // Connections info
    const connGroup = document.createElement('div');
    connGroup.className = 'properties-connections';
    const inputs = comp.inputs.length;
    const outputs = comp.outputs.length;
    const connectedInputs = comp.inputs.filter(i => i.connectedTo).length;
    connGroup.textContent = `Inputs: ${connectedInputs}/${inputs} connected · Outputs: ${outputs}`;
    this.panel.appendChild(connGroup);

    // Feature 4: Per-input inversion checkboxes for gate components
    if (comp.isInputNegated && comp.inputs.length > 0) {
      const invHeader = document.createElement('div');
      invHeader.className = 'properties-label';
      invHeader.style.marginTop = '8px';
      invHeader.style.marginBottom = '4px';
      invHeader.textContent = 'Input Inversion';
      this.panel.appendChild(invHeader);

      for (let i = 0; i < comp.inputs.length; i++) {
        const invRow = document.createElement('div');
        invRow.className = 'properties-field';
        invRow.style.flexDirection = 'row';
        invRow.style.alignItems = 'center';
        invRow.style.gap = '8px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `pprop-invert-${i}`;
        checkbox.checked = comp.isInputNegated(i);
        checkbox.style.cursor = 'pointer';

        const invLabel = document.createElement('label');
        invLabel.htmlFor = `pprop-invert-${i}`;
        invLabel.textContent = `I${i} (invert)`;
        invLabel.className = 'properties-label';
        invLabel.style.cursor = 'pointer';
        invLabel.style.marginBottom = '0';

        invRow.appendChild(checkbox);
        invRow.appendChild(invLabel);
        this.panel.appendChild(invRow);

        // Closure to capture index
        ((index) => {
          checkbox.addEventListener('change', () => {
            comp.toggleInputInversion(index);
            // Emit event so canvas updates wire endpoints and colors
            this.eventBus.emit('component-modified', comp);
            // Refresh panel after toggle
            this._currentComponent = comp;
            this._renderComponentPanel();
          });
        })(i);
      }
    }
  }

  _renderWirePanel() {
    const wire = this._currentWire;
    if (!wire) return;

    this.panel.textContent = '';

    const header = document.createElement('div');
    header.className = 'properties-header';
    header.textContent = 'Wire Properties';
    this.panel.appendChild(header);

    // Routing mode
    const modeGroup = document.createElement('div');
    modeGroup.className = 'properties-field';

    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Routing Mode';
    modeLabel.className = 'properties-label';
    modeGroup.appendChild(modeLabel);

    const modeValue = document.createElement('span');
    modeValue.className = 'properties-input';
    modeValue.textContent = 'Bézier (Auto)';
    modeGroup.appendChild(modeValue);
    this.panel.appendChild(modeGroup);

    // Wire state info
    const stateGroup = document.createElement('div');
    stateGroup.className = 'properties-field properties-state';
    const stateLabel = wire.wireState === 'auto' ? 'Auto-routed' :
                      wire.wireState === 'manual' ? 'Has waypoints' : 'Auto-routed';
    stateGroup.textContent = `State: ${stateLabel}`;
    this.panel.appendChild(stateGroup);

    // Control points count
    const cpGroup = document.createElement('div');
    cpGroup.className = 'properties-field';
    cpGroup.textContent = `Waypoints: ${wire.waypoints.length}`;
    this.panel.appendChild(cpGroup);

    // Path points count
    const ppGroup = document.createElement('div');
    ppGroup.className = 'properties-field';
    ppGroup.textContent = `Path Points: ${wire.pathPoints.length}`;
    this.panel.appendChild(ppGroup);

    // Source/Target info
    const srcGroup = document.createElement('div');
    srcGroup.className = 'properties-field';
    srcGroup.textContent = `Source: ${wire.sourceNode.nodeId}`;
    this.panel.appendChild(srcGroup);

    const tgtGroup = document.createElement('div');
    tgtGroup.className = 'properties-field';
    tgtGroup.textContent = `Target: ${wire.targetNode.nodeId}`;
    this.panel.appendChild(tgtGroup);
  }

  /**
   * Update the panel if the currently displayed component was modified.
   */
  onComponentModified(comp) {
    if (this._currentComponent && this._currentComponent.id === comp.id) {
      this._currentComponent = comp;
      this._renderComponentPanel();
    }
  }
}
