// Standalone replacement for the Claude-artifact-only `window.storage` API.
// Same shape (async get/set/delete/list, returns { value } or null) but backed
// by real browser localStorage, which works on any normal deployed website.
//
// Note: this is per-browser storage, same as the artifact version was — it is
// NOT a real multi-device account system. See README.md for what a real
// backend upgrade would look like.

const PREFIX = 'leeann:';

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return raw;
  }
}

export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = '') {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) {
          keys.push(k.slice(PREFIX.length));
        }
      }
      return { keys };
    } catch (e) {
      return null;
    }
  },
};
