import React, { useState, useEffect, useCallback } from 'react';

const StudentQuestionForm = ({ 
  sessionId, 
  authToken, 
  sessionTitle = '', 
  sessionDescription = '' 
}) => {
  // State management
  const [question, setQuestion] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [anonymousName, setAnonymousName] = useState(null);
  
  // Fetch anonymous identity
  const fetchAnonymousIdentity = useCallback(async () => {
    if (!sessionId || !isAnonymous) return;
    
    try {
      const response = await fetch(`/api/anonymous/identity/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch anonymous identity');
      }
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
      }
      
      setAnonymousName(data.anonymousName || 'Anonymous');
    } catch (err) {
      console.error('Error fetching anonymous identity:', err);
      setAnonymousName('Anonymous');
      setError('Could not retrieve anonymous identity');
    }
  }, [sessionId, isAnonymous, authToken]);
  
  // Validate question relevance
  const checkQuestionRelevance = async (questionText) => {
    try {
      const context = `
Session title: ${sessionTitle || 'N/A'}
Session description: ${sessionDescription || 'N/A'}
`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze this student question's relevance to the session:
Question: "${questionText}"
Session Context: ${context}

Guidelines:
- Rate relevance from 0 to 1
- 0: Completely unrelated
- 0.5: Somewhat related
- 1: Highly relevant to session

Provide a JSON response with:
- relevance_score: number (0-1)
- is_relevant: boolean
- feedback: explanation if not relevant
`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GEMINI_API_REQUEST',
          payload
        }, result => {
          if (!result || !result.success) {
            // Fallback to default relevance if AI check fails
            resolve({
              is_relevant: true,
              relevance_score: 0.7,
              feedback: "AI relevance check unavailable. Question allowed."
            });
            return;
          }
          
          try {
            const textResponse = result.data.candidates[0].content.parts[0].text;
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
              throw new Error('Could not parse JSON response');
            }
            
            const responseData = JSON.parse(jsonMatch[0]);
            resolve(responseData);
          } catch (err) {
            console.error('Error parsing AI response:', err);
            resolve({
              is_relevant: true,
              relevance_score: 0.7,
              feedback: "AI relevance parsing failed. Question allowed."
            });
          }
        });
      });
    } catch (err) {
      console.error('Relevance check error:', err);
      // Default to allowing the question
      return {
        is_relevant: true,
        relevance_score: 0.7,
        feedback: "Relevance check encountered an error. Question allowed."
      };
    }
  };
  
  // Submit question handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset previous states
    setError(null);
    setFeedback(null);
    
    // Validate question
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError('Please enter a question');
      return;
    }
    
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // Check question relevance
      const relevanceCheck = await checkQuestionRelevance(trimmedQuestion);
      
      if (!relevanceCheck.is_relevant) {
        setFeedback({
          type: 'warning',
          message: relevanceCheck.feedback || 'Please stay on topic and ask questions relevant to the session.'
        });
        setIsSubmitting(false);
        return;
      }
      
      // Prepare submission payload
      const payload = {
        content: trimmedQuestion,
        type: isAnonymous ? 'anonymous' : 'public',
        relevance_score: relevanceCheck.relevance_score || 0.5
      };
      
      // Submit question
      const response = await fetch(`/api/sessions/${sessionId}/questions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to submit question');
      }
      
      // Success handling
      setFeedback({
        type: 'success',
        message: 'Your question has been submitted successfully!'
      });
      
      // Reset form
      setQuestion('');
      
      // Optional: Trigger refresh of question history
      // You might need to pass a callback or use context/state management
    } catch (err) {
      console.error('Question submission error:', err);
      setError(err.message || 'Failed to submit your question');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Trigger anonymous identity fetch when anonymous mode is toggled
  useEffect(() => {
    if (isAnonymous) {
      fetchAnonymousIdentity();
    }
  }, [isAnonymous, fetchAnonymousIdentity]);
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-800">Ask a Question</h3>
        
        <div className="flex items-center">
          <span className="text-sm text-gray-600 mr-2">Anonymous</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={isAnonymous}
              onChange={() => setIsAnonymous(!isAnonymous)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>
      
      {isAnonymous && anonymousName && (
        <div className="mb-4 text-sm bg-purple-50 p-2 rounded-md text-purple-700">
          <span className="font-medium">Your anonymous identity: </span>
          {anonymousName}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <textarea
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows="3"
            placeholder="Type your question here..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isSubmitting}
          ></textarea>
        </div>
        
        {error && (
          <div className="mb-4 p-2 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
        
        {feedback && (
          <div className={`mb-4 p-2 rounded-md text-sm ${
            feedback.type === 'success' 
              ? 'bg-green-50 text-green-700' 
              : 'bg-yellow-50 text-yellow-700'
          }`}>
            {feedback.message}
          </div>
        )}
        
        <div className="flex justify-end">
          <button
            type="submit"
            className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
              isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
            }`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit Question'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentQuestionForm;