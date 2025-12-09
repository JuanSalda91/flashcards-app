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
    constructor() {
      this.decks = [
        { id: '' + Date.now(), title: 'Sample Deck 1', cards: [] },
        { id: '' + (Date.now() + 1), title: 'Sample Deck 2', cards: [] }
      ];
      this.currentDeckId = this.decks[0].id;

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
    }

    createDeck(title) {
      const id = '' + Date.now();
      const deck = { id, title: title || 'Untitled Deck', cards: [] };
      this.decks.push(deck);
      this.renderDeckList();
      this.selectDeck(id);
      return deck;
    }

    renameDeck(id, newTitle) {
      const d = this.decks.find((x) => x.id === id);
      if (!d) return;
      d.title = newTitle;
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

  // small helper to escape HTML in strings used in innerHTML
  function escapeHtml(str) {
    return String(str).replace(/[&<>"]+/g, function (s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[s];
    });
  }

  // Add minimal CSS for modal (in JS so we don't require editing stylesheet)
  function injectModalStyles() {
    const css = `
      .modal-overlay { position: fixed; inset: 0; background: rgba(2,6,23,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
      .modal-dialog { background: white; border-radius: 10px; max-width: 540px; width: 92%; box-shadow: 0 12px 40px rgba(2,6,23,0.4); padding: 18px; }
      .modal-content:focus { outline: none; }
      body.modal-open { overflow: hidden; }
      .deck-form label { display:block; font-size:0.95rem; color:var(--muted); }
      .deck-form input { width:100%; padding:8px 10px; margin-top:6px; border-radius:8px; border:1px solid rgba(15,23,42,0.06); }
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
    window.__deckManager = new DeckManager();
  });

})();
