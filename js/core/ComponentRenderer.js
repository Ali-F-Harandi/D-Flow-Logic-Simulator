import { ComponentLayoutPolicy } from './ComponentLayoutPolicy.js';

/**
 * Template methods for common DOM rendering patterns.
 * Reduces each component render() method to 3-5 lines of configuration.
 */
export class ComponentRenderer {

  /**
   * Render a labeled box with connectors (standard gate/flip-flop/chip pattern).
   */
  static renderLabeledBox(comp, container, options = {}) {
    const {
      labelText = comp.type,
      extraClasses = [],
      bodyClass = 'component-body-centered'
    } = options;

    const dims = ComponentLayoutPolicy.computeDimensions(
      comp.inputs.length, comp.outputs.length, comp.type
    );

    const el = document.createElement('div');
    el.className = `component ${[...extraClasses].join(' ')}`;
    el.style.width = `${dims.width}px`;
    el.style.height = `${dims.height}px`;
    el.style.left = `${comp.position.x}px`;
    el.style.top = `${comp.position.y}px`;
    el.setAttribute('draggable', 'false');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', labelText);
    el.draggable = false;

    const body = document.createElement('div');
    body.className = bodyClass;
    body.textContent = labelText;
    el.appendChild(body);

    // Input connectors
    for (let i = 0; i < comp.inputs.length; i++) {
      const y = ComponentLayoutPolicy.getInputY(i, comp.inputs.length, dims.height);
      el.appendChild(comp._createConnectorBlock(comp.inputs[i], true, `I${i}`, y));
    }

    // Output connectors
    for (let i = 0; i < comp.outputs.length; i++) {
      const y = ComponentLayoutPolicy.getOutputY(i, comp.outputs.length, dims.height);
      el.appendChild(comp._createConnectorBlock(comp.outputs[i], false, `O${i}`, y));
    }

    container.appendChild(el);
    comp.element = el;
    comp.container = container;
    comp._updateConnectorStates();
    return el;
  }
}
