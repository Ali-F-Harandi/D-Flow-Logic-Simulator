/**
 * GateRendererMixin — DEPRECATED
 *
 * This mixin was originally used to add a render() method to gate classes.
 * Since GateBase now provides its own render() method (which is used by all
 * gate subclasses), this mixin is no longer needed. It is kept only as a
 * reference and should NOT be applied to any class.
 *
 * All gate rendering is now handled by:
 *   - GateBase.render()  — for AND, OR, NAND, NOR, XOR, XNOR gates
 *   - Individual component render() methods for flip-flops, IO, etc.
 */

// Intentionally empty — rendering logic moved to GateBase.render()
