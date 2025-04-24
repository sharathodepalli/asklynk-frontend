// StudentDashboard.jsx
import React, { useState } from 'react';

function StudentDashboard({ user }) {
  const [sessionCode, setSessionCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [joinedSessions, setJoinedSessions] = useState([]);
  
  // Load joined sessions on component mount
  React.useEffect(() => {
    chrome.storage.local.get(['studentSessions'], (result) => {
      if (result.studentSessions) {
        setJoinedSessions(result.studentSessions);
      }
    });
  }, []);

  // Handle joining a session
  const handleJoinSession = () => {
    if (!sessionCode.trim()) {
      setJoinError('Please enter a session code');
      return;
    }
    
    setIsLoading(true);
    setJoinError('');
    
    // Here you would typically make an API call to verify and join the session
    // Simulating with a timeout
    setTimeout(() => {
      if (sessionCode === 'invalid') {
        setJoinError('Invalid session code');
        setIsLoading(false);
        return;
      }
      
      const newSession = {
        id: sessionCode,
        name: `Session ${sessionCode.substring(0, 5)}`,
        joinedAt: new Date().toISOString()
      };
      
      // Store in local history
      const updatedSessions = [newSession, ...joinedSessions];
      setJoinedSessions(updatedSessions);
      setSessionCode('');
      setIsLoading(false);
      
      // Store in chrome.storage
      chrome.storage.local.set({ studentSessions: updatedSessions });
    }, 500);
  };

  return (
    <div className="student-dashboard">
      <h2>Student Dashboard</h2>
      
      <div className="join-session">
        <h3>Join a Session</h3>
        <p>Enter the session code provided by your professor.</p>
        
        <div className="form-group">
          <input
            type="text"
            placeholder="Enter session code"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value)}
          />
          <button 
            onClick={handleJoinSession}
            disabled={isLoading || !sessionCode.trim()}
          >
            {isLoading ? 'Joining...' : 'Join Session'}
          </button>
        </div>
        
        {joinError && <p className="error-message">{joinError}</p>}
      </div>
      
      <div className="quick-actions">
        <button className="action-btn">Open AI Assistant</button>
      </div>
      
      {joinedSessions.length > 0 && (
        <div className="recent-sessions">
          <h3>Recent Sessions</h3>
          <ul className="session-list">
            {joinedSessions.map(session => (
              <li key={session.id} className="session-item">
                <div className="session-info">
                  <span className="session-name">{session.name}</span>
                  <span className="session-date">
                    {new Date(session.joinedAt).toLocaleDateString()}
                  </span>
                </div>
                <button className="join-btn">Rejoin</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default StudentDashboard;