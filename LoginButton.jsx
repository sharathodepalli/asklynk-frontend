// LoginButton.jsx
import React from 'react';

function LoginButton() {
  const handleLogin = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' });
  };

  return (
    <button className="login-button" onClick={handleLogin}>
      Sign In / Sign Up
    </button>
  );
}

export default LoginButton;