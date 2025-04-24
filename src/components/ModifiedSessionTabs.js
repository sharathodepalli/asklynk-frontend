/**
 * ModifiedSessionTabs.jsx
 * 
 * Updated session tabs component that includes the anonymous questions dashboard
 */

import React, { useState, useEffect } from 'react';
import StudentQuestionForm from './StudentQuestionForm';
import ProfessorQuestionDashboard from './ProfessorQuestionDashboard';

const ModifiedSessionTabs = ({ sessionId, authToken, currentUser }) => {
  const [activeTab, setActiveTab] = useState('ai');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const isProfessor = currentUser?.role === 'professor';
  
  // Fetch session information
  useEffect(() => {
    if (!sessionId) return;
    
    const fetchSessionData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`http://localhost:3000/api/sessions/${sessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch session: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.ok === false) {
          throw new Error(data.error || 'Unknown error fetching session');
        }
        
        setSession(data.data);
      } catch (err) {
        console.error('Error loading session:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSessionData();
  }, [sessionId, authToken]);

  // Show tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'ai':
        return (
          <div id="lynkk-ai-content" className="lynkk-content active">
            <div className="lynkk-ai-container">
              <div className="lynkk-ai-messages" id="lynkk-ai-messages">
                <div className="lynkk-welcome-message">
                  <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#111827" }}>
                    Welcome to AskLynk AI Assistant
                  </h2>
                  <p style={{ fontSize: "14px", color: "#6b7280" }}>
                    Ask your questions and get instant answers!
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'chat':
        return (
          <div id="lynkk-chat-content" className="lynkk-content active">
            <div className="lynkk-chat-container">
              <div className="lynkk-messages" id="lynkk-messages-container">
                <div className="lynkk-loading">Loading messages...</div>
              </div>
            </div>
          </div>
        );
        
      case 'anonymous':
        return (
          <div id="lynkk-anonymous-content" className="lynkk-content active">
            <div className="lynkk-anonymous-container">
              {/* Student view: Question form and their previous questions */}
              {!isProfessor && (
                <>
                  <StudentQuestionForm 
                    sessionId={sessionId} 
                    authToken={authToken} 
                    sessionTitle={session?.title}
                    sessionDescription={session?.description}
                  />
                  
                  <div className="bg-white rounded-lg shadow-md p-4">
                    <h3 className="text-lg font-medium text-gray-800 mb-4">Your Questions</h3>
                    <div className="lynkk-anon-history" id="lynkk-anonymous-history">
                      <div className="lynkk-empty-state">Your anonymous questions will appear here.</div>
                    </div>
                  </div>
                </>
              )}
              
              {/* Professor view: Questions dashboard */}
              {isProfessor && (
                <ProfessorQuestionDashboard 
                  sessionId={sessionId} 
                  authToken={authToken}
                />
              )}
            </div>
          </div>
        );
        
      case 'polls':
        return (
          <div id="lynkk-polls-content" className="lynkk-content active">
            <div className="lynkk-polls-container">
              <div id="lynkk-polls-list" className="lynkk-polls-list">
                <div className="lynkk-loading">Loading polls...</div>
              </div>
            </div>
          </div>
        );
        
      default:
        return <div>Tab content not found</div>;
    }
  };

  // Render input container based on active tab
  const renderInputContainer = () => {
    switch (activeTab) {
      case 'ai':
        return (
          <div id="lynkk-ai-input-container" className="lynkk-bottom-bar">
            <div className="lynkk-input-group">
              <input 
                type="text" 
                id="lynkk-ai-input" 
                placeholder="Ask the AI assistant..." 
                className="lynkk-input"
              />
              <button id="lynkk-ai-send" className="lynkk-send-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        );
        
      case 'chat':
        return (
          <div id="lynkk-chat-input-container" className="lynkk-bottom-bar">
            <div className="lynkk-input-group">
              <input 
                type="text" 
                id="lynkk-chat-input" 
                placeholder="Type your message..." 
                className="lynkk-input"
              />
              <button id="lynkk-send-message" className="lynkk-send-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        );
        
      case 'anonymous':
        // For students, the input is in the StudentQuestionForm
        // For professors, we don't need an input container
        return isProfessor ? null : null;
        
      case 'polls':
        // Only show for professors
        return isProfessor ? (
          <div id="lynkk-polls-input-container" className="lynkk-bottom-bar">
            <div className="lynkk-input-group">
              <button id="lynkk-create-poll" className="lynkk-full-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Create New Poll
              </button>
            </div>
          </div>
        ) : null;
        
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <p>Error loading session: {error}</p>
      </div>
    );
  }

  return (
    <div className="lynkk-dashboard">
      {/* Tab Navigation - Fixed at the top */}
      <div className="lynkk-nav-container">
        <nav className="lynkk-tabs">
          <button 
            id="lynkk-ai-tab" 
            className={`lynkk-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a9 9 0 0 1 9 9c0 3.18-1.65 5.64-4.5 7.5L12 22l-4.5-3.5C4.65 16.64 3 14.18 3 11a9 9 0 0 1 9-9z"/>
              <path d="M9 11l3 3 6-6"/>
            </svg>
            <span>AI</span>
          </button>
          
          <button 
            id="lynkk-chat-tab" 
            className={`lynkk-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Chat</span>
          </button>
          
          <button 
            id="lynkk-anonymous-tab" 
            className={`lynkk-tab ${activeTab === 'anonymous' ? 'active' : ''}`}
            onClick={() => setActiveTab('anonymous')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>{isProfessor ? 'Questions' : 'Anonymous'}</span>
          </button>
          
          <button 
            id="lynkk-polls-tab" 
            className={`lynkk-tab ${activeTab === 'polls' ? 'active' : ''}`}
            onClick={() => setActiveTab('polls')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <span>Polls</span>
          </button>
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="lynkk-tab-content">
        {renderTabContent()}
      </div>
      
      {/* Input Boxes - Fixed to Bottom */}
      {renderInputContainer()}
    </div>
  );
};

export default ModifiedSessionTabs;