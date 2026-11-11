import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import ExecutiveReport from './pages/ExecutiveReport'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<App />} />
        <Route path="/relatorio/:domainId/:scanId" element={<ExecutiveReport />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
