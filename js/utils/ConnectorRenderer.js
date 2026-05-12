/**
 * Static methods for creating connector dots + labels.
 * Updated with offset connectors: dots are 1 grid size from component body,
 * connected by a short line.
 */
import { GRID_SIZE } from '../config.js';

export class ConnectorRenderer {
  /**
   * Creates a block element containing a connector dot, label, and a short
   * line connecting the dot to the component body edge.
   *
   * Layout:
   *   Input:  [dot]---line---| component body |  label
   *   Output:        label  | component body |---line---[dot]
   *
   * @param {Component} comp - the owning component (for colors and state)
   * @param {Object} node - the input/output node object { id, value }
   * @param {boolean} isInput
   * @param {string} labelText
   * @param {number} dotCenterY - y offset inside the component
   * @returns {HTMLElement}
   */
  static createBlock(comp, node, isInput, labelText, dotCenterY) {
    const block = document.createElement('div');
    block.style.position = 'absolute';
    block.style.top = `${dotCenterY - 4}px`;

    // Feature 4: Check if this input is negated — widen block for inversion bubble
    const isNegated = isInput && comp.isInputNegated && comp.isInputNegated(
      comp.inputs.findIndex(inp => inp.id === node.id)
    );

    // Base width for label area + GRID_SIZE for the offset line
    const baseWidth = isNegated ? 48 : 36;
    const totalWidth = baseWidth + GRID_SIZE;

    if (isInput) {
      block.style.left = `-${GRID_SIZE}px`;
    } else {
      block.style.right = `-${GRID_SIZE}px`;
    }
    block.style.width = `${totalWidth}px`;
    block.style.height = '8px';

    // ─── Connector line (from component body edge to dot area) ───
    const line = document.createElement('div');
    line.className = 'connector-line';
    line.style.position = 'absolute';
    line.style.top = '3px';
    line.style.height = '2px';
    line.style.backgroundColor = 'var(--color-border, #888)';
    line.style.pointerEvents = 'none';

    if (isInput) {
      if (isNegated) {
        // Negated: dot at left: -10px → right edge at x=-2; bubble at left: GRID_SIZE-10
        line.style.left = '0px';
        line.style.width = `${GRID_SIZE - 10}px`;
      } else {
        // Standard: dot at left: -4px → right edge at x=4; component edge at GRID_SIZE
        line.style.left = '4px';
        line.style.width = `${GRID_SIZE - 4}px`;
      }
    } else {
      line.style.left = `${baseWidth}px`;
      line.style.width = `${GRID_SIZE - 4}px`;
    }
    block.appendChild(line);

    // ─── Inversion bubble (if negated input) ───
    if (isNegated) {
      const bubble = document.createElement('div');
      bubble.className = 'inversion-bubble input-bubble';
      // Position bubble at the component body edge (GRID_SIZE from block left)
      bubble.style.left = `${GRID_SIZE - 10}px`;
      block.appendChild(bubble);
    }

    // ─── Connector dot ───
    const dot = document.createElement('div');
    const isBusPort = node.width > 1;
    dot.className = `connector ${isInput ? 'input' : 'output'}${isBusPort ? ' bus-port' : ''}`;
    dot.dataset.node = node.id;
    dot.dataset.width = node.width || 1;
    dot.style.backgroundColor = comp._getStateColor(node.value);
    dot.style.position = 'absolute';
    dot.style.top = '0px';
    if (isInput) {
      dot.style.left = isNegated ? '-10px' : (isBusPort ? '-5px' : '-4px');
    } else {
      dot.style.right = isBusPort ? '-5px' : '-4px';
    }
    block.appendChild(dot);

    // ─── Width indicator label for bus ports ───
    if (isBusPort) {
      const widthLabel = document.createElement('span');
      widthLabel.className = 'connector-width-label';
      widthLabel.textContent = node.width;
      widthLabel.style.position = 'absolute';
      widthLabel.style.top = '-10px';
      widthLabel.style.fontSize = '8px';
      widthLabel.style.color = 'var(--bus-indicator-color, #5b9bd5)';
      widthLabel.style.fontWeight = 'bold';
      widthLabel.style.fontFamily = 'monospace';
      if (isInput) {
        widthLabel.style.left = '-2px';
      } else {
        widthLabel.style.right = '-2px';
      }
      block.appendChild(widthLabel);

      // Make the connector line thicker for bus ports
      line.classList.add('bus-line');
      line.style.height = '3px';
      line.style.top = '2.5px';
    }

    // ─── Label ───
    const label = document.createElement('span');
    label.className = 'connector-label';
    label.textContent = labelText;
    label.style.position = 'absolute';
    label.style.top = '-1px';
    if (isInput) {
      label.style.left = `${GRID_SIZE + (isNegated ? 18 : 8)}px`;
    } else {
      label.style.right = `${GRID_SIZE + 8}px`;
    }
    block.appendChild(label);

    return block;
  }
}
