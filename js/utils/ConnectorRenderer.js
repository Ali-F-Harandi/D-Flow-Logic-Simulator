/**
 * Static methods for creating connector dots + labels.
 */
export class ConnectorRenderer {
  /**
   * Creates a block element containing a connector dot and a label.
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
    block.style.top = `${dotCenterY - 6}px`;
    if (isInput) block.style.left = '0px';
    else block.style.right = '0px';
    block.style.width = '40px';
    block.style.height = '12px';

    const dot = document.createElement('div');
    dot.className = `connector ${isInput ? 'input' : 'output'}`;
    dot.dataset.node = node.id;
    dot.style.backgroundColor = comp._getStateColor(node.value);
    dot.style.position = 'absolute';
    dot.style.top = '1px';
    if (isInput) dot.style.left = '-5px';
    else dot.style.right = '-5px';

    const label = document.createElement('span');
    label.className = 'connector-label';
    label.textContent = labelText;
    label.style.position = 'absolute';
    label.style.top = '0px';
    if (isInput) label.style.left = '10px';
    else label.style.right = '10px';

    block.appendChild(dot);
    block.appendChild(label);
    return block;
  }
}