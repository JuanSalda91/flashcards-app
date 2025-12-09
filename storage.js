/* storage.js
   LocalStorage helpers with versioning and safe fallbacks
*/

const STORAGE_KEY = 'flashcards-app-state';
const STORAGE_VERSION = 1;

// Load state from localStorage with safe parsing
function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      console.log('[Storage] No saved state found');
      return null;
    }

    const data = JSON.parse(stored);

    // Validate version and structure
    if (!data || typeof data !== 'object' || data.version !== STORAGE_VERSION) {
      console.warn('[Storage] Incompatible or missing version. Returning null to use defaults.');
      return null;
    }

    // Validate decks structure
    if (!Array.isArray(data.decks)) {
      console.warn('[Storage] Invalid decks structure. Returning null.');
      return null;
    }

    console.log('[Storage] Loaded state successfully. Decks:', data.decks.length);
    return data;
  } catch (e) {
    console.error('[Storage] Parse error:', e.message);
    return null;
  }
}

// Save state to localStorage
function saveState(decks, currentDeckId) {
  try {
    const state = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      decks: decks || [],
      currentDeckId: currentDeckId || null
    };

    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
    console.log('[Storage] State saved successfully.');
  } catch (e) {
    console.error('[Storage] Save error:', e.message);
    // Silently fail to avoid breaking the app
  }
}

// Clear all saved state
function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Storage] State cleared.');
  } catch (e) {
    console.error('[Storage] Clear error:', e.message);
  }
}

// Debounce helper for search
function debounce(func, delay) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
