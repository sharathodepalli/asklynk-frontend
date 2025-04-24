// popup.jsx - Main component for your extension's popup UI
import React, { useState, useEffect } from 'react';
import ProfessorDashboard from './components/ProfessorDashboard';
import StudentDashboard from './components/StudentDashboard';
import './Popup.css';

function Popup() {
  const [authState, setAuthState] = useState({
    isLoggedIn: false,
    user: null,
    isLoading: true
  });

  // Check authentication state when component mounts
  useEffect(() => {
    checkAuthState();
    
    // Listen for auth state changes
    const authListener = (message) => {
      if (message.type === 'AUTH_CHANGED') {
        setAuthState({
          isLoggedIn: message.authState.isLoggedIn,
          user: message.authState.user,
          isLoading: false
        });
      }
    };
    
    // Add listener for auth changes
    chrome.runtime.onMessage.addListener(authListener);
    
    // Clean up listener on unmount
    return () => {
      chrome.runtime.onMessage.removeListener(authListener);
    };
  }, []);

  // Function to check authentication state
  const checkAuthStatus = () => {
    chrome.storage.local.get(['authState'], (result) => {
      console.log("Auth state from storage:", result.authState);
      
      if (result.authState && result.authState.isLoggedIn) {
        setAuthState({
          isLoggedIn: true,
          user: result.authState.user,
          isLoading: false
        });
      } else {
        setAuthState({
          isLoggedIn: false,
          user: null,
          isLoading: false
        });
      }
    });
  };

  // Handle login button click
  const handleLogin = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' });
  };

  // Handle logout
  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, (response) => {
      if (response && response.success) {
        setAuthState({
          isLoggedIn: false,
          user: null,
          isLoading: false
        });
      }
    });
  };

  // Display loading state
  if (authState.isLoading) {
    return (
      <div className="popup-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Lynkk Chat</h1>
        {authState.isLoggedIn && (
          <div className="user-info">
            <span className="username">{authState.user.username}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>

      <main className="popup-content">
        {!authState.isLoggedIn ? (
          <div className="login-container">
            <h2>Welcome to Lynkk Chat</h2>
            <p>Please sign in to continue</p>
            <button className="login-button" onClick={handleLogin}>
              Sign In / Sign Up
            </button>
          </div>
        ) : (
          <div className="dashboard-container">
            {/* Use dashboard components based on user role */}
            {authState.user.role === "professor" ? (
              <ProfessorDashboard user={authState.user} />
            ) : (
              <StudentDashboard user={authState.user} />
            )}
          </div>
        )}
      </main>

      <footer className="popup-footer">
        <p>Lynkk Chat © 2025</p>
      </footer>
    </div>
  );
}

export default Popup;