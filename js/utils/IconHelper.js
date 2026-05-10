/**
 * IconHelper — Thin wrapper around Lucide Icons for creating inline SVG icons.
 *
 * Usage:
 *   import { icon, iconEl, replaceIcons } from '../utils/IconHelper.js';
 *
 *   // Get an SVG element directly:
 *   const svg = iconEl('play', { width: 16, height: 16 });
 *   button.appendChild(svg);
 *   button.appendChild(document.createTextNode(' Run'));
 *
 *   // Or build an <i data-lucide> placeholder string for innerHTML:
 *   const html = icon('save', 'Save');
 *   // => '<i data-lucide="save" class="lucide-icon"></i> Save'
 *   // Then call replaceIcons(container) after inserting into DOM.
 */

/* global lucide */

const DEFAULT_SIZE = 16;

/**
 * Create an SVG element for a Lucide icon name.
 * @param {string} name - Lucide icon name (e.g. 'play', 'save', 'x')
 * @param {object} [attrs] - Override default SVG attributes (width, height, etc.)
 * @returns {SVGElement|null} The SVG element, or null if icon not found
 */
export function iconEl(name, attrs = {}) {
  if (typeof lucide === 'undefined' || !lucide.icons) return null;
  const pascalName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const iconData = lucide.icons[pascalName];
  if (!iconData) return null;

  const size = attrs.width || attrs.height || DEFAULT_SIZE;
  const mergedAttrs = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: String(size),
    height: String(size),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: `lucide-icon lucide-${name}`,
    ...attrs,
  };

  return lucide.createElement(iconData, mergedAttrs);
}

/**
 * Build an innerHTML string with an <i data-lucide> placeholder + optional text.
 * Call `replaceIcons()` after inserting into DOM to render SVGs.
 * @param {string} name - Lucide icon name
 * @param {string} [text] - Optional text after the icon
 * @param {object} [opts] - { size: number, class: string }
 * @returns {string} HTML string
 */
export function icon(name, text, opts = {}) {
  const size = opts.size || DEFAULT_SIZE;
  const cls = opts.class || '';
  const iconHtml = `<i data-lucide="${name}" class="lucide-icon ${cls}" style="width:${size}px;height:${size}px;display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;"></i>`;
  if (text) {
    return `${iconHtml} ${text}`;
  }
  return iconHtml;
}

/**
 * Replace all <i data-lucide="..."> placeholders in a root element with SVG icons.
 * Call this after setting innerHTML that contains icon() placeholders.
 * @param {HTMLElement} [root=document] - Root element to scan
 */
export function replaceIcons(root = document) {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons({ attrs: {}, nameAttr: 'data-lucide' }, root);
  }
}

/**
 * Create an icon-only button content (no text).
 * @param {string} name - Lucide icon name
 * @param {object} [opts] - { size: number, class: string }
 * @returns {string} HTML string with just the icon placeholder
 */
export function iconOnly(name, opts = {}) {
  return icon(name, '', opts);
}
