/**
 * Value.js — Multi-valued logic signal system inspired by Logisim-Evolution.
 *
 * Supports four signal states per bit:
 *   FALSE  (0) — Logic LOW
 *   TRUE   (1) — Logic HIGH
 *   UNKNOWN (X) — Unknown / uninitialized
 *   ERROR  (E)  — Conflict / error (multiple drivers disagree)
 *
 * Also supports multi-bit values (buses) up to 32 bits wide.
 *
 * This replaces the simple boolean/null system previously used in D-Flow,
 * enabling proper bus support, conflict detection, and unknown-state
 * propagation — just like Logisim-Evolution's Value class.
 */

export class Value {
  /**
   * @param {number} width - Bit width (1 for single-bit signals)
   * @param {number} error  - Bitmask of error bits
   * @param {number} unknown - Bitmask of unknown bits
   * @param {number} value  - Bitmask of known-1 bits
   */
  constructor(width, error = 0, unknown = 0, value = 0) {
    this.width = width;
    this.error = error;
    this.unknown = unknown;
    this.value = value;
  }

  // ── Singleton single-bit values ────────────────────────────────────
  static FALSE  = new Value(1, 0, 0, 0);
  static TRUE   = new Value(1, 0, 0, 1);
  static UNKNOWN = new Value(1, 0, 1, 0);
  static ERROR  = new Value(1, 1, 0, 0);
  static NIL    = new Value(0, 0, 0, 0);   // No-value / disconnected

  static MAX_WIDTH = 32;

  // ── Factory methods ────────────────────────────────────────────────

  /**
   * Create a known value of given width.
   * @param {number} width
   * @param {number} val - The numeric value
   * @returns {Value}
   */
  static createKnown(width, val) {
    if (width === 0) return Value.NIL;
    if (width === 1) return (val & 1) ? Value.TRUE : Value.FALSE;
    const mask = width >= 32 ? 0xFFFFFFFF : ~(-1 << width);
    return new Value(width, 0, 0, val & mask);
  }

  /**
   * Create an unknown value of given width (all bits X).
   * @param {number} width
   * @returns {Value}
   */
  static createUnknown(width) {
    if (width === 0) return Value.NIL;
    if (width === 1) return Value.UNKNOWN;
    const mask = width >= 32 ? 0xFFFFFFFF : ~(-1 << width);
    return new Value(width, 0, mask, 0);
  }

  /**
   * Create an error value of given width (all bits E).
   * @param {number} width
   * @returns {Value}
   */
  static createError(width) {
    if (width === 0) return Value.NIL;
    if (width === 1) return Value.ERROR;
    const mask = width >= 32 ? 0xFFFFFFFF : ~(-1 << width);
    return new Value(width, mask, 0, 0);
  }

  /**
   * Create a Value from a JS boolean (single-bit).
   * @param {boolean|null} b
   * @returns {Value}
   */
  static fromBoolean(b) {
    if (b === true) return Value.TRUE;
    if (b === false) return Value.FALSE;
    return Value.UNKNOWN; // null or undefined
  }

  /**
   * Convert a Value to a JS boolean (for backward compat).
   * Returns null for UNKNOWN/ERROR, true for TRUE, false for FALSE.
   * For multi-bit values, returns true if any bit is set.
   */
  toBoolean() {
    if (this.width === 0) return null;
    if (this.error) return null;
    if (this.unknown) return null;
    return this.value !== 0;
  }

  // ── Bit access ─────────────────────────────────────────────────────

  /**
   * Get the value of a specific bit.
   * @param {number} which - Bit index (0 = LSB)
   * @returns {Value} Single-bit Value
   */
  get(which) {
    if (which < 0 || which >= this.width) return Value.ERROR;
    const mask = 1 << which;
    if ((this.error & mask) !== 0) return Value.ERROR;
    if ((this.unknown & mask) !== 0) return Value.UNKNOWN;
    if ((this.value & mask) !== 0) return Value.TRUE;
    return Value.FALSE;
  }

