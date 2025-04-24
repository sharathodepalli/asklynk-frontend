import React, { useState, useEffect, useCallback } from 'react';

const StudentQuestionHistory = ({ sessionId, authToken }) => {
  // State management
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    hasMore: false
  });

  // Fetch questions with improved error handling and pagination
  const fetchQuestions = useCallback(async () => {
    // Prevent multiple simultaneous requests
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/anonymous/user/${sessionId}?page=${pagination.page}&limit=${pagination.limit}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Network or server error
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // API-level error handling
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch questions');
      }

      // Extract questions and pagination info
      const fetchedQuestions = data.data || [];
      const totalQuestions = data.total || 0;

      // Update questions state
      setQuestions(prev => 
        pagination.page === 1 
          ? fetchedQuestions 
          : [...prev, ...fetchedQuestions]
      );

      // Update pagination state
      setPagination(prev => ({
        ...prev,
        hasMore: (prev.page * prev.limit) < totalQuestions
      }));

    } catch (err) {
      console.error('Error fetching questions:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [sessionId, authToken, pagination.page, pagination.limit, loading]);

  // Initial and pagination effect
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Load more questions handler
  const handleLoadMore = () => {
    setPagination(prev => ({ ...prev, page: prev.page + 1 }));
  };

  // Render loading state
  if (loading && questions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
        <span className="ml-2">Loading your questions...</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md text-sm">
        <p>Error loading your questions: {error}</p>
        <button 
          onClick={() => {
            setPagination({ page: 1, limit: 10, hasMore: false });
            fetchQuestions();
          }}
          className="mt-2 px-4 py-2 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // Render empty state
  if (questions.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>You haven't asked any questions yet in this session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map(question => (
        <div 
          key={question.id} 
          className={`p-4 rounded-md ${question.resolved ? 'bg-gray-50' : 'bg-white'} border border-gray-200 relative`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-grow">
              <div className="mb-2">
                <span className="text-sm font-medium text-gray-800 block">
                  {question.content}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{new Date(question.created_at).toLocaleString()}</span>
                
                {question.anonymous_name && (
                  <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs">
                    {question.anonymous_name}
                  </span>
                )}
                
                {question.relevance_score > 0.8 && (
                  <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs">
                    High Priority
                  </span>
                )}
              </div>
            </div>
            
            {question.resolved && (
              <span className="absolute top-4 right-4 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Resolved
              </span>
            )}
          </div>
        </div>
      ))}
      
      {pagination.hasMore && (
        <div className="text-center mt-4">
          <button 
            onClick={handleLoadMore}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default StudentQuestionHistory;