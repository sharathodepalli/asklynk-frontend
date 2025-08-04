// Simple popup implementation without React
document.addEventListener('DOMContentLoaded', function() {
  // Check authentication state
  chrome.storage.local.get(['authState'], (result) => {
    const authState = result.authState;
    
    if (authState && authState.isLoggedIn) {
      showLoggedInState(authState.user);
    } else {
      showLoggedOutState();
    }
  });
});

function showLoggedOutState() {
  document.getElementById('root').innerHTML = `
    <div class="popup-container">
      <header class="popup-header">
        <h1>AskLynkk Chat</h1>
      </header>
      <main class="popup-content">
        <div class="login-container">
          <h2>Welcome to AskLynkk Chat</h2>
          <p>Please sign in to continue</p>
          <button id="loginBtn" class="login-button">Sign In / Sign Up</button>
        </div>
      </main>
      <footer class="popup-footer">
        <p>AskLynkk Chat © 2025</p>
      </footer>
    </div>
  `;
  
  document.getElementById('loginBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' });
  });
}

function showLoggedInState(user) {
  document.getElementById('root').innerHTML = `
    <div class="popup-container">
      <header class="popup-header">
        <h1>AskLynkk Chat</h1>
        <div class="user-info">
          <span class="username">${user.username}</span>
          <button id="logoutBtn" class="logout-btn">Logout</button>
        </div>
      </header>
      <main class="popup-content">
        <div class="dashboard-container">
          <h3>Welcome back, ${user.username}!</h3>
          <p>Role: ${user.role}</p>
          <p>Extension is active and ready.</p>
        </div>
      </main>
      <footer class="popup-footer">
        <p>AskLynkk Chat © 2025</p>
      </footer>
    </div>
  `;
  
  document.getElementById('logoutBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
      showLoggedOutState();
    });
  });
}
