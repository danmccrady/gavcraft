import { BLOCK_COLOR, BLOCK_NAME } from '../blocks/blocks.js';
import { HOTBAR_SIZE } from '../inventory/Inventory.js';
import { RECIPES, canCraft, craft } from '../inventory/Crafting.js';
import { MAX_HP, MAX_HUNGER } from '../survival/Health.js';

// Convert a block's hex color to a CSS rgb string
function blockCSS(blockId) {
  const hex = BLOCK_COLOR[blockId];
  if (!hex) return '#333';
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8)  & 0xff;
  const b =  hex        & 0xff;
  return `rgb(${r},${g},${b})`;
}

export class HUD {
  constructor(inventory) {
    this.inventory = inventory;
    this.isOpen = false; // is the inventory/crafting screen open?

    this._buildHotbar();
    this._buildInventoryScreen();

    // Redraw whenever inventory changes
    inventory.onChange(() => this._refresh());

    // Scroll wheel to cycle hotbar
    window.addEventListener('wheel', (e) => {
      if (this.isOpen) return;
      inventory.scrollHotbar(e.deltaY > 0 ? 1 : -1);
    });

    // Number keys 1-9 to select hotbar slot
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        this.toggle();
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) inventory.selectHotbar(num - 1);
    });
  }

  // ── Hotbar ──────────────────────────────────────────────────────────────────

  _buildHotbar() {
    this.hotbarEl = document.getElementById('hotbar');
    this.hotbarSlots = [];

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'hb-slot';

      const preview = document.createElement('div');
      preview.className = 'hb-preview';

      const count = document.createElement('span');
      count.className = 'hb-count';

      const num = document.createElement('span');
      num.className = 'hb-num';
      num.textContent = i + 1;

      slot.appendChild(preview);
      slot.appendChild(count);
      slot.appendChild(num);
      this.hotbarEl.appendChild(slot);
      this.hotbarSlots.push({ slot, preview, count });
    }

    this._refreshHotbar();
  }

  _refreshHotbar() {
    const inv = this.inventory;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const { slot, preview, count } = this.hotbarSlots[i];
      const item = inv.slots[i];

      slot.classList.toggle('selected', i === inv.hotbarIndex);

      if (item) {
        preview.style.background = blockCSS(item.blockId);
        preview.style.opacity = '1';
        count.textContent = item.count > 1 ? item.count : '';
      } else {
        preview.style.background = 'transparent';
        preview.style.opacity = '0';
        count.textContent = '';
      }
    }

    // Show block name above hotbar
    const nameEl = document.getElementById('selected-block-name');
    if (nameEl) {
      const sel = inv.selectedSlot();
      nameEl.textContent = sel ? BLOCK_NAME[sel.blockId] : '';
    }
  }

  // ── Inventory + Crafting Screen ─────────────────────────────────────────────

  _buildInventoryScreen() {
    this.screenEl = document.getElementById('inventory-screen');
    this._buildInventoryGrid();
    this._buildCraftingPanel();
  }

  _buildInventoryGrid() {
    const grid = document.getElementById('inv-grid');
    grid.innerHTML = '';
    this.invSlotEls = [];

    for (let i = 0; i < 36; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (i < HOTBAR_SIZE) slot.classList.add('hotbar-row');

      const preview = document.createElement('div');
      preview.className = 'inv-preview';

      const count = document.createElement('span');
      count.className = 'inv-count';

      slot.appendChild(preview);
      slot.appendChild(count);
      grid.appendChild(slot);
      this.invSlotEls.push({ slot, preview, count });
    }
  }

  _buildCraftingPanel() {
    const panel = document.getElementById('recipe-list');
    panel.innerHTML = '';

    for (const recipe of RECIPES) {
      const row = document.createElement('div');
      row.className = 'recipe-row';

      // Ingredients
      const ingDiv = document.createElement('div');
      ingDiv.className = 'recipe-ingredients';
      for (const [blockId, needed] of Object.entries(recipe.ingredients)) {
        const chip = document.createElement('div');
        chip.className = 'recipe-chip';
        chip.style.background = blockCSS(Number(blockId));
        chip.title = BLOCK_NAME[Number(blockId)];

        const label = document.createElement('span');
        label.textContent = `${needed}x ${BLOCK_NAME[Number(blockId)]}`;
        chip.appendChild(label);
        ingDiv.appendChild(chip);
      }

      // Arrow
      const arrow = document.createElement('span');
      arrow.className = 'recipe-arrow';
      arrow.textContent = '→';

      // Output
      const outDiv = document.createElement('div');
      outDiv.className = 'recipe-output';
      outDiv.style.background = blockCSS(recipe.output.blockId);
      outDiv.title = recipe.name;

      const outLabel = document.createElement('span');
      outLabel.textContent = `${recipe.output.count}x ${recipe.name}`;
      outDiv.appendChild(outLabel);

      // Craft button
      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.dataset.recipeId = recipe.id;
      btn.textContent = 'CRAFT';
      btn.addEventListener('click', () => this._craftRecipe(recipe, btn));

      const desc = document.createElement('p');
      desc.className = 'recipe-desc';
      desc.textContent = recipe.description;

      row.appendChild(ingDiv);
      row.appendChild(arrow);
      row.appendChild(outDiv);
      row.appendChild(btn);
      row.appendChild(desc);
      panel.appendChild(row);
    }

    this.craftBtns = panel.querySelectorAll('.craft-btn');
  }

  _craftRecipe(recipe, btn) {
    if (craft(recipe, this.inventory)) {
      // Flash the button green on success
      btn.textContent = 'CRAFTED!';
      btn.style.background = '#00ff88';
      setTimeout(() => {
        btn.textContent = 'CRAFT';
        btn.style.background = '';
        this._refreshCraftButtons();
      }, 600);
    }
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  _refresh() {
    this._refreshHotbar();
    if (this.isOpen) {
      this._refreshInventorySlots();
      this._refreshCraftButtons();
    }
  }

  _refreshInventorySlots() {
    for (let i = 0; i < 36; i++) {
      const { slot, preview, count } = this.invSlotEls[i];
      const item = this.inventory.slots[i];
      slot.classList.toggle('selected', i === this.inventory.hotbarIndex);

      if (item) {
        preview.style.background = blockCSS(item.blockId);
        preview.style.opacity = '1';
        count.textContent = item.count > 1 ? item.count : '';
      } else {
        preview.style.background = 'transparent';
        preview.style.opacity = '0';
        count.textContent = '';
      }
    }
  }

  _refreshCraftButtons() {
    if (!this.craftBtns) return;
    for (const btn of this.craftBtns) {
      const recipe = RECIPES.find(r => r.id === btn.dataset.recipeId);
      if (!recipe) continue;
      const can = canCraft(recipe, this.inventory);
      btn.disabled = !can;
      btn.style.opacity = can ? '1' : '0.4';
    }
  }

  // ── Open / Close ────────────────────────────────────────────────────────────

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.screenEl.style.display = 'flex';
    this._refreshInventorySlots();
    this._refreshCraftButtons();
    // Release pointer lock so mouse can interact with UI
    document.exitPointerLock();
  }

  close() {
    this.isOpen = false;
    this.screenEl.style.display = 'none';
  }

  // ── Survival bars (health + hunger) ────────────────────────────────────────

  // Call once with the Health instance to wire up survival HUD
  initSurvival(health) {
    this._health = health;
    this._healthBarFill  = document.getElementById('health-bar-fill');
    this._hungerBarFill  = document.getElementById('hunger-bar-fill');
    this._healthHearts   = document.getElementById('health-hearts');
    this._hungerIcons    = document.getElementById('hunger-icons');
    this._damageOverlay  = document.getElementById('damage-overlay');
    this._deathScreen    = document.getElementById('death-screen');
    this._dayLabel       = document.getElementById('day-label');

    health.onChange(() => this._refreshSurvival());
    this._refreshSurvival();
  }

  _refreshSurvival() {
    if (!this._health) return;
    const h  = this._health;

    // Health hearts: 10 hearts = 100 HP
    if (this._healthHearts) {
      const full = Math.ceil(h.hp / 10);
      let html = '';
      for (let i = 0; i < 10; i++) {
        html += `<span class="heart ${i < full ? 'full' : 'empty'}">♥</span>`;
      }
      this._healthHearts.innerHTML = html;
    }

    // Hunger icons: 10 icons = 100 hunger
    if (this._hungerIcons) {
      const full = Math.ceil(h.hunger / 10);
      let html = '';
      for (let i = 0; i < 10; i++) {
        html += `<span class="hunger-icon ${i < full ? 'full' : 'empty'}">◆</span>`;
      }
      this._hungerIcons.innerHTML = html;
    }

    // Red damage flash overlay
    if (this._damageOverlay) {
      this._damageOverlay.style.opacity = h.isFlashing() ? '0.35' : '0';
    }

    // Death screen
    if (this._deathScreen) {
      this._deathScreen.style.display = h.isDead ? 'flex' : 'none';
    }
  }

  // Update time-of-day label (called every frame from main)
  updateDayLabel(isNight, timeString) {
    if (this._dayLabel) {
      this._dayLabel.textContent = isNight ? `☽ ${timeString}` : `☀ ${timeString}`;
      this._dayLabel.style.color = isNight ? '#aabbff' : '#ffdd88';
    }
  }
}
