const KEYS = {
  last: "nozdormu.lastSettings",
  presets: "nozdormu.presets",
  history: "nozdormu.history",
};

export function createStore(storage) {
  // Une valeur illisible (JSON invalide, mauvais type, stockage inaccessible)
  // est traitée comme absente.
  function read(key, isValid) {
    try {
      const value = JSON.parse(storage.getItem(key));
      return isValid(value) ? value : null;
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage plein ou bloqué : on continue sans persister
    }
  }

  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const readList = (key) => read(key, Array.isArray) ?? [];

  return {
    getLastSettings: () => read(KEYS.last, isObject),
    setLastSettings: (settings) => write(KEYS.last, settings),

    listPresets: () =>
      readList(KEYS.presets).sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" })),
    savePreset(name, settings) {
      const presets = readList(KEYS.presets).filter((p) => p.name !== name);
      write(KEYS.presets, [...presets, { name, settings }]);
    },
    deletePreset(name) {
      write(KEYS.presets, readList(KEYS.presets).filter((p) => p.name !== name));
    },

    addHistory(entry) {
      write(KEYS.history, [...readList(KEYS.history), entry]);
    },
    listHistory: () => readList(KEYS.history).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}
