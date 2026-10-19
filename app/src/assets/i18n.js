// Translations for the internal pages. The main process sends the dictionary on init, so every page shows the user's
// language without a build per language.
(() => {
  let table = {};
  const apply = (root) => {
    for (const el of (root || document).querySelectorAll("[data-i18n]")) {
      const text = table[el.dataset.i18n];
      if (text !== undefined) el.textContent = text;
    }
    for (const el of (root || document).querySelectorAll("[data-i18n-placeholder]")) {
      const text = table[el.dataset.i18nPlaceholder];
      if (text !== undefined) el.placeholder = text;
    }
    for (const el of (root || document).querySelectorAll("[data-i18n-title]")) {
      const text = table[el.dataset.i18nTitle];
      if (text !== undefined) el.title = text;
    }
  };
  window.i18n = {
    set(dict, lang) {
      table = dict || {};
      if (lang) document.documentElement.lang = lang;
      apply(document);
    },
    apply,
    t(key, fallback) {
      return table[key] ?? fallback ?? key;
    },
  };
})();