  /**
   * Set a specific bit to a single-bit Value.
   * @param {number} which - Bit index
   * @param {Value} val - Single-bit Value
   * @returns {Value} New Value with the bit set
   */
  set(which, val) {
    if (val.width !== 1) throw new Error('Can only set single-bit values');
    if (which < 0 || which >= this.width) throw new Error('Bit index out of range');
    const mask = ~(1 << which);
    return new Value(
      this.width,
      (this.error & mask) | (val.error << which),
      (this.unknown & mask) | (val.unknown << which),
      (this.value & mask) | (val.value << which)
    );
  }

  // ── Logical operations ─────────────────────────────────────────────

  /**
   * AND operation. FALSE dominates; TRUE & TRUE = TRUE; otherwise ERROR.
   * @param {Value} other
   * @returns {Value}
   */
  and(other) {
    if (other == null) return this;
    if (this.width === 1 && other.width === 1) {
      if (this === Value.FALSE || other === Value.FALSE) return Value.FALSE;
      if (this === Value.TRUE && other === Value.TRUE) return Value.TRUE;
      return Value.ERROR;
    }
    const w = Math.max(this.width, other.width);
    const falses = (~this.value & ~this.error & ~this.unknown) | (~other.value & ~other.error & ~other.unknown);
    return new Value(
      w,
      (this.error | other.error | this.unknown | other.unknown) & ~falses,
      0,
      this.value & other.value
    );
  }

  /**
   * OR operation. TRUE dominates; FALSE | FALSE = FALSE; otherwise ERROR.
   * @param {Value} other
   * @returns {Value}
   */
  or(other) {
    if (other == null) return this;
    if (this.width === 1 && other.width === 1) {
      if (this === Value.TRUE || other === Value.TRUE) return Value.TRUE;
      if (this === Value.FALSE && other === Value.FALSE) return Value.FALSE;
      return Value.ERROR;
    }
    const w = Math.max(this.width, other.width);
    const trues = (this.value & ~this.error & ~this.unknown) | (other.value & ~other.error & ~other.unknown);
    return new Value(
      w,
      (this.error | other.error | this.unknown | other.unknown) & ~trues,
      0,
      this.value | other.value
    );
  }

  /**
   * NOT operation. Inverts known bits; unknown/error remain error.
   * @returns {Value}
   */
  not() {
    if (this.width <= 1) {
      if (this === Value.TRUE) return Value.FALSE;
      if (this === Value.FALSE) return Value.TRUE;
      return Value.ERROR;
    }
    const mask = this.width >= 32 ? 0xFFFFFFFF : ~(-1 << this.width);
    return new Value(this.width, this.error | this.unknown, 0, (~this.value) & mask);
  }

  /**
   * XOR operation.
   * @param {Value} other
   * @returns {Value}
   */
  xor(other) {
    if (other == null) return this;
    if (this.width <= 1 && other.width <= 1) {
      if (this === Value.ERROR || other === Value.ERROR) return Value.ERROR;
      if (this === Value.UNKNOWN || other === Value.UNKNOWN) return Value.ERROR;
      if (this === Value.NIL || other === Value.NIL) return Value.ERROR;
      return ((this === Value.TRUE) === (other === Value.TRUE)) ? Value.FALSE : Value.TRUE;
    }
    return new Value(
      Math.max(this.width, other.width),
      this.error | other.error | this.unknown | other.unknown,
      0,
      this.value ^ other.value
    );
  }

  /**
   * Combine two values on the same wire (bus value resolution).
   * If they agree, returns the agreed value. If they conflict, returns ERROR.
   * This is Logisim's "wired-OR" / conflict detection.
   * @param {Value} other
   * @returns {Value}
   */
  combine(other) {
    if (other == null) return this;
    if (this === Value.NIL) return other;
    if (other === Value.NIL) return this;
    if (this.width === 1 && other.width === 1) {
      if (this === other) return this;
      if (this === Value.UNKNOWN) return other;
      if (other === Value.UNKNOWN) return this;
      return Value.ERROR;
    }
    if (this.width === other.width) {
      const disagree = (this.value ^ other.value) & ~(this.unknown | other.unknown);
      return new Value(
        this.width,
        this.error | other.error | disagree,
        this.unknown & other.unknown,
        this.value | other.value
      );
    }
    // Width mismatch
    return Value.createError(Math.max(this.width, other.width));
  }

