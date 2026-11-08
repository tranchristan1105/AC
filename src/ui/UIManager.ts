import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { RealTimeClock, type WeatherType } from '../engine/RealTimeClock';
import { RollingWorldShader } from '../engine/RollingWorldShader';
import { WorldGrid } from '../engine/WorldGrid';
import { CritterSpawner } from '../simulation/CritterSpawner';
import { CraftingSystem } from '../simulation/CraftingSystem';
import { DeltaSimulator } from '../simulation/DeltaSimulator';
import { EconomySystem, type TurnipPattern } from '../simulation/EconomySystem';
import type { ActiveVillager } from '../simulation/VillagerAI';

export type ModalTab = 'pocket' | 'diy' | 'shop' | 'miles' | 'critters' | 'stalk' | 'pixel' | 'engine';

export interface UIManagerCallbacks {
  onPlaceFurniture: (itemId: string) => boolean;
  onPickupNearestFurniture: () => boolean;
  onDeliverVillagerGift: (villager: ActiveVillager) => string | null;
  onWeatherOrTimeChanged: () => void;
}

/**
 * Manages HUD, Typewriter Animalese Dialogue Box, Pocket, DIY Workbench,
 * Nook's Cranny Shop, and the NookPhone Multi-App Suite.
 */
export class UIManager {
  private readonly audio: AudioSynthesizer;
  private readonly clock: RealTimeClock;
  private readonly world: WorldGrid;
  private readonly critters: CritterSpawner;
  private readonly economy: EconomySystem;
  private readonly crafting: CraftingSystem;
  private readonly deltaSim: DeltaSimulator;
  private readonly callbacks: UIManagerCallbacks;

  private toastTimer: number | null = null;
  private typewriterTimer: number | null = null;
  private activeModalTab: ModalTab = 'pocket';
  private selectedPixelColor = '#e63946';

  constructor(
    audio: AudioSynthesizer,
    clock: RealTimeClock,
    world: WorldGrid,
    critters: CritterSpawner,
    economy: EconomySystem,
    crafting: CraftingSystem,
    deltaSim: DeltaSimulator,
    callbacks: UIManagerCallbacks
  ) {
    this.audio = audio;
    this.clock = clock;
    this.world = world;
    this.critters = critters;
    this.economy = economy;
    this.crafting = crafting;
    this.deltaSim = deltaSim;
    this.callbacks = callbacks;

    this.bindStaticButtons();
  }

