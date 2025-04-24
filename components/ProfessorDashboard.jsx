// // ProfessorDashboard.jsx
// import React, { useState } from 'react';

// function ProfessorDashboard({ user }) {
//   const [activeSection, setActiveSection] = useState('assistant');
//   const [sessionName, setSessionName] = useState('');
//   const [sessionHistory, setSessionHistory] = useState([]);
//   const [isLoading, setIsLoading] = useState(false);

//   // Handle creating a new session
//   const handleCreateSession = () => {
//     if (!sessionName.trim()) return;
    
//     setIsLoading(true);
    
//     // Here you would typically make an API call to create the session
//     // Simulating with a timeout
//     setTimeout(() => {
//       const newSession = {
//         id: Math.random().toString(36).substr(2, 9),
//         name: sessionName,
//         createdAt: new Date().toISOString()
//       };
      
//       // Store in local history
//       const updatedHistory = [newSession, ...sessionHistory];
//       setSessionHistory(updatedHistory);
//       setSessionName('');
//       setIsLoading(false);
      
//       // You might also want to store this in chrome.storage
//       chrome.storage.local.set({ professorSessions: updatedHistory });
//     }, 500);
//   };

//   // Handle showing session history
//   const handleShowHistory = () => {
//     setIsLoading(true);
    
//     // Load from chrome.storage
//     chrome.storage.local.get(['professorSessions'], (result) => {
//       if (result.professorSessions) {
//         setSessionHistory(result.professorSessions);
//       }
//       setActiveSection('history');
//       setIsLoading(false);
//     });
//   };

//   return (
//     <div className="professor-dashboard">
//       <h2>Professor Dashboard</h2>
      
//       <div className="section-tabs">
//         <button 
//           className={activeSection === 'assistant' ? 'active' : ''} 
//           onClick={() => setActiveSection('assistant')}
//         >
//           AI Teaching Assistant
//         </button>
//         <button 
//           className={activeSection === 'history' ? 'active' : ''} 
//           onClick={handleShowHistory}
//         >
//           Session History
//         </button>
//       </div>
      
//       {activeSection === 'assistant' && (
//         <div className="assistant-section">
//           <h3>AI Teaching Assistant</h3>
//           <p>Create a new teaching session for your students to join.</p>
          
//           <div className="create-session">
//             <input
//               type="text"
//               placeholder="Enter session name"
//               value={sessionName}
//               onChange={(e) => setSessionName(e.target.value)}
//             />
//             <button 
//               onClick={handleCreateSession}
//               disabled={isLoading || !sessionName.trim()}
//             >
//               {isLoading ? 'Creating...' : 'Create Session'}
//             </button>
//           </div>
          
//           <div className="quick-actions">
//             <button className="action-btn">Open AI Chat</button>
//           </div>
//         </div>
//       )}
      
//       {activeSection === 'history' && (
//         <div className="history-section">
//           <h3>Session History</h3>
          
//           {sessionHistory.length === 0 ? (
//             <p>No sessions created yet.</p>
//           ) : (
//             <ul className="session-list">
//               {sessionHistory.map(session => (
//                 <li key={session.id} className="session-item">
//                   <div className="session-info">
//                     <span className="session-name">{session.name}</span>
//                     <span className="session-date">
//                       {new Date(session.createdAt).toLocaleDateString()}
//                     </span>
//                   </div>
//                   <button className="join-btn">Open</button>
//                 </li>
//               ))}
//             </ul>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// export default ProfessorDashboard;
// Updated ProfessorDashboard.jsx for Chrome Extension
import React, { useState, useEffect } from 'react';

