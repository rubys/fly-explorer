import React, { useState, useEffect } from 'react';

interface ApiKeySettings {
  provider: 'openai' | 'anthropic';
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
      console.error('Failed to load settings:', error);
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
      console.log('Saving settings:', { provider: settings.provider, hasApiKey: !!settings.apiKey });
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      console.log('Save response:', response.status);
      if (response.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        const errorText = await response.text();
        console.error('Save failed:', errorText);
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
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
                onChange={(e) => setSettings({ ...settings, provider: e.target.value as 'openai' | 'anthropic' })}
                className="settings-select"
              >
                <option value="openai">OpenAI (GPT-4)</option>
                <option value="anthropic">Anthropic (Claude)</option>
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
                    : (settings.provider === 'openai' ? 'sk-...' : 'sk-ant-...')
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
                {settings.provider === 'openai' 
                  ? 'Get your API key from https://platform.openai.com/api-keys'
                  : 'Get your API key from https://console.anthropic.com/settings/keys'
                }
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