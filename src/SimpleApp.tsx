import React, { useState, useEffect } from 'react';

function SimpleApp() {
  const [status, setStatus] = useState('Initializing...');
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    console.log('SimpleApp mounted');
    checkBackend();
  }, []);

  const checkBackend = async () => {
    try {
      setStatus('Checking backend...');
      const response = await fetch('/api/health');
      const data = await response.json();
      setStatus(`Backend status: ${data.status}, MCP connected: ${data.mcpConnected}`);
      
      if (data.mcpConnected) {
        setStatus('Fetching organizations...');
        const orgsResponse = await fetch('/api/organizations');
        if (orgsResponse.ok) {
          const orgsData = await orgsResponse.json();
          setOrgs(orgsData);
          setStatus(`Found ${orgsData.length} organizations`);
        } else {
          const errorText = await orgsResponse.text();
          setStatus(`Error fetching orgs: ${errorText}`);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Fly.io Explorer - Debug Mode</h1>
      <p>Status: {status}</p>
      
      {orgs.length > 0 && (
        <div>
          <h2>Organizations:</h2>
          <ul>
            {orgs.map((org: any, index: number) => (
              <li key={index}>
                {org.name || org.slug || JSON.stringify(org)}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <button onClick={checkBackend} style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}>
        Refresh
      </button>
    </div>
  );
}

export default SimpleApp;