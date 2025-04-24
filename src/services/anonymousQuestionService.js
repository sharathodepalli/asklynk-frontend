/**
 * Submit an anonymous question with comprehensive error handling
 * @param {Object} params - Submission parameters
 * @param {string} params.sessionId - ID of the current session
 * @param {string} params.authToken - Authentication token
 * @param {string} params.question - The question text
 * @param {boolean} params.isAnonymous - Whether the question is anonymous
 * @returns {Promise<Object>} Submission result
 */
async function submitAnonymousQuestion({
    sessionId, 
    authToken, 
    question, 
    isAnonymous = true
  }) {
    // Input validation
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
  
    if (!authToken) {
      throw new Error('Authentication token is missing');
    }
  
    const trimmedQuestion = question.trim();
    
    // Validate question length
    if (!trimmedQuestion) {
      throw new Error('Question cannot be empty');
    }
  
    if (trimmedQuestion.length < 5) {
      throw new Error('Question is too short. Please provide more details.');
    }
  
    if (trimmedQuestion.length > 500) {
      throw new Error('Question is too long. Maximum 500 characters allowed.');
    }
  
    // Profanity filter (basic example - you might want a more sophisticated solution)
    const profanityRegex = /\b(fuck|shit|damn|crap|bitch)\b/i;
    if (profanityRegex.test(trimmedQuestion)) {
      throw new Error('Please remove inappropriate language');
    }
  
    try {
      // AI-powered relevance check
      const relevanceCheck = await checkQuestionRelevance(trimmedQuestion);
  
      // Prepare submission payload
      const payload = {
        content: trimmedQuestion,
        type: isAnonymous ? 'anonymous' : 'public',
        relevance_score: relevanceCheck.relevance_score || 0.5
      };
  
      // Submit question to API
      const response = await fetch(`/api/sessions/${sessionId}/questions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
  
      // Check response status
      if (!response.ok) {
        // Try to parse error message from server
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || 
          `Failed to submit question. Status: ${response.status}`
        );
      }
  
      // Parse successful response
      const result = await response.json();
  
      // Additional validation of successful response
      if (!result.ok) {
        throw new Error(result.error || 'Unknown error occurred');
      }
  
      // Return the successfully submitted question
      return {
        success: true,
        message: 'Question submitted successfully',
        data: result.data
      };
  
    } catch (error) {
      // Log the full error for debugging
      console.error('Question submission error:', error);
  
      // Return a user-friendly error
      return {
        success: false,
        message: error.message || 'Failed to submit your question. Please try again.',
        error: error
      };
    }
  }
  
  /**
   * Check question relevance using AI
   * @param {string} questionText - The question to check
   * @returns {Promise<Object>} Relevance check result
   */
  async function checkQuestionRelevance(questionText) {
    try {
      // Prepare AI relevance check payload
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze the relevance of this question:
  "${questionText}"
  
  Guidelines:
  - Rate relevance from 0 to 1
  - 0: Completely irrelevant
  - 0.5: Somewhat relevant
  - 1: Highly relevant
  
  Provide a JSON response with:
  - relevance_score: number (0-1)
  - is_relevant: boolean
  - feedback: brief explanation
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
  
      // Send request to AI service
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GEMINI_API_REQUEST',
          payload
        }, result => {
          // Handle various failure scenarios
          if (!result || !result.success) {
            console.warn('AI relevance check failed, defaulting to allow');
            resolve({
              is_relevant: true,
              relevance_score: 0.7,
              feedback: 'Relevance check unavailable'
            });
            return;
          }
  
          try {
            // Extract and parse AI response
            const textResponse = result.data.candidates[0].content.parts[0].text;
            const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
              throw new Error('Invalid AI response format');
            }
            
            const responseData = JSON.parse(jsonMatch[0]);
            resolve(responseData);
          } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            resolve({
              is_relevant: true,
              relevance_score: 0.7,
              feedback: 'Relevance parsing failed'
            });
          }
        });
      });
    } catch (error) {
      console.error('Relevance check error:', error);
      // Fallback to allowing the question
      return {
        is_relevant: true,
        relevance_score: 0.7,
        feedback: 'Unexpected error in relevance check'
      };
    }
  }
  
  // Example usage
  async function handleQuestionSubmission() {
    try {
      const result = await submitAnonymousQuestion({
        sessionId: 'current-session-id',
        authToken: 'user-auth-token',
        question: 'What is the main topic of today\'s lecture?',
        isAnonymous: true
      });
  
      if (result.success) {
        // Handle successful submission
        alert(result.message);
      } else {
        // Handle submission error
        alert(result.message);
      }
    } catch (error) {
      console.error('Submission process error:', error);
      alert('An unexpected error occurred');
    }
  }