function ProfessorDashboard({ user }) {
  const [activeSection, setActiveSection] = useState('assistant');
  const [sessionName, setSessionName] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Web app base URL - adjust based on your deployment environment
  const webAppBaseURL = 'http://localhost:3000'; // development
  // const webAppBaseURL = 'https://app.asklynk.com'; // production

  // Load sessions when the history tab is activated
  useEffect(() => {
    if (activeSection === 'history') {
      fetchSessionHistory();
    }
  }, [activeSection]);

  // Set up polling for real-time updates
  useEffect(() => {
    let intervalId;
    
    if (activeSection === 'history') {
      intervalId = setInterval(() => {
        fetchSessionHistory(false); // Don't show loading indicator for background refreshes
      }, 30000); // Poll every 30 seconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeSection]);

  // Function to fetch session history from your web app's API
  const fetchSessionHistory = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
      setError(null);
    }
    
    try {
      // Get auth data from Chrome storage
      const { authState } = await new Promise((resolve) => {
        chrome.storage.local.get(['authState'], (result) => {
          resolve(result);
        });
      });
      
      if (!authState || !authState.isLoggedIn || !authState.user) {
        throw new Error('Not authenticated');
      }
      
      const professorId = authState.user.id;
      const authToken = authState.token || '';
      
      // Make API call to your web app's endpoint
      const response = await fetch(`${webAppBaseURL}/api/sessions/professor/${professorId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Error ${response.status}: Failed to fetch sessions`);
      }
      
      const data = await response.json();
      setSessionHistory(data || []);
    } catch (err) {
      console.error('Error fetching session history:', err);
      if (showLoading) {
        setError(err.message);
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  // Handle creating a new session using your web app's API
  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get auth data from Chrome storage
      const { authState } = await new Promise((resolve) => {
        chrome.storage.local.get(['authState'], (result) => {
          resolve(result);
        });
      });
      
      if (!authState || !authState.isLoggedIn || !authState.user) {
        throw new Error('Not authenticated');
      }
      
      const authToken = authState.token || '';
      
      // Make API call to your web app's create session endpoint
      const response = await fetch(`${webAppBaseURL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: sessionName,
          description: sessionDescription || null
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Error ${response.status}: Failed to create session`);
      }
      
      // Clear form fields
      setSessionName('');
      setSessionDescription('');
      
      // Switch to history tab and show the new session
      setActiveSection('history');
      
      // Fetch updated session history to include the new session
      fetchSessionHistory();
      
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening a session in your web app
  const handleOpenSession = (sessionId) => {
    chrome.tabs.create({ 
      url: `${webAppBaseURL}/sessions/${sessionId}`
    });
  };

  return (
    <div className="professor-dashboard">
      <h2>Professor Dashboard</h2>
      
      <div className="section-tabs">
        <button 
          className={activeSection === 'assistant' ? 'active' : ''} 
          onClick={() => setActiveSection('assistant')}
        >
          AI Teaching Assistant
        </button>
        <button 
          className={activeSection === 'history' ? 'active' : ''} 
          onClick={() => setActiveSection('history')}
        >
          Session History
        </button>
      </div>
      
      {activeSection === 'assistant' && (
        <div className="assistant-section">
          <h3>AI Teaching Assistant</h3>
          <p>Create a new teaching session for your students to join.</p>
          
          <div className="form-group">
            <input
              type="text"
              placeholder="Enter session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
          
          <div className="form-group">
            <textarea
              placeholder="Session description (optional)"
              value={sessionDescription}
              onChange={(e) => setSessionDescription(e.target.value)}
              rows="3"
            />
          </div>
          
          <button 
            onClick={handleCreateSession}
            disabled={isLoading || !sessionName.trim()}
          >
            {isLoading ? 'Creating...' : 'Create Session'}
          </button>
          
          {error && (
            <div className="error-message">Error: {error}</div>
          )}
          
          <div className="quick-actions">
            <button className="action-btn">Open AI Chat</button>
          </div>
        </div>
      )}
      
      {activeSection === 'history' && (
        <div className="history-section">
          <h3>Session History</h3>
          
          {isLoading && sessionHistory.length === 0 ? (
            <div className="loading">Loading sessions...</div>
          ) : error ? (
            <div className="error-message">Error: {error}</div>
          ) : sessionHistory.length === 0 ? (
            <p>No sessions created yet.</p>
          ) : (
            <ul className="session-list">
              {sessionHistory.map(session => {
                const isActive = session.status === 'active';
                const date = new Date(session.created_at).toLocaleDateString();
                
                return (
                  <li key={session.id} className="session-item">
                    <div className="session-info">
                      <span className="session-name">{session.title}</span>
                      <div className="session-meta">
                        <span className="session-code">Code: {session.code}</span>
                        <span className={`session-status ${isActive ? 'status-active' : 'status-ended'}`}>
                          {isActive ? 'Active' : 'Ended'}
                        </span>
                      </div>
                      <span className="session-date">{date}</span>
                      <div className="session-stats">
                        <span className="stat-label">Students:</span>
                        <span className="stat-value">{session.student_count || 0}</span>
                      </div>
                    </div>
                    {isActive && (
                      <button 
                        className="join-btn"
                        onClick={() => handleOpenSession(session.id)}
                      >
                        Open
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfessorDashboard;