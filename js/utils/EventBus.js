/**
 * EventBus — Lightweight publish/subscribe event system.
 *
 * Provides decoupled communication between UI components, the simulation
 * engine, and other modules. Events are string-based, and listeners are
 * called with a single data argument.
 *
 * Usage:
 *   eventBus.on('component-drop', (data) => { ... });
 *   eventBus.emit('component-drop', { type: 'AND', x: 100, y: 200 });
 *
 * Note: emit() iterates over a snapshot of the listeners array so that
 * callbacks can safely call on()/off() for the same event without
 * causing skipped or double-fired listeners.
 */
export class EventBus {
  constructor() {
    /** @type {Object<string, Function[]>} */
    this.listeners = {};
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Emit an event, calling all subscribed listeners.
   * Iterates over a snapshot (slice) of the listeners array to prevent
   * issues if a callback modifies the listener list during iteration.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    // Use slice() to create a snapshot — prevents mutation issues if
    // a callback calls on()/off() for the same event during iteration
    this.listeners[event].slice().forEach(callback => callback(data));
  }

  /**
   * Subscribe to an event for a single invocation only.
   * The listener is automatically removed after being called once.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }
}