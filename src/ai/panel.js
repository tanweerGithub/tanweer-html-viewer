const PROVIDER_KEY = 'tanweer-html-viewer-ai-provider';
const API_KEYS_KEY = 'tanweer-html-viewer-ai-keys';

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.0-flash' },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-3-5-haiku-20241022' },
];

function loadApiKeys() {
  try {
    return JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveApiKeys(keys) {
  localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

export function createAiPanel({ onApply }) {
  const panel = document.getElementById('ai-panel');
  const providerSelect = document.getElementById('ai-provider');
  const apiKeyInput = document.getElementById('ai-api-key');
  const instructionInput = document.getElementById('ai-instruction');
  const applyBtn = document.getElementById('ai-apply');
  const statusEl = document.getElementById('ai-status');
  const settingsToggle = document.getElementById('ai-settings-toggle');
  const settingsBody = document.getElementById('ai-settings-body');
  const scopeHint = document.getElementById('ai-scope-hint');

  PROVIDERS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    providerSelect.appendChild(opt);
  });

  const savedProvider = localStorage.getItem(PROVIDER_KEY) || 'gemini';
  providerSelect.value = savedProvider;
  apiKeyInput.value = loadApiKeys()[savedProvider] || '';

  function setStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.dataset.type = type;
  }

  function updateScopeHint(hasSelection) {
    scopeHint.textContent = hasSelection
      ? 'Instruction will apply to the selected element only.'
      : 'No element selected — instruction may apply to the whole page.';
  }

  providerSelect.addEventListener('change', () => {
    const keys = loadApiKeys();
    keys[providerSelect.value] = apiKeyInput.value;
    saveApiKeys(keys);
    localStorage.setItem(PROVIDER_KEY, providerSelect.value);
    const keys2 = loadApiKeys();
    apiKeyInput.value = keys2[providerSelect.value] || '';
  });

  apiKeyInput.addEventListener('input', () => {
    const keys = loadApiKeys();
    keys[providerSelect.value] = apiKeyInput.value;
    saveApiKeys(keys);
  });

  settingsToggle.addEventListener('click', () => {
    const open = settingsBody.hidden;
    settingsBody.hidden = !open;
    settingsToggle.setAttribute('aria-expanded', String(open));
  });

  applyBtn.addEventListener('click', () => {
    const instruction = instructionInput.value.trim();
    if (!instruction) {
      setStatus('Describe what you want to change.', 'warning');
      return;
    }

    const provider = PROVIDERS.find((p) => p.id === providerSelect.value);
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      setStatus('Add your API key in settings first. AI editing will connect soon.', 'warning');
      return;
    }

    onApply?.({
      instruction,
      provider: provider.id,
      model: provider.defaultModel,
      apiKey,
    });

    setStatus('AI editing is UI-ready — backend connection coming next.', 'info');
  });

  return {
    setStatus,
    updateScopeHint,
    clearInstruction() {
      instructionInput.value = '';
    },
  };
}