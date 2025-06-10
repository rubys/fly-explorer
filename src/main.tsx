import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import SimpleApp from './SimpleApp.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import './index.css'

// Use SimpleApp for debugging, App for full functionality
const AppComponent = window.location.search.includes('debug') ? SimpleApp : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppComponent />
    </ErrorBoundary>
  </React.StrictMode>,
)