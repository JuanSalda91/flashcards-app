/* app.js
   Accessible modal component and in-memory deck CRUD
*/
(function () {
  // Utility: create element from HTML
  function createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  // Modal class: focus trap, ESC to close, return focus to opener
  class Modal {
    constructor() {
      this._build();
      this._boundKeydown = this._keydownHandler.bind(this);
      this._focusableSelector = [
        'a[href]', 'area[href]', 'input:not([disabled])', 'select:not([disabled])',
        'textarea:not([disabled])', 'button:not([disabled])', 'iframe', 'object',
        'embed', '[contenteditable]', '[tabindex]:not([tabindex="-1"])'
      ].join(',');
    }

    _build() {
      this.overlay = document.createElement('div');
      this.overlay.className = 'modal-overlay';
      this.overlay.setAttribute('role', 'presentation');
      this.overlay.style.display = 'none';

      this.dialog = document.createElement('div');
      this.dialog.className = 'modal-dialog';
      this.dialog.setAttribute('role', 'dialog');
      this.dialog.setAttribute('aria-modal', 'true');
      this.dialog.setAttribute('tabindex', '-1');

      this.content = document.createElement('div');
      this.content.className = 'modal-content';

      this.dialog.appendChild(this.content);
      this.overlay.appendChild(this.dialog);
      document.body.appendChild(this.overlay);

      // click on overlay closes
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }

    open({ opener = null, content = null, onClose = null, title = '' } = {}) {
      this.opener = opener || document.activeElement;
      this.onClose = onClose;

      // set content
      if (typeof content === 'string') {
        this.content.innerHTML = content;
      } else if (content instanceof Node) {
        this.content.innerHTML = '';
        this.content.appendChild(content);
      } else {
        this.content.innerHTML = '';
      }

      if (title) this.dialog.setAttribute('aria-label', title);

      // show
      this.overlay.style.display = 'block';
      document.body.classList.add('modal-open');

      // save focusable elements
      this._focusable = Array.from(this.dialog.querySelectorAll(this._focusableSelector));
      // focus first focusable or dialog
      const first = this._focusable[0] || this.dialog;
      setTimeout(() => first.focus(), 0);

      document.addEventListener('keydown', this._boundKeydown);
    }

    close(result = null) {
      document.removeEventListener('keydown', this._boundKeydown);
      this.overlay.style.display = 'none';
      document.body.classList.remove('modal-open');
      if (this.opener && typeof this.opener.focus === 'function') this.opener.focus();
      if (typeof this.onClose === 'function') this.onClose(result);
    }

    _keydownHandler(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }

      if (e.key === 'Tab') {
        // focus trap
        const focusable = this._focusable;
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
  }

  // Deck manager with in-memory array
  class DeckManager {
    constructor(studyMode = null) {
      // Try to load saved state
      const savedState = loadState();
      if (savedState && savedState.decks && savedState.decks.length > 0) {
        this.decks = savedState.decks;
        this.currentDeckId = savedState.currentDeckId || this.decks[0].id;
      } else {
        // Default decks if no saved state
        this.decks = [
          { id: '' + Date.now(), title: 'Sample Deck 1', cards: [] },
          { id: '' + (Date.now() + 1), title: 'Sample Deck 2', cards: [] }
        ];
        this.currentDeckId = this.decks[0].id;
      }
      this.studyMode = studyMode;

      this.deckListEl = document.getElementById('deck-list');
      this.deckTitleEl = document.getElementById('deck-title');
      this.newDeckBtn = document.getElementById('new-deck-btn');
      this.addDeckBtn = document.getElementById('add-deck');
      this.shuffleBtn = document.getElementById('shuffle-deck');

      this.modal = new Modal();

      this._bind();
      this.renderDeckList();
      this.selectDeck(this.currentDeckId);
    }

    _saveState() {
      // Save current state to localStorage
      saveState(this.decks, this.currentDeckId);
    }

    _bind() {
      if (this.newDeckBtn) this.newDeckBtn.addEventListener('click', (e) => this.openCreateDeckModal(e.currentTarget));
      if (this.addDeckBtn) this.addDeckBtn.addEventListener('click', (e) => this.openCreateDeckModal(e.currentTarget));
      if (this.shuffleBtn) this.shuffleBtn.addEventListener('click', () => this.shuffleCurrentDeck());

      // delegate deck list actions
      this.deckListEl.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-id]');
        if (!li) return;
        const id = li.getAttribute('data-id');
        if (e.target.matches('.edit-deck')) {
          this.openEditDeckModal(id, e.target);
        } else if (e.target.matches('.delete-deck')) {
          this.deleteDeckWithConfirm(id);
        } else {
          this.selectDeck(id);
        }
      });
    }

    renderDeckList() {
      this.deckListEl.innerHTML = '';
      this.decks.forEach((d) => {
        const li = document.createElement('li');
        li.className = 'deck-item';
        li.setAttribute('data-id', d.id);
        li.setAttribute('tabindex', '0');
        li.innerHTML = `<span class="deck-title-text">${escapeHtml(d.title)}</span>`;

        const actions = document.createElement('span');
        actions.className = 'deck-item-actions';
        actions.innerHTML = ` <button class="edit-deck" aria-label="Edit ${escapeHtml(d.title)}">✏️</button> <button class="delete-deck" aria-label="Delete ${escapeHtml(d.title)}">🗑️</button>`;
        li.appendChild(actions);

        if (d.id === this.currentDeckId) li.classList.add('selected');
        this.deckListEl.appendChild(li);
      });
    }

    selectDeck(id) {
      const found = this.decks.find((x) => x.id === id);
      if (!found) return;
      this.currentDeckId = id;
      // update UI
      // remove selected class
      this.deckListEl.querySelectorAll('li').forEach((li) => li.classList.toggle('selected', li.getAttribute('data-id') === id));
      if (this.deckTitleEl) this.deckTitleEl.textContent = found.title;
      
      // enter study mode if available
      if (this.studyMode) {
        this.studyMode.enterStudyMode(id);
      }
    }

    createDeck(title) {
      const id = '' + Date.now();
      const deck = { id, title: title || 'Untitled Deck', cards: [] };
      this.decks.push(deck);
      this._saveState();
      this.renderDeckList();
      this.selectDeck(id);
      return deck;
    }

    renameDeck(id, newTitle) {
      const d = this.decks.find((x) => x.id === id);
      if (!d) return;
      d.title = newTitle;
      this._saveState();
      this.renderDeckList();
      if (this.currentDeckId === id) this.selectDeck(id);
    }

    deleteDeckWithConfirm(id) {
      const d = this.decks.find((x) => x.id === id);
      if (!d) return;
      // simple confirm for now
      const sure = window.confirm(`Delete deck "${d.title}"? This cannot be undone.`);
      if (!sure) return;
      this.decks = this.decks.filter((x) => x.id !== id);
      this._saveState();
      // if deleted current, pick first
      if (this.currentDeckId === id) {
        this.currentDeckId = this.decks.length ? this.decks[0].id : null;
      }
      this.renderDeckList();
      if (this.currentDeckId) this.selectDeck(this.currentDeckId);
      else if (this.deckTitleEl) this.deckTitleEl.textContent = '';
    }

    openCreateDeckModal(opener) {
      const form = createElement(`<form class="deck-form" aria-label="Create deck form">
        <label>Deck name
          <input name="title" type="text" required placeholder="My Deck" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="save">Create</button>
        </div>
      </form>`);

      form.querySelector('.cancel').addEventListener('click', () => this.modal.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = form.title.value.trim() || 'Untitled Deck';
        this.createDeck(title);
        this.modal.close();
      });

      this.modal.open({ opener, content: form, title: 'Create New Deck' });
    }

    openEditDeckModal(id, opener) {
      const d = this.decks.find((x) => x.id === id);
      if (!d) return;
      const form = createElement(`<form class="deck-form" aria-label="Edit deck form">
        <label>Deck name
          <input name="title" type="text" required value="${escapeHtml(d.title)}" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="save">Save</button>
        </div>
      </form>`);

      form.querySelector('.cancel').addEventListener('click', () => this.modal.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = form.title.value.trim() || 'Untitled Deck';
        this.renameDeck(id, title);
        this.modal.close();
      });

      this.modal.open({ opener, content: form, title: 'Edit Deck' });
    }

    shuffleCurrentDeck() {
      const d = this.decks.find((x) => x.id === this.currentDeckId);
      if (!d) return;
      // simple Fisher-Yates shuffle on cards array
      for (let i = d.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d.cards[i], d.cards[j]] = [d.cards[j], d.cards[i]];
      }
      // provide minimal UI feedback
      const msg = document.createElement('div');
      msg.textContent = 'Deck shuffled';
      msg.style.padding = '8px';
      msg.style.background = '#eef';
      msg.style.borderRadius = '6px';
      setTimeout(() => msg.remove(), 900);
      const container = document.querySelector('.main-inner');
      if (container) {
        container.prepend(msg);
      }
    }
  }

  // Study mode manager: handles card navigation, keyboard shortcuts, cleanup
  class StudyMode {
    constructor(deckManager) {
      this.deckManager = deckManager;
      this.isActive = false;
      this.currentCardIndex = 0;
      this.isFlipped = false;
      this._cardIdCounter = 0; // for unique ID generation
      this.searchQuery = ''; // for filtering cards without mutating data
      this.filteredCards = []; // view-only filtered list, never mutates original

      this.cardEl = document.getElementById('card');
      this.cardAreaEl = document.getElementById('card-area');
      this.cardListEl = document.getElementById('card-list');
      this.prevBtn = document.getElementById('prev-card');
      this.flipBtn = document.getElementById('flip-card');
      this.nextBtn = document.getElementById('next-card');
      this.newCardBtn = document.getElementById('new-card');
      this.searchInput = document.getElementById('search-cards');
      this.searchCountEl = document.getElementById('search-count');

      this._boundKeydown = this._keydownHandler.bind(this);
      this._debouncedSearch = debounce(this._performSearch.bind(this), 300); // 300ms debounce
      this._bind();
    }

    _bind() {
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prevCard());
      if (this.flipBtn) this.flipBtn.addEventListener('click', () => this.toggleFlip());
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextCard());
      if (this.newCardBtn) this.newCardBtn.addEventListener('click', () => this.openNewCardModal());

      // Use event delegation for card list to avoid listener leaks on renderCardList
      if (this.cardListEl) {
        this.cardListEl.addEventListener('click', (e) => {
          if (e.target.matches('.edit-card')) {
            const cardId = e.target.getAttribute('data-card-id');
            this.openEditCardModal(cardId, e.target);
          } else if (e.target.matches('.delete-card')) {
            const cardId = e.target.getAttribute('data-card-id');
            this.deleteCard(cardId);
          }
        });
      }

      // Debounced search on cards
      if (this.searchInput) {
        this.searchInput.addEventListener('input', (e) => {
          this.searchQuery = e.target.value.toLowerCase();
          this._debouncedSearch();
        });
      }
    }

    enterStudyMode(deckId) {
      const deck = this.deckManager.decks.find((d) => d.id === deckId);
      if (!deck) {
        console.warn('Deck not found:', deckId);
        return;
      }

      this.isActive = true;
      this.currentDeck = deck;
      this.currentCardIndex = 0;
      this.isFlipped = false;

      // add study mode class to body for styling
      document.body.classList.add('study-mode');

      // render card list
      this.renderCardList();

      // if no cards, show empty state
      if (deck.cards.length === 0) {
        this.renderEmptyState();
      } else {
        this.renderCurrentCard();
      }

      // attach keyboard listener
      document.addEventListener('keydown', this._boundKeydown);
    }

    exitStudyMode() {
      if (!this.isActive) return;

      this.isActive = false;
      this.currentDeck = null;

      // remove keyboard listener
      document.removeEventListener('keydown', this._boundKeydown);

      // remove study mode class
      document.body.classList.remove('study-mode');

      // reset UI
      this.isFlipped = false;
      this.currentCardIndex = 0;
      if (this.cardAreaEl) {
        this.cardAreaEl.innerHTML = '<p>No deck selected. Choose a deck to start studying.</p>';
      }
    }

    renderCurrentCard() {
      // Use filteredCards if search is active, otherwise use all cards
      const cardsToShow = this.filteredCards.length > 0 ? this.filteredCards : this.currentDeck.cards;

      if (!this.currentDeck || cardsToShow.length === 0) {
        this.renderEmptyState();
        return;
      }

      const card = cardsToShow[this.currentCardIndex];
      if (!card) {
        this.renderEmptyState();
        return;
      }

      // Reset flip state explicitly
      this.isFlipped = false;

      const cardHTML = `
        <article class="card" id="card" role="region" aria-label="Flashcard ${this.currentCardIndex + 1} of ${cardsToShow.length}">
          <div class="card-face card-front" id="card-front">
            ${escapeHtml(card.front)}
          </div>
          <div class="card-face card-back" id="card-back">
            ${escapeHtml(card.back)}
          </div>
        </article>
      `;

      if (this.cardAreaEl) {
        this.cardAreaEl.innerHTML = cardHTML;
      }

      // Reset flip button label
      if (this.flipBtn) {
        this.flipBtn.textContent = 'Flip';
      }

      // update card count
      const countEl = this.cardAreaEl?.querySelector('.card-count');
      if (countEl) {
        countEl.textContent = `${this.currentCardIndex + 1} / ${cardsToShow.length}`;
      }
    }

    renderEmptyState() {
      if (this.cardAreaEl) {
        this.cardAreaEl.innerHTML = `<p style="text-align:center;color:var(--muted);">No cards in this deck yet. Create one to get started!</p>`;
      }
    }

    toggleFlip() {
      if (!this.currentDeck || this.currentDeck.cards.length === 0) return;

      this.isFlipped = !this.isFlipped;

      const card = document.getElementById('card');

      if (card) {
        if (this.isFlipped) {
          card.classList.add('flipped');
          const back = document.getElementById('card-back');
          if (back) back.setAttribute('aria-live', 'polite');
        } else {
          card.classList.remove('flipped');
          const front = document.getElementById('card-front');
          if (front) front.setAttribute('aria-live', 'polite');
        }
      }

      // update button label
      if (this.flipBtn) {
        this.flipBtn.textContent = this.isFlipped ? 'Flip Back' : 'Flip';
      }
    }

    nextCard() {
      if (!this.currentDeck || this.currentDeck.cards.length === 0) return;

      if (this.currentCardIndex < this.currentDeck.cards.length - 1) {
        this.currentCardIndex++;
        this.renderCurrentCard();
      }
    }

    prevCard() {
      if (!this.currentDeck || this.currentDeck.cards.length === 0) return;

      if (this.currentCardIndex > 0) {
        this.currentCardIndex--;
        this.renderCurrentCard();
      }
    }

    _keydownHandler(e) {
      if (!this.isActive) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.toggleFlip();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.prevCard();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.nextCard();
          break;
        case 'Escape':
          e.preventDefault();
          this.exitStudyMode();
          break;
      }
    }

    openNewCardModal() {
      if (!this.currentDeck) return;

      const form = createElement(`<form class="card-form" aria-label="Create card form">
        <label>Front
          <input name="front" type="text" required placeholder="Question" />
        </label>
        <label>Back
          <input name="back" type="text" required placeholder="Answer" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="save">Add Card</button>
        </div>
      </form>`);

      form.querySelector('.cancel').addEventListener('click', () => this.deckManager.modal.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const front = form.front.value.trim();
        const back = form.back.value.trim();
        if (front && back) {
          // Generate unique ID: timestamp + counter + random suffix
          const cardId = Date.now() + '-' + (this._cardIdCounter++) + '-' + Math.random().toString(36).substr(2, 9);
          this.currentDeck.cards.push({ id: cardId, front, back });
          this.deckManager._saveState();
          this.renderCardList();
          this.renderCurrentCard();
          this.deckManager.modal.close();
        }
      });

      this.deckManager.modal.open({
        opener: this.newCardBtn,
        content: form,
        title: 'Create New Card'
      });
    }

    _performSearch() {
      if (!this.currentDeck) return;

      // Filter cards without mutating the original array
      if (this.searchQuery.trim() === '') {
        // Clear search: restore full set
        this.filteredCards = [...this.currentDeck.cards];
        if (this.searchCountEl) {
          this.searchCountEl.style.display = 'none';
        }
      } else {
        // Filter based on front or back text match
        this.filteredCards = this.currentDeck.cards.filter((card) => {
          const front = card.front.toLowerCase();
          const back = card.back.toLowerCase();
          return front.includes(this.searchQuery) || back.includes(this.searchQuery);
        });

        // Show match count
        if (this.searchCountEl) {
          const strong = this.searchCountEl.querySelector('strong');
          if (strong) {
            strong.textContent = this.filteredCards.length;
          }
          this.searchCountEl.style.display = 'inline';
        }
      }

      // Re-render with filtered results
      this.currentCardIndex = 0;
      this.renderCardList();
      this.renderCurrentCard();
    }

    renderCardList() {
      // render a list of cards in the deck for preview/management
      const listContainer = document.getElementById('card-list');
      if (!listContainer || !this.currentDeck) return;

      // Use filteredCards for display (view-only, never mutates original)
      const cardsToShow = this.filteredCards.length > 0 ? this.filteredCards : this.currentDeck.cards;

      if (cardsToShow.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">No cards yet</p>';
        return;
      }

      let html = '<div class="card-list-items">';
      cardsToShow.forEach((card, idx) => {
        html += `
          <div class="card-list-item" data-card-id="${card.id}">
            <div class="card-list-content">
              <div class="card-list-number">${idx + 1}</div>
              <div class="card-list-text">
                <div class="card-list-front">${escapeHtml(card.front)}</div>
                <div class="card-list-back">${escapeHtml(card.back)}</div>
              </div>
            </div>
            <div class="card-list-actions">
              <button class="edit-card" data-card-id="${card.id}" aria-label="Edit card">✏️</button>
              <button class="delete-card" data-card-id="${card.id}" aria-label="Delete card">🗑️</button>
            </div>
          </div>
        `;
      });
      html += '</div>';
      listContainer.innerHTML = html;
    }

    openEditCardModal(cardId, opener) {
      if (!this.currentDeck) return;
      const card = this.currentDeck.cards.find((c) => c.id === cardId);
      if (!card) return;

      const form = createElement(`<form class="card-form" aria-label="Edit card form">
        <label>Front
          <input name="front" type="text" required value="${escapeHtml(card.front)}" />
        </label>
        <label>Back
          <input name="back" type="text" required value="${escapeHtml(card.back)}" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="save">Save</button>
        </div>
      </form>`);

      form.querySelector('.cancel').addEventListener('click', () => this.deckManager.modal.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const front = form.front.value.trim();
        const back = form.back.value.trim();
        if (front && back) {
          // Update card object directly (persists in the cards array)
          card.front = front;
          card.back = back;
          this.deckManager._saveState();
          // Re-render the card list and current card view
          this.renderCardList();
          // This will re-render the current card with updated text
          this.renderCurrentCard();
          this.deckManager.modal.close();
        }
      });

      this.deckManager.modal.open({
        opener,
        content: form,
        title: 'Edit Card'
      });
    }

    deleteCard(cardId) {
      if (!this.currentDeck) return;
      const idx = this.currentDeck.cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return;

      const sure = window.confirm('Delete this card? This cannot be undone.');
      if (!sure) return;

      this.currentDeck.cards.splice(idx, 1);
      this.deckManager._saveState();

      // adjust current index if needed
      if (this.currentCardIndex >= this.currentDeck.cards.length && this.currentCardIndex > 0) {
        this.currentCardIndex--;
      }

      this.renderCardList();
      this.renderCurrentCard();
    }
  }

  // small helper to escape HTML in strings used in innerHTML
  function escapeHtml(str) {
    return String(str).replace(/[&<>"]+/g, function (s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[s];
    });
  }

  // Add minimal CSS for modal and study mode (in JS so we don't require editing stylesheet)
  function injectModalStyles() {
    const css = `
      .modal-overlay { position: fixed; inset: 0; background: rgba(2,6,23,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
      .modal-dialog { background: white; border-radius: 10px; max-width: 540px; width: 92%; box-shadow: 0 12px 40px rgba(2,6,23,0.4); padding: 18px; }
      .modal-content:focus { outline: none; }
      body.modal-open { overflow: hidden; }
      .deck-form label { display:block; font-size:0.95rem; color:var(--muted); }
      .deck-form input { width:100%; padding:8px 10px; margin-top:6px; border-radius:8px; border:1px solid rgba(15,23,42,0.06); }
      .card-form label { display:block; font-size:0.95rem; color:var(--muted); margin-top:10px; }
      .card-form label:first-of-type { margin-top:0; }
      .card-form input { width:100%; padding:8px 10px; margin-top:4px; border-radius:8px; border:1px solid rgba(15,23,42,0.06); }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    injectModalStyles();
    // ensure necessary elements exist
    if (!document.getElementById('deck-list') || !document.getElementById('deck-title')) {
      console.warn('Deck list or deck title element not found. DeckManager not initialized.');
      return;
    }
    const studyMode = new StudyMode(null); // will be bound after DeckManager is created
    const deckManager = new DeckManager(studyMode);
    studyMode.deckManager = deckManager; // bind reference
    window.__deckManager = deckManager;
    window.__studyMode = studyMode;
  });

})();
