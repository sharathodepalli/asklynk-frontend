import React, { useState, useEffect, useCallback, useMemo } from 'react';

const ProfessorQuestionDashboard = ({ sessionId, authToken }) => {
  // State management
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filtering and sorting states
  const [filters, setFilters] = useState({
    searchTerm: '',
    status: 'all', // 'all', 'unresolved', 'resolved'
    priorityFilter: 'all' // 'all', 'high', 'low'
  });
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'created_at',
    direction: 'desc'
  });

  // Fetch questions with advanced error handling
  const fetchQuestions = useCallback(async () => {
    if (!sessionId || !authToken) {
      setError('Missing session or authentication details');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        sessionId,
        status: filters.status,
        priority: filters.priorityFilter,
        search: filters.searchTerm
      });

      const response = await fetch(`/api/sessions/${sessionId}/questions?${queryParams}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch questions');
      }

      setQuestions(data.data || []);
    } catch (err) {
      console.error('Error fetching questions:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [sessionId, authToken, filters]);

  // Initial and filter effect
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Memoized and filtered questions
  const processedQuestions = useMemo(() => {
    let result = [...questions];

    // Sorting
    result.sort((a, b) => {
      if (sortConfig.key === 'created_at') {
        return sortConfig.direction === 'desc'
          ? new Date(b.created_at) - new Date(a.created_at)
          : new Date(a.created_at) - new Date(b.created_at);
      }

      if (sortConfig.key === 'relevance') {
        return sortConfig.direction === 'desc'
          ? b.relevance_score - a.relevance_score
          : a.relevance_score - b.relevance_score;
      }

      return 0;
    });

    return result;
  }, [questions, sortConfig]);

  // Handle question resolution
  const handleResolveQuestion = async (questionId, isResolved) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/questions/${questionId}/resolve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resolved: isResolved })
      });

      if (!response.ok) {
        throw new Error(`Failed to update question: ${response.status}`);
      }

      // Optimistically update local state
      setQuestions(prev => 
        prev.map(q => 
          q.id === questionId 
            ? { ...q, resolved: isResolved } 
            : q
        )
      );
    } catch (error) {
      console.error('Error resolving question:', error);
      alert(`Failed to ${isResolved ? 'resolve' : 'unresolve'} the question`);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <p>Error loading questions: {error}</p>
        <button 
          className="mt-2 px-4 py-2 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
          onClick={fetchQuestions}
        >
          Retry
        </button>
      </div>
    );
  }

  // Render empty state
  if (processedQuestions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-500">No questions have been asked yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Filters and Sorting */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex space-x-2">
          {/* Search Input */}
          <input 
            type="text"
            placeholder="Search questions..."
            value={filters.searchTerm}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            className="border rounded px-2 py-1"
          />

          {/* Status Filter */}
          <select 
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="border rounded px-2 py-1"
          >
            <option value="all">All Questions</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Priority Filter */}
          <select 
            value={filters.priorityFilter}
            onChange={(e) => setFilters(prev => ({ ...prev, priorityFilter: e.target.value }))}
            className="border rounded px-2 py-1"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

        {/* Sorting */}
        <div>
          <select 
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('-');
              setSortConfig({ key, direction });
            }}
            className="border rounded px-2 py-1"
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="relevance-desc">Highest Priority</option>
            <option value="relevance-asc">Lowest Priority</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {processedQuestions.map(question => (
          <div 
            key={question.id} 
            className={`p-4 rounded-lg border ${
              question.resolved 
                ? 'bg-gray-50 border-gray-200' 
                : 'bg-white border-blue-100'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-grow pr-4">
                {/* Question Content */}
                <p className="text-gray-800 mb-2">{question.content}</p>

                {/* Metadata */}
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {/* Anonymous or Identified Badge */}
                  <span className={`px-2 py-1 rounded-full ${
                    question.type === 'anonymous' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {question.type === 'anonymous' ? 'Anonymous' : 'Identified'}
                  </span>

                  {/* Priority Badge */}
                  {question.relevance_score > 0.8 && (
                    <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                      High Priority
                    </span>
                  )}

                  {/* Timestamp */}
                  <span>{new Date(question.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Resolve/Unresolve Button */}
              <button 
                onClick={() => handleResolveQuestion(question.id, !question.resolved)}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  question.resolved 
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {question.resolved ? 'Unresolve' : 'Resolve'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination or "No more questions" could be added here */}
    </div>
  );
};

export default ProfessorQuestionDashboard;