  private bindStaticButtons(): void {
    document.getElementById('btn-open-nookphone')?.addEventListener('click', () => {
      this.audio.playSfx('pop');
      this.openModal('miles');
    });

    document.getElementById('btn-open-pocket')?.addEventListener('click', () => {
      this.audio.playSfx('pop');
      this.openModal('pocket');
    });

    document.getElementById('btn-toggle-audio')?.addEventListener('click', (e) => {
      const nextMuted = !this.audio.getMuted();
      this.audio.setMuted(nextMuted);
      (e.currentTarget as HTMLElement).textContent = nextMuted ? '🔇 Muted' : '🔊 Audio';
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'modal-backdrop') {
        this.closeModal();
      }
    });
  }

  public updateHUD(): void {
    const atm = this.clock.getAtmosphere();
    const weatherIcon = atm.weather === 'rain' ? '🌧️' : atm.isNight ? '🌙' : '☀️';

    const timeEl = document.getElementById('hud-clock-time');
    const dateEl = document.getElementById('hud-clock-date');
    const bellsEl = document.getElementById('hud-bells-val');
    const milesEl = document.getElementById('hud-miles-val');

    if (timeEl) timeEl.textContent = atm.formattedTime;
    if (dateEl) dateEl.textContent = `${weatherIcon} ${atm.formattedDate}`;
    if (bellsEl) bellsEl.textContent = this.economy.bells.toLocaleString();
    if (milesEl) milesEl.textContent = this.economy.miles.toLocaleString();
  }

  public showToast(message: string): void {
    const el = document.getElementById('toast-banner');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.classList.remove('visible');
    }, 3100);
  }

  public openVillagerDialogue(
    villager: ActiveVillager,
    text: string,
    onContinueChat: () => void,
    onClose: () => void
  ): void {
    const overlay = document.getElementById('dialogue-overlay');
    const badge = document.getElementById('dialogue-speaker-badge');
    const textEl = document.getElementById('dialogue-text');
    const actionsEl = document.getElementById('dialogue-actions');

    if (!overlay || !badge || !textEl || !actionsEl) return;

    overlay.classList.add('open');
    badge.textContent = villager.def.name;
    badge.style.background = villager.def.badgeBg;
    badge.style.color = villager.def.badgeText;

    this.typewriteAnimalese(
      text,
      villager.def.basePitch,
      textEl
    );

    actionsEl.innerHTML = '';

    const chatMoreBtn = document.createElement('button');
    chatMoreBtn.className = 'dialogue-btn';
    chatMoreBtn.id = 'btn-dialogue-more';
    chatMoreBtn.textContent = '💬 Chat More';
    chatMoreBtn.onclick = () => {
      this.audio.playSfx('pop');
      onContinueChat();
    };

    const giftBtn = document.createElement('button');
    giftBtn.className = 'dialogue-btn';
    giftBtn.id = 'btn-dialogue-gift';
    giftBtn.textContent = villager.hasQuest ? '🎁 Fulfill Favor (+Bells)' : '🎁 Give Pocket Gift';
    giftBtn.onclick = () => {
      const response = this.callbacks.onDeliverVillagerGift(villager);
      if (response) {
        this.typewriteAnimalese(response, villager.def.basePitch, textEl);
      } else {
        this.showToast('Gather a fruit, bug, or fish in your Pocket first!');
      }
    };

    const byeBtn = document.createElement('button');
    byeBtn.className = 'dialogue-btn secondary';
    byeBtn.id = 'btn-dialogue-close';
    byeBtn.textContent = 'Wave Goodbye';
    byeBtn.onclick = () => {
      if (this.typewriterTimer) window.clearInterval(this.typewriterTimer);
      overlay.classList.remove('open');
      onClose();
    };

    actionsEl.append(chatMoreBtn, giftBtn, byeBtn);
  }

  public openShowcaseBanner(speakerTitle: string, text: string, bg = '#38b06f', color = '#ffffff'): void {
    const overlay = document.getElementById('dialogue-overlay');
    const badge = document.getElementById('dialogue-speaker-badge');
    const textEl = document.getElementById('dialogue-text');
    const actionsEl = document.getElementById('dialogue-actions');
    if (!overlay || !badge || !textEl || !actionsEl) return;

    overlay.classList.add('open');
    badge.textContent = speakerTitle;
    badge.style.background = bg;
    badge.style.color = color;

    this.typewriteAnimalese(text, 370, textEl);

    actionsEl.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.className = 'dialogue-btn';
    okBtn.id = 'btn-showcase-ok';
    okBtn.textContent = 'Awesome!';
    okBtn.onclick = () => {
      if (this.typewriterTimer) window.clearInterval(this.typewriterTimer);
      overlay.classList.remove('open');
    };
    actionsEl.appendChild(okBtn);
  }

  private typewriteAnimalese(text: string, basePitch: number, targetEl: HTMLElement): void {
    if (this.typewriterTimer) {
      window.clearInterval(this.typewriterTimer);
    }
    targetEl.textContent = '';
    const isQuestion = text.trim().endsWith('?');
    const isExclamation = text.trim().endsWith('!');
    let idx = 0;

    this.typewriterTimer = window.setInterval(() => {
      if (idx >= text.length) {
        if (this.typewriterTimer) window.clearInterval(this.typewriterTimer);
        return;
      }
      const ch = text[idx];
      targetEl.textContent += ch;
      if (idx % 2 === 0) {
        this.audio.speakAnimaleseChar(ch, basePitch, idx, isQuestion, isExclamation);
      }
      idx++;
    }, 28);
  }

  public openModal(initialTab: ModalTab): void {
    this.activeModalTab = initialTab;
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;
    backdrop.classList.add('open');
    this.renderModalContent();
  }

  public closeModal(): void {
    document.getElementById('modal-backdrop')?.classList.remove('open');
  }

  private renderModalContent(): void {
    const tabsContainer = document.getElementById('modal-tabs');
    const bodyContainer = document.getElementById('modal-body');
    const titleEl = document.getElementById('modal-title');
    if (!tabsContainer || !bodyContainer || !titleEl) return;

    const tabs: Array<{ id: ModalTab; label: string }> = [
      { id: 'pocket', label: '🎒 Pocket & Decor' },
      { id: 'diy', label: '🔨 DIY Craft' },
      { id: 'shop', label: "🏪 Nook's Cranny" },
      { id: 'miles', label: '✈️ Nook Miles+' },
      { id: 'critters', label: '🦋 Critterpedia' },
      { id: 'stalk', label: '📈 Stalk Market' },
      { id: 'pixel', label: '🎨 Pixel Pro' },
      { id: 'engine', label: '⚙️ Engine & RTC' },
    ];

    tabsContainer.innerHTML = '';
    tabs.forEach((t) => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${this.activeModalTab === t.id ? 'active' : ''}`;
      btn.id = `tab-btn-${t.id}`;
      btn.textContent = t.label;
      btn.onclick = () => {
        this.audio.playSfx('pop');
        this.activeModalTab = t.id;
        this.renderModalContent();
      };
      tabsContainer.appendChild(btn);
    });

    bodyContainer.innerHTML = '';

    if (this.activeModalTab === 'pocket') {
      titleEl.textContent = '🎒 Pocket Inventory & Island Decorator';
      this.renderPocketTab(bodyContainer);
    } else if (this.activeModalTab === 'diy') {
      titleEl.textContent = '🔨 DIY Workbench Recipes';
      this.renderDiyTab(bodyContainer);
    } else if (this.activeModalTab === 'shop') {
      titleEl.textContent = "🏪 Nook's Cranny & Home Mortgage";
      this.renderShopTab(bodyContainer);
    } else if (this.activeModalTab === 'miles') {
      titleEl.textContent = '✈️ Nook Miles+ Mobile Goals';
      this.renderMilesTab(bodyContainer);
    } else if (this.activeModalTab === 'critters') {
      titleEl.textContent = '🦋 Island Critterpedia';
      this.renderCrittersTab(bodyContainer);
    } else if (this.activeModalTab === 'stalk') {
      titleEl.textContent = '📈 Stalk Market Turnip Predictor';
      this.renderStalkMarketTab(bodyContainer);
    } else if (this.activeModalTab === 'pixel') {
      titleEl.textContent = '🎨 Custom Design Pro (16×16 Pixel Path Studio)';
      this.renderPixelStudioTab(bodyContainer);
    } else if (this.activeModalTab === 'engine') {
      titleEl.textContent = '⚙️ Rolling-Log Shader & RTC Simulator Lab';
      this.renderEngineLabTab(bodyContainer);
    }
  }

  private renderPocketTab(container: HTMLElement): void {
    const topBar = document.createElement('div');
    topBar.style.display = 'flex';
    topBar.style.justifyContent = 'space-between';
    topBar.style.alignItems = 'center';
    topBar.style.marginBottom = '12px';
    topBar.innerHTML = `<span style="font-size:0.86rem;font-weight:700;color:var(--ac-ink-muted)">Slots Used: ${this.crafting.slots.length} / ${this.crafting.maxSlots}</span>`;

    const pickupBtn = document.createElement('button');
    pickupBtn.className = 'mini-btn amber';
    pickupBtn.id = 'btn-pickup-furniture';
    pickupBtn.textContent = '📦 Pick Up Nearby Furniture';
    pickupBtn.onclick = () => {
      if (this.callbacks.onPickupNearestFurniture()) {
        this.renderModalContent();
      }
    };
    topBar.appendChild(pickupBtn);
    container.appendChild(topBar);

    const grid = document.createElement('div');
    grid.className = 'pocket-grid';

    if (this.crafting.slots.length === 0) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ac-ink-muted)">Your pockets are empty! Shake trees, hit rocks, or catch fish!</p>`;
    }

    this.crafting.slots.forEach((slot, idx) => {
      const def = this.crafting.getItemDef(slot.itemId);
      if (!def) return;

      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <span class="item-count-badge">×${slot.count}</span>
        <div class="item-icon">${def.icon}</div>
        <div class="item-name">${def.name}</div>
        <div class="item-meta">${def.sellPrice} Bells</div>
      `;

      const row = document.createElement('div');
      row.className = 'card-action-row';

      if (def.placeable) {
        const placeBtn = document.createElement('button');
        placeBtn.className = 'mini-btn';
        placeBtn.id = `btn-place-${idx}`;
        placeBtn.textContent = 'Place Outside';
        placeBtn.onclick = () => {
          if (this.callbacks.onPlaceFurniture(def.id)) {
            this.closeModal();
          }
        };
        row.appendChild(placeBtn);
      }

      const sellBtn = document.createElement('button');
      sellBtn.className = 'mini-btn amber';
      sellBtn.id = `btn-quick-sell-${idx}`;
      sellBtn.textContent = `Sell (+${def.sellPrice})`;
      sellBtn.onclick = () => {
        this.crafting.removeItem(def.id, 1);
        this.economy.bells += def.sellPrice;
        this.audio.playSfx('bells');
        this.updateHUD();
        this.renderModalContent();
      };
      row.appendChild(sellBtn);

      card.appendChild(row);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  private renderDiyTab(container: HTMLElement): void {
    const grid = document.createElement('div');
    grid.className = 'pocket-grid';

    this.crafting.recipes.forEach((recipe) => {
      const canMake = this.crafting.canCraft(recipe);
      const ingSummary = recipe.ingredients
        .map((ing) => {
          const d = this.crafting.getItemDef(ing.itemId);
          const have = this.crafting.getItemCount(ing.itemId);
          return `${d?.name || ing.itemId} (${have}/${ing.count})`;
        })
        .join(', ');

      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">${recipe.icon}</div>
        <div class="item-name">${recipe.name}</div>
        <div class="item-meta">${ingSummary}</div>
      `;

      const craftBtn = document.createElement('button');
      craftBtn.className = 'mini-btn';
      craftBtn.id = `btn-craft-${recipe.id}`;
      craftBtn.disabled = !canMake;
      craftBtn.textContent = canMake ? '🔨 Craft Now!' : 'Need Materials';
      craftBtn.onclick = () => {
        const crafted = this.crafting.craft(recipe);
        if (crafted) {
          this.audio.playSfx('craft');
          const completedTask = this.economy.recordTaskProgress('craft_item', 1);
          if (completedTask) {
            this.showToast(`✈️ Nook Miles+ Complete: ${completedTask.title} (+${completedTask.milesReward} Miles!)`);
          } else {
            this.showToast(`🔨 Crafted ${crafted.name}! Check your Pocket to place it on the island!`);
          }
          this.updateHUD();
          this.renderModalContent();
        }
      };

      card.appendChild(craftBtn);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  private renderShopTab(container: HTMLElement): void {
    // Tom Nook Home Loan Card
    const loanBox = document.createElement('div');
    loanBox.className = 'control-group';
    loanBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="font-family:'Fredoka',sans-serif;font-size:1.05rem;">🏠 Tom Nook Island Home Loan (Lv. ${this.economy.homeLevel})</strong>
          <div style="font-size:0.82rem;color:var(--ac-ink-muted);">Remaining Balance: <strong>${this.economy.homeLoanRemaining.toLocaleString()} Bells</strong></div>
        </div>
        <button id="btn-pay-loan" class="mini-btn amber">Pay 1,000 Bells</button>
      </div>
    `;
    container.appendChild(loanBox);

    loanBox.querySelector('#btn-pay-loan')?.addEventListener('click', () => {
      if (this.economy.bells < 100) {
        this.showToast('Sell some fish, fruit, or fossils to earn Bells first!');
        return;
      }
      const res = this.economy.payHomeLoan(Math.min(1000, this.economy.bells));
      this.audio.playSfx('bells');
      if (res.upgraded) {
        this.showToast(`🎉 Home Loan Paid Off! Upgraded to Island Home Level ${this.economy.homeLevel}!`);
      } else {
        this.showToast(`Paid ${res.paid.toLocaleString()} Bells toward your island home!`);
      }
      this.updateHUD();
      this.renderModalContent();
    });

    // Sell All Pocket Items button + Catalog Furniture
    const shopItems = ['campfire', 'log_bench', 'garden_lantern', 'picnic_set', 'zen_fountain'];
    const grid = document.createElement('div');
    grid.className = 'pocket-grid';

    shopItems.forEach((id) => {
      const def = this.crafting.getItemDef(id);
      if (!def) return;

      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-icon">${def.icon}</div>
        <div class="item-name">${def.name}</div>
        <div class="item-meta">Buy: ${def.buyPrice} Bells</div>
      `;

      const buyBtn = document.createElement('button');
      buyBtn.className = 'mini-btn';
      buyBtn.id = `btn-buy-${def.id}`;
      buyBtn.disabled = this.economy.bells < def.buyPrice;
      buyBtn.textContent = `Buy (${def.buyPrice})`;
      buyBtn.onclick = () => {
        if (this.economy.bells >= def.buyPrice && this.crafting.addItem(def.id, 1)) {
          this.economy.bells -= def.buyPrice;
          this.audio.playSfx('bells');
          this.showToast(`Purchased ${def.name}!`);
          this.updateHUD();
          this.renderModalContent();
        }
      };

      card.appendChild(buyBtn);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  private renderMilesTab(container: HTMLElement): void {
    this.economy.milesTasks.forEach((task) => {
      const pct = Math.round((task.progress / task.target) * 100);
      const row = document.createElement('div');
      row.className = 'control-group';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:800;font-size:0.95rem;">${task.icon} ${task.title}</div>
          <span style="background:${task.completed ? 'var(--ac-leaf)' : '#dff6f2'};color:${task.completed ? '#fff' : '#135c51'};padding:3px 10px;border-radius:999px;font-size:0.78rem;font-weight:800;">
            ${task.completed ? '✓ Claimed' : `+${task.milesReward} Miles`}
          </span>
        </div>
        <div style="margin-top:8px;background:#e9dec5;height:10px;border-radius:999px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:var(--ac-nook-teal);transition:width 0.25s ease;"></div>
        </div>
        <div style="font-size:0.75rem;color:var(--ac-ink-muted);margin-top:4px;">Progress: ${task.progress} / ${task.target}</div>
      `;
      container.appendChild(row);
    });
  }

  private renderCrittersTab(container: HTMLElement): void {
    const grid = document.createElement('div');
    grid.className = 'pocket-grid';

    this.critters.registry.forEach((c) => {
      const caught = this.critters.caughtCounts[c.id] || 0;
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <span class="item-count-badge" style="background:${caught > 0 ? 'var(--ac-leaf)' : '#94a3b8'}">
          ${caught > 0 ? `Caught ×${caught}` : 'Undiscovered'}
        </span>
        <div class="item-icon">${c.icon}</div>
        <div class="item-name">${c.name}</div>
        <div class="item-meta">${c.habitat.toUpperCase()} • ${c.bellValue} Bells</div>
      `;
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  private renderStalkMarketTab(container: HTMLElement): void {
    const currentSell = this.economy.getCurrentTurnipSellPrice();
    const ownedBundles = this.crafting.getItemCount('turnips');

    const top = document.createElement('div');
    top.className = 'control-group';
    top.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-weight:800;font-size:0.95rem;">Active Markov Pattern: <span style="color:var(--ac-leaf)">${this.economy.turnipPattern}</span></div>
          <div style="font-size:0.82rem;color:var(--ac-ink-muted)">Sunday Buy: <strong>${this.economy.turnipBuyPrice} Bells</strong> • Current Offer (${this.economy.turnipWeeklySlots[this.economy.currentSlotIndex].label}): <strong>${currentSell} Bells</strong> • Owned: <strong>${ownedBundles} bundles</strong></div>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="btn-buy-turnip" class="mini-btn">Buy Bundle (${this.economy.turnipBuyPrice})</button>
          <button id="btn-sell-turnip" class="mini-btn amber" ${ownedBundles <= 0 ? 'disabled' : ''}>Sell Bundle (${currentSell})</button>
        </div>
      </div>
    `;
    container.appendChild(top);

    const chart = document.createElement('div');
    chart.className = 'turnip-chart';
    const maxPrice = Math.max(...this.economy.turnipWeeklySlots.map((s) => s.price), 200);

    this.economy.turnipWeeklySlots.forEach((slot, idx) => {
      const hPct = Math.max(12, Math.round((slot.price / maxPrice) * 100));
      const col = document.createElement('div');
      col.className = 'turnip-bar-col';
      col.style.cursor = 'pointer';
      col.title = `${slot.label}: ${slot.price} Bells`;
      col.innerHTML = `
        <div style="font-size:0.62rem;font-weight:800;margin-bottom:2px;">${slot.price}</div>
        <div class="turnip-bar ${idx === this.economy.currentSlotIndex ? 'current' : ''}" style="height:${hPct}%"></div>
        <div class="turnip-bar-label">${slot.label}</div>
      `;
      col.onclick = () => {
        this.economy.currentSlotIndex = idx;
        this.renderModalContent();
      };
      chart.appendChild(col);
    });
    container.appendChild(chart);

    // Pattern switcher buttons
    const patternRow = document.createElement('div');
    patternRow.style.display = 'flex';
    patternRow.style.gap = '6px';
    patternRow.style.flexWrap = 'wrap';
    (['Large Spike', 'Small Spike', 'Fluctuating', 'Decreasing'] as TurnipPattern[]).forEach((pat) => {
      const b = document.createElement('button');
      b.className = `tab-btn ${this.economy.turnipPattern === pat ? 'active' : ''}`;
      b.textContent = pat;
      b.onclick = () => {
        this.economy.generateTurnipWeek(pat);
        this.renderModalContent();
      };
      patternRow.appendChild(b);
    });
    container.appendChild(patternRow);

    top.querySelector('#btn-buy-turnip')?.addEventListener('click', () => {
      if (this.economy.bells >= this.economy.turnipBuyPrice && this.crafting.addItem('turnips', 1)) {
        this.economy.bells -= this.economy.turnipBuyPrice;
        this.audio.playSfx('bells');
        this.updateHUD();
        this.renderModalContent();
      }
    });

    top.querySelector('#btn-sell-turnip')?.addEventListener('click', () => {
      if (this.crafting.removeItem('turnips', 1)) {
        this.economy.bells += currentSell;
        this.audio.playSfx('bells');
        this.showToast(`Sold Turnip Bundle at ${currentSell} Bells!`);
        this.updateHUD();
        this.renderModalContent();
      }
    });
  }

  private renderPixelStudioTab(container: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'pixel-studio-layout';

    const sourceCanvas = this.world.getCustomDesignCanvas();
    const editorCanvas = document.createElement('canvas');
    editorCanvas.width = 16;
    editorCanvas.height = 16;
    editorCanvas.className = 'pixel-grid-canvas';
    const eCtx = editorCanvas.getContext('2d')!;
    eCtx.drawImage(sourceCanvas, 0, 0);

    const paintAt = (clientX: number, clientY: number) => {
      const rect = editorCanvas.getBoundingClientRect();
      const px = Math.floor(((clientX - rect.left) / rect.width) * 16);
      const py = Math.floor(((clientY - rect.top) / rect.height) * 16);
      if (px >= 0 && px < 16 && py >= 0 && py < 16) {
        const sCtx = sourceCanvas.getContext('2d')!;
        sCtx.fillStyle = this.selectedPixelColor;
        sCtx.fillRect(px, py, 1, 1);
        eCtx.drawImage(sourceCanvas, 0, 0);
        this.world.notifyCustomDesignUpdated();
      }
    };

    let drawing = false;
    editorCanvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      paintAt(e.clientX, e.clientY);
    });
    editorCanvas.addEventListener('pointermove', (e) => {
      if (drawing) paintAt(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => {
      drawing = false;
    });

    const rightCol = document.createElement('div');
    rightCol.innerHTML = `<div style="font-weight:800;margin-bottom:8px;">Select Palette Color:</div>`;
    const palette = document.createElement('div');
    palette.className = 'palette-swatches';
    const colors = [
      '#e63946',
      '#f77f00',
      '#fcbf49',
      '#52b788',
      '#2a9d8f',
      '#3a86ff',
      '#8338ec',
      '#ff99c8',
      '#d4a373',
      '#8d5524',
      '#fefae0',
      '#2b2d42',
    ];

    colors.forEach((col) => {
      const sw = document.createElement('button');
      sw.className = `swatch-btn ${this.selectedPixelColor === col ? 'active' : ''}`;
      sw.style.background = col;
      sw.onclick = () => {
        this.selectedPixelColor = col;
        this.renderModalContent();
      };
      palette.appendChild(sw);
    });

    const hint = document.createElement('p');
    hint.style.fontSize = '0.82rem';
    hint.style.color = 'var(--ac-ink-muted)';
    hint.style.maxWidth = '230px';
    hint.style.marginTop = '12px';
    hint.textContent =
      'Draw on the 16×16 canvas! Equip the 🎨 Design Brush tool on the bottom bar to stamp your custom pixel path anywhere on the island!';

    rightCol.append(palette, hint);
    wrapper.append(editorCanvas, rightCol);
    container.appendChild(wrapper);
  }

  private renderEngineLabTab(container: HTMLElement): void {
    const curStrength = RollingWorldShader.getCurveStrength();
    const curOffset = this.clock.getTimeOffsetHours();
    const curWeather = this.clock.getWeather();

    const box = document.createElement('div');
    box.innerHTML = `
      <div class="control-group">
        <label>
          <span>🌍 Rolling-Log Vertex Shader Curvature (k)</span>
          <span id="lbl-curve-val">${curStrength.toFixed(3)}</span>
        </label>
        <input id="slider-curve" type="range" min="0" max="0.06" step="0.002" value="${curStrength}" />
        <div style="font-size:0.76rem;color:var(--ac-ink-muted);margin-top:4px;">
          0.000 = Flat Cartesian Grid • 0.024 = New Horizons Curve • 0.052 = Wild World Cylinder
        </div>
      </div>

      <div class="control-group">
        <label>
          <span>⏰ Real-Time Clock Time-Travel Offset</span>
          <span id="lbl-time-offset">${curOffset >= 0 ? `+${curOffset}` : curOffset} Hours</span>
        </label>
        <input id="slider-time" type="range" min="-12" max="12" step="0.5" value="${curOffset}" />
        <div style="font-size:0.76rem;color:var(--ac-ink-muted);margin-top:4px;">
          Slide to preview Sunrise, High Noon, Golden Hour, or Starry Night lighting & fireflies!
        </div>
      </div>

      <div class="control-group">
        <label><span>🌦️ Island Weather Override</span></label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button id="btn-weather-clear" class="tab-btn ${curWeather === 'clear' ? 'active' : ''}">☀️ Clear Sky</button>
          <button id="btn-weather-rain" class="tab-btn ${curWeather === 'rain' ? 'active' : ''}">🌧️ Rain (Coelacanth Active)</button>
        </div>
      </div>

      <div class="control-group" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:800;font-size:0.9rem;">🌅 05:00 AM Daily Rollover Delta Simulator</div>
          <div style="font-size:0.76rem;color:var(--ac-ink-muted);">Regrows harvested fruit trees, resets rock hits, buries fossils & steps Stalk Market.</div>
        </div>
        <button id="btn-sim-rollover" class="mini-btn amber">Simulate 5 AM Rollover</button>
      </div>
    `;

    container.appendChild(box);

    const curveSlider = box.querySelector('#slider-curve') as HTMLInputElement;
    curveSlider?.addEventListener('input', () => {
      const val = parseFloat(curveSlider.value);
      RollingWorldShader.setCurveStrength(val);
      const lbl = box.querySelector('#lbl-curve-val');
      if (lbl) lbl.textContent = val.toFixed(3);
    });

    const timeSlider = box.querySelector('#slider-time') as HTMLInputElement;
    timeSlider?.addEventListener('input', () => {
      const val = parseFloat(timeSlider.value);
      this.clock.setTimeOffsetHours(val);
      const lbl = box.querySelector('#lbl-time-offset');
      if (lbl) lbl.textContent = `${val >= 0 ? `+${val}` : val} Hours`;
      this.callbacks.onWeatherOrTimeChanged();
      this.updateHUD();
    });

    box.querySelector('#btn-weather-clear')?.addEventListener('click', () => {
      this.clock.setWeather('clear' as WeatherType);
      this.callbacks.onWeatherOrTimeChanged();
      this.updateHUD();
      this.renderModalContent();
    });

    box.querySelector('#btn-weather-rain')?.addEventListener('click', () => {
      this.clock.setWeather('rain' as WeatherType);
      this.callbacks.onWeatherOrTimeChanged();
      this.updateHUD();
      this.renderModalContent();
    });

    box.querySelector('#btn-sim-rollover')?.addEventListener('click', () => {
      const rep = this.deltaSim.triggerDailyRollover(this.world, this.economy);
      this.audio.playSfx('fanfare');
      this.showToast(
        `🌅 5:00 AM Rollover: +${rep.fruitsRegrown} Trees Regrown, Rocks Reset, Turnips @ ${rep.newTurnipPrice} Bells!`
      );
      this.updateHUD();
    });
  }
}
