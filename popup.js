const ids = ['vak', 'cijfer', 'onderwerp'];
ids.forEach(id => {
  const el = document.getElementById(id);
  el.value = localStorage.getItem('sp_' + id) || '';
  el.addEventListener('input', () => localStorage.setItem('sp_' + id, el.value));
});
document.getElementById('test').addEventListener('click', async () => {
  const err = document.getElementById('err');
  err.textContent = '';
  const data = {
    vak: vak.value.trim() || 'Vak',
    cijfer: cijfer.value || '1',
    onderwerp: onderwerp.value.trim() || 'Toets'
  };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: d => { window.__somPack = d; },
      args: [data]
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['pack.js'] });
    window.close();
  } catch (e) {
    err.textContent = 'Werkt niet op deze pagina. Open een gewone website (bijv. somtoday.nl).';
  }
});
