import React, { useState, useEffect } from 'react';

function getApiKeyPlaceholder(provider: ApiKeySettings['provider']): string {
  switch (provider) {
    case 'openai': return 'sk-...';
    case 'anthropic': return 'sk-ant-...';
    case 'gemini': return 'AIza...';
    case 'cohere': return 'Your Cohere API key';
    case 'mistral': return 'Your Mistral API key'; 
    default: return 'Your API key';
  }
}

function getApiKeyHelp(provider: ApiKeySettings['provider']): string {
  switch (provider) {
    case 'openai': return 'Get your API key from https://platform.openai.com/api-keys';
    case 'anthropic': return 'Get your API key from https://console.anthropic.com/settings/keys';
    case 'gemini': return 'Get your API key from https://aistudio.google.com/app/apikey';
    case 'cohere': return 'Get your API key from https://dashboard.cohere.com/api-keys';
    case 'mistral': return 'Get your API key from https://console.mistral.ai/api-keys/';
    default: return 'Get your API key from your provider\'s console';
  }
}

interface ApiKeySettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'cohere' | 'mistral';
  apiKey: string;
}

export function Settings() {
  const [settings, setSettings] = useState<ApiKeySettings>({
    provider: 'openai',
    apiKey: ''
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings({
          provider: data.provider,
          apiKey: '' // Always start with empty API key field
        });
        setHasExistingKey(data.hasApiKey);
      }
    } catch (error) {
      // Failed to load settings, will use defaults
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!settings.apiKey) {
      alert('Please enter an API key');
      return;
    }
    
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        setSaveStatus('success');
        setHasExistingKey(true);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        try {
          const errorData = await response.json();
          alert(`Failed to save settings: ${errorData.error || 'Unknown error'}`);
        } catch {
          const errorText = await response.text();
          alert(`Failed to save settings: ${errorText || 'Unknown error'}`);
        }
      }
    } catch (error) {
      setSaveStatus('error');
      alert(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings.apiKey) {
      alert('Please enter an API key first');
      return;
    }

    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const result = await response.json();
      
      if (result.success) {
        alert('Connection successful! Your API key is working.');
      } else {
        alert(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to test connection');
    }
  };

  const clearApiKey = async () => {
    if (!confirm('Are you sure you want to clear the stored API key? The chat interface will not work until you configure a new key.')) {
      return;
    }

    try {
      const response = await fetch('/api/settings/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setSaveStatus('success');
        setHasExistingKey(false);
        setSettings({ ...settings, apiKey: '' });
        setTimeout(() => {
          setSaveStatus('idle');
          alert('API key cleared successfully');
        }, 500);
      } else {
        setSaveStatus('error');
        alert('Failed to clear API key');
      }
    } catch (error) {
      setSaveStatus('error');
      alert('Failed to clear API key');
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Configure your LLM provider for the chat interface</p>
      </div>

      <form onSubmit={saveSettings} className="settings-form">
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">LLM Provider Configuration</h2>
          </div>
          
          <div className="settings-fields">
            <div className="settings-field">
              <label className="settings-label">
                Provider
              </label>
              <select
                value={settings.provider}
                onChange={(e) => setSettings({ ...settings, provider: e.target.value as ApiKeySettings['provider'] })}
                className="settings-select"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="cohere">Cohere (Command R+)</option>
                <option value="gemini">Google (Gemini Pro)</option>
                <option value="mistral">Mistral AI (Large)</option>
                <option value="openai">OpenAI (GPT-4)</option>
              </select>
            </div>

            <div className="settings-field">
              <label className="settings-label">
                API Key
                {hasExistingKey && (
                  <span className="settings-status-badge">✓ Configured</span>
                )}
              </label>
              <div className="settings-input-wrapper">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  placeholder={hasExistingKey 
                    ? 'Enter new API key to replace existing one'
                    : getApiKeyPlaceholder(settings.provider)
                  }
                  className="settings-input"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="settings-toggle-button"
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="settings-help-text">
                {getApiKeyHelp(settings.provider)}
              </p>
            </div>
          </div>

          <div className="settings-actions">
            <button
              type="submit"
              disabled={isSaving || !settings.apiKey}
              className="settings-primary-button"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            
            <button
              type="button"
              onClick={testConnection}
              disabled={!settings.apiKey}
              className="settings-secondary-button"
            >
              Test Connection
            </button>

            {hasExistingKey && (
              <button
                type="button"
                onClick={clearApiKey}
                className="settings-danger-button"
              >
                Clear API Key
              </button>
            )}

            {saveStatus === 'success' && (
              <div className="settings-status-message settings-status-success">
                ✓ Settings saved successfully
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="settings-status-message settings-status-error">
                ✗ Failed to save settings
              </div>
            )}
          </div>
        </div>

        <div className="settings-info-card">
          <div className="settings-info-header">
            <h3 className="settings-info-title">About the Chat Interface</h3>
          </div>
          <p className="settings-info-text">
            The chat interface uses your configured LLM provider with access to all Fly.io tools through MCP.
            You can ask questions about your infrastructure, request changes, and get help with Fly.io operations.
          </p>
        </div>
      </form>
    </div>
  );
}