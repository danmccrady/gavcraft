export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36; // 9 hotbar + 27 storage
export const MAX_STACK = 64;

export class Inventory {
  constructor() {
    // Each slot is either null (empty) or { blockId, count }
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.hotbarIndex = 0;  // which hotbar slot is selected (0-8)

    // Slots in this set never run out when placed
    this.infiniteSlots = new Set();

    // Listeners get called whenever the inventory changes
    this._onChange = [];
  }

  // Register a callback for when inventory changes
  onChange(fn) {
    this._onChange.push(fn);
  }

  _notify() {
    for (const fn of this._onChange) fn();
  }

  // Add items — returns how many couldn't fit (0 = all fit)
  add(blockId, count = 1) {
    // First, stack onto existing matching slots
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = this.slots[i];
      if (slot && slot.blockId === blockId && slot.count < MAX_STACK) {
        const canAdd = Math.min(count, MAX_STACK - slot.count);
        slot.count += canAdd;
        count -= canAdd;
        if (count === 0) { this._notify(); return 0; }
      }
    }
    // Then fill empty slots
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (!this.slots[i]) {
        const canAdd = Math.min(count, MAX_STACK);
        this.slots[i] = { blockId, count: canAdd };
        count -= canAdd;
        if (count === 0) { this._notify(); return 0; }
      }
    }
    this._notify();
    return count; // leftover that didn't fit
  }

  // Remove `count` of `blockId` from anywhere in inventory
  // Returns true if successful, false if not enough
  remove(blockId, count = 1) {
    // Check we have enough first
    if (this.countOf(blockId) < count) return false;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = this.slots[i];
      if (slot && slot.blockId === blockId) {
        const take = Math.min(slot.count, count);
        slot.count -= take;
        count -= take;
        if (slot.count === 0) this.slots[i] = null;
        if (count === 0) break;
      }
    }
    this._notify();
    return true;
  }

  // How many of a blockId does the player have?
  countOf(blockId) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.blockId === blockId) total += slot.count;
    }
    return total;
  }

  // The currently selected hotbar slot (may be null)
  selectedSlot() {
    return this.slots[this.hotbarIndex];
  }

  // The blockId the player is holding (null if empty hand)
  selectedBlockId() {
    return this.selectedSlot()?.blockId ?? null;
  }

  // Use 1 of the selected block (for placing)
  consumeSelected() {
    if (this.infiniteSlots.has(this.hotbarIndex)) return true; // infinite — never runs out
    const slot = this.slots[this.hotbarIndex];
    if (!slot) return false;
    slot.count--;
    if (slot.count === 0) this.slots[this.hotbarIndex] = null;
    this._notify();
    return true;
  }

  // Scroll the hotbar selection
  scrollHotbar(delta) {
    this.hotbarIndex = ((this.hotbarIndex + delta) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE;
    this._notify();
  }

  // Jump to hotbar slot by number (0-indexed)
  selectHotbar(index) {
    if (index >= 0 && index < HOTBAR_SIZE) {
      this.hotbarIndex = index;
      this._notify();
    }
  }
}
