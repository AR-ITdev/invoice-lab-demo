export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return { value: raw === null ? fallback : JSON.parse(raw), error: null };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { value: fallback, error: "Dati locali non disponibili o non leggibili. La demo riparte con i dati predefiniti." };
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return "Salvataggio nel browser non disponibile. Puoi continuare, ma le modifiche potrebbero andare perse ricaricando o chiudendo la pagina.";
  }
}