  /**
   * Tri-state control: If this (control) is TRUE, return other; if FALSE,
   * return all-unknown; if ERROR, return all-error.
   * This is how Logisim handles tri-state buffers.
   * @param {Value} other - The data to pass or block
   * @returns {Value}
   */
  controls(other) {
    if (other == null) return null;
    if (this.width === 1) {
      if (this === Value.FALSE) return Value.createUnknown(other.width);
      if (this === Value.TRUE || this === Value.UNKNOWN) return other;
      return Value.createError(other.width);
    }
    return Value.createError(other.width);
  }

  // ── Query methods ──────────────────────────────────────────────────

  isErrorValue() { return this.error !== 0; }
  isUnknown() {
    const mask = this.width >= 32 ? 0xFFFFFFFF : ((1 << this.width) - 1);
    return this.error === 0 && (this.unknown & mask) === mask;
  }
  isFullyDefined() { return this.width > 0 && this.error === 0 && this.unknown === 0; }

  /**
   * Get the numeric value (only valid if fully defined).
   * @returns {number}
   */
  toLongValue() {
    if (this.error || this.unknown) return -1;
    const mask = this.width >= 32 ? 0xFFFFFFFF : ~(-1 << this.width);
    return (this.value & mask) >>> 0;
  }

  // ── Comparison ─────────────────────────────────────────────────────

  equals(other) {
    if (!(other instanceof Value)) return false;
    return this.width === other.width
      && this.error === other.error
      && this.unknown === other.unknown
      && this.value === other.value;
  }

  static equal(a, b) {
    if ((a == null || a === Value.NIL) && (b == null || b === Value.NIL)) return true;
    if (a != null && b != null && a.equals(b)) return true;
    return false;
  }

  // ── Display ────────────────────────────────────────────────────────

  toString() {
    if (this.width === 0) return 'Z';
    if (this.width === 1) {
      if (this.error) return 'E';
      if (this.unknown) return 'X';
      return this.value ? '1' : '0';
    }
    let ret = '';
    for (let i = this.width - 1; i >= 0; i--) {
      ret += this.get(i).toString();
    }
    return ret;
  }

  toDisplayString() {
    return this.toString();
  }

  /**
   * Returns a hex string representation like "0xFF".
   * Only meaningful for fully defined values.
   * @returns {string}
   */
  toHexString() {
    if (this.width === 0) return 'Z';
    if (this.error || this.unknown) return '0x' + 'X'.repeat(Math.ceil(this.width / 4));
    // Ensure value is treated as unsigned by masking to width
    const mask = this.width >= 32 ? 0xFFFFFFFF : ~(-1 << this.width);
    const unsignedVal = this.value & mask;
    return '0x' + (unsignedVal >>> 0).toString(16).toUpperCase().padStart(Math.ceil(this.width / 4), '0');
  }

  /**
   * Returns a decimal string representation.
   * Only meaningful for fully defined values.
   * @returns {string}
   */
  toDecimalString() {
    if (this.width === 0) return 'Z';
    if (this.error || this.unknown) return '?';
    const mask = this.width >= 32 ? 0xFFFFFFFF : ~(-1 << this.width);
    return ((this.value & mask) >>> 0).toString(10);
  }

  /**
   * Returns a binary string representation with width padding like "00001010".
   * @returns {string}
   */
  toBinaryString() {
    if (this.width === 0) return 'Z';
    if (this.width === 1) {
      if (this.error) return 'E';
      if (this.unknown) return 'X';
      return this.value ? '1' : '0';
    }
    let ret = '';
    for (let i = this.width - 1; i >= 0; i--) {
      ret += this.get(i).toString();
    }
    return ret;
  }

  /**
   * Check if a value is a Value instance.
   * @param {*} v
   * @returns {boolean}
   */
  static isValue(v) {
    return v instanceof Value;
  }
}
