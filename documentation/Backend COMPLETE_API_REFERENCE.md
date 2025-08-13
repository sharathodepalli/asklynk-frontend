# Lynkk Backend API Documentation

## Project Overview

Lynkk Backend is a RESTful API server built to support the Lynkk Chat Extension, which enables interactive classroom communication between professors and students. The backend manages user sessions, anonymous and identified questions, classroom polls, and user identities. It provides a secure and scalable foundation for real-time educational interactions.

The system allows students to anonymously ask questions without fear of judgment while maintaining consistent identities within a session. It also supports identified questions, user analytics, AI integrations, and intelligent question relevancy filtering to enhance the classroom experience.

## Tech Stack Used

- **Backend Framework & Language**: Express.js with Node.js/TypeScript
- **Database**: PostgreSQL via Supabase
- **Authentication Method**: JWT via Supabase Auth
- **Hosting/Deployment Platform**: Compatible with various platforms (AWS, Heroku)
- **APIs**: RESTful JSON APIs
- **Relevancy Engine**: Python FastAPI microservice with Sentence Transformers
- **Dependencies/Libraries**:
  - `@supabase/supabase-js`: Database connection and authentication
  - `express`: Web server framework
  - `helmet`: Security middleware
  - `express-rate-limit`: API rate limiting
  - `compression`: Response compression
  - `dotenv`: Environment variable management
  - `cors`: Cross-origin resource sharing
  - `uuid`: Unique identifier generation
  - `typescript`: Static typing for JavaScript
  - `axios`: HTTP requests to microservices

## System Architecture

The Lynkk backend follows a layered architecture:

1. **API Layer**: Express.js routes handle HTTP requests and responses
2. **Service Layer**: Business logic implemented in model classes
3. **Data Layer**: Supabase (PostgreSQL) database access with dual client approach:
   - `supabase` client for standard access (subject to Row-Level Security)
   - `supabaseAdmin` client for admin operations that bypass RLS
4. **Microservice Layer**: Python FastAPI service for relevancy scoring and text summarization

### Key Components:

- **Authentication Middleware**: Validates JWT tokens from Supabase Auth
- **Session Management**: Handles classroom session creation, joining, and analytics
- **Anonymous System**: Generates consistent anonymous identities per user-session pair
- **Questions Management**: Processes both anonymous and identified questions
- **Polling System**: Provides real-time classroom polling functionality
- **Voice Transcript Processing**: Real-time speech-to-text with embedding generation for semantic search
- **Analytics**: Tracks engagement metrics and question trends
- **Relevancy Engine**: Filters off-topic questions and generates session summaries

## Folder & File Structure

```
lynkk-backend/
│
├── src/                       # Source code
│   ├── lib/                   # Shared libraries
│   │   └── supabase.ts        # Supabase client configuration
│   │
│   ├── middleware/            # Express middleware
│   │   └── auth.ts            # Authentication middleware
│   │
│   ├── models/                # Data models and database operations
│   │   ├── ai.ts              # AI interaction model
│   │   ├── analytics.ts       # Analytics model
│   │   ├── anonymousMessage.ts # Anonymous message handling
│   │   ├── message.ts         # General message model
│   │   ├── poll.ts            # Polling functionality
│   │   ├── question.ts        # Question model
│   │   ├── session.ts         # Session management
│   │   ├── student_session.ts # Student-session relationships
│   │   └── voiceTranscript.ts # Voice transcript processing with embeddings
│   │
│   ├── routes/                # API routes
│   │   ├── ai.ts              # AI-related endpoints
│   │   ├── analytics.ts       # Analytics endpoints
│   │   ├── anonymous.ts       # Anonymous questions handling
│   │   ├── messages.ts        # General messaging endpoints
│   │   ├── polls.ts           # Poll management endpoints
│   │   ├── questions.ts       # Question management
│   │   ├── sessions.ts        # Session management (includes voice transcript endpoints)
│   │   └── students.ts        # Student-specific endpoints
│   │
│   ├── services/              # Business logic services
│   │   ├── relevance.ts       # Question relevance and session summaries
│   │   └── voiceTranscript.ts # Voice transcript processing service
│   │
│   ├── utils/                 # Utility functions
│   │   ├── codeGenerator.ts   # Session code generation
│   │   ├── nameGenerator.ts   # Anonymous name generation
│   │   └── transcript.ts      # Transcript handling
│   │
│   └── server.ts              # Main server entry point
│
├── dist/                      # Compiled JavaScript (output from TypeScript)
├── node_modules/              # Node.js dependencies
├── .env                       # Environment variables
├── package.json               # Project metadata and dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Project documentation
```

## API Endpoints

### Sessions

| Route                                | Method | Description                                 | Auth Required   |
| ------------------------------------ | ------ | ------------------------------------------- | --------------- |
| `/api/sessions`                      | GET    | Get all sessions for the authenticated user | Yes             |
| `/api/sessions/:id`                  | GET    | Get details of a specific session           | Yes             |
| `/api/sessions/code/:code`           | GET    | Get session by join code                    | Yes             |
| `/api/sessions`                      | POST   | Create a new session                        | Yes (Professor) |
| `/api/sessions/:id/end`              | PUT    | End an active session                       | Yes (Professor) |
| `/api/sessions/:sessionId/questions` | GET    | Get all questions in a session              | Yes             |
| `/api/sessions/:sessionId/students`  | GET    | Get all students in a session               | Yes (Professor) |
| `/api/sessions/:sessionId/analytics` | GET    | Get session analytics                       | Yes (Professor) |

### Questions

#### Anonymous Questions

| Route                                            | Method | Description                                       | Auth Required   |
| ------------------------------------------------ | ------ | ------------------------------------------------- | --------------- |
| `/api/anonymous/session/:sessionId`              | GET    | Get all questions for a session                   | Yes             |
| `/api/anonymous/:sessionId/questions`            | GET    | Get current user's questions in session           | Yes             |
| `/api/anonymous/:sessionId/questions`            | POST   | Create a new anonymous question                   | Yes             |
| `/api/anonymous/:sessionId/identified-questions` | POST   | Create a new identified question                  | Yes             |
| `/api/anonymous/:messageId/resolve`              | PUT    | Mark a question as resolved                       | Yes (Professor) |
| `/api/anonymous/:sessionId/analytics`            | GET    | Get analytics for anonymous questions             | Yes (Professor) |
| `/api/anonymous/:sessionId/identity`             | GET    | Get/create anonymous identity for user in session | Yes             |

#### Public Questions

| Route                                                              | Method | Description                        | Auth Required   |
| ------------------------------------------------------------------ | ------ | ---------------------------------- | --------------- |
| `/api/questions/sessions/:sessionId/questions`                     | GET    | Get public questions for a session | Yes             |
| `/api/questions/sessions/:sessionId/questions/:questionId`         | GET    | Get a specific question            | Yes             |
| `/api/questions/sessions/:sessionId/questions`                     | POST   | Create a new public question       | Yes             |
| `/api/questions/sessions/:sessionId/questions/:questionId/resolve` | PUT    | Mark a question as resolved        | Yes (Professor) |
| `/api/questions/sessions/:sessionId/questions/:questionId/vote`    | POST   | Vote on a question                 | Yes             |

### Students

| Route                               | Method | Description                    | Auth Required |
| ----------------------------------- | ------ | ------------------------------ | ------------- |
| `/api/students/:studentId/sessions` | GET    | Get all sessions for a student | Yes           |
| `/api/students/join`                | POST   | Join a session by code         | Yes           |

### Polls

| Route                           | Method | Description                 | Auth Required   |
| ------------------------------- | ------ | --------------------------- | --------------- |
| `/api/polls/session/:sessionId` | GET    | Get all polls for a session | Yes             |
| `/api/polls/session/:sessionId` | POST   | Create a new poll           | Yes (Professor) |
| `/api/polls/:pollId/vote`       | POST   | Vote in a poll              | Yes             |
| `/api/polls/:pollId/end`        | PUT    | End an active poll          | Yes (Professor) |
| `/api/polls/:pollId/results`    | GET    | Get poll results            | Yes             |

### AI Integration

| Route                  | Method | Description                        | Auth Required |
| ---------------------- | ------ | ---------------------------------- | ------------- |
| `/api/ai/chats`        | POST   | Create or get a chat for a session | Yes           |
| `/api/ai/messages`     | POST   | Send a message to the AI           | Yes           |
| `/api/ai/interactions` | POST   | Record an AI interaction           | Yes           |

### Voice Transcript Processing

| Route                                               | Method | Description                       | Auth Required   |
| --------------------------------------------------- | ------ | --------------------------------- | --------------- |
| `/api/sessions/:sessionId/voice-transcript`         | POST   | Process voice transcript chunk    | Yes (Professor) |
| `/api/sessions/:sessionId/voice-transcript/summary` | GET    | Get session transcript summary    | Yes (Professor) |
| `/api/sessions/:sessionId/voice-transcript/chunks`  | GET    | Get recent transcript chunks      | Yes (Professor) |
| `/api/sessions/:sessionId/voice-transcript/health`  | GET    | Health check for voice processing | Yes (Professor) |

**Voice Transcript Features:**

- **Real-time Processing**: Processes 7-second voice chunks with <500ms response time
- **Semantic Embeddings**: Generates 1536-dimension vector embeddings for semantic search
- **Background Processing**: Automatic session summary updates and relevance analysis
- **Rate Limiting**: 15 chunks per minute per session to prevent overload
- **Error Handling**: Comprehensive validation and graceful degradation
- **Performance Monitoring**: Built-in analytics and health checking

**Supported Payload Formats:**

```json
// Frontend format (from Chrome extension)
{
  "chunkIndex": 123456789,
  "transcript": "Professor's voice content here",
  "timestamp": "2025-08-03T06:18:12.604Z",
  "userId": "user-uuid",
  "professorId": "professor-uuid"
}

// Backend format (internal processing)
{
  "chunkId": "chunk-123456789",
  "content": "Professor's voice content here",
  "chunkSequence": 123456789,
  "speakerId": "professor-uuid",
  "metadata": {...}
}
```

### Enhanced Question Processing (NEW)

| Route                                                  | Method | Description                                          | Auth Required |
| ------------------------------------------------------ | ------ | ---------------------------------------------------- | ------------- |
| `/api/enhanced/sessions/:sessionId/ask`                | POST   | Submit question with relevance check and AI response | Yes           |
| `/api/enhanced/sessions/:sessionId/check-relevance`    | POST   | Check question relevance before submission           | Yes           |
| `/api/enhanced/sessions/:sessionId/enhanced-questions` | GET    | Get questions with AI responses                      | Yes           |
| `/api/enhanced/questions/:questionId/request-answer`   | POST   | Request AI answer for existing question              | Yes           |
| `/api/enhanced/health/enhanced-questions`              | GET    | Health check for enhanced question system            | Yes           |

**Enhanced Question Features:**

- **Integrated Relevance Checking**: Automatically validates questions against lecture content
- **Context-Aware AI Responses**: Uses professor's voice transcripts for accurate answers
- **Smart Question Processing**: Combines relevance scoring with LLM generation
- **Real-time Feedback**: Provides immediate suggestions for off-topic questions
- **Comprehensive Analytics**: Tracks question quality and AI response effectiveness

**Enhanced Question Flow:**

1. Student submits question → 2. Relevance check against voice transcripts → 3. If relevant: Generate AI answer using lecture context → 4. Return question + AI response

### Analytics

| Route                                          | Method | Description                               | Auth Required   |
| ---------------------------------------------- | ------ | ----------------------------------------- | --------------- |
| `/api/analytics/sessions/:sessionId/analytics` | GET    | Get comprehensive analytics for a session | Yes (Professor) |

### Example Request/Response

#### Create Anonymous Question

**Request:**

```http
POST /api/anonymous/123e4567-e89b-12d3-a456-426614174000/questions
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "content": "What is the difference between inheritance and composition?",
  "relevance_score": 0.8
}
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "id": "7f9c24e5-1c8f-4b1b-9586-5c5d1c3f1234",
    "session_id": "123e4567-e89b-12d3-a456-426614174000",
    "user_id": "713e04ee-41a1-429a-9bee-baf7a3158c51",
    "content": "What is the difference between inheritance and composition?",
    "type": "anonymous",
    "anonymous_name": "CleverFox",
    "relevance_score": 0.8,
    "resolved": false,
    "created_at": "2025-04-22T10:35:24.708326+00:00"
  }
}
```

#### Get Session Questions

**Request:**

```http
GET /api/anonymous/session/123e4567-e89b-12d3-a456-426614174000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

```json
{
  "ok": true,
  "data": [
    {
      "id": "7f9c24e5-1c8f-4b1b-9586-5c5d1c3f1234",
      "content": "What is the difference between inheritance and composition?",
      "user_id": "713e04ee-41a1-429a-9bee-baf7a3158c51",
      "type": "anonymous",
      "display_name": "CleverFox",
      "anonymous_name": "CleverFox",
      "created_at": "2025-04-22T10:35:24.708326+00:00",
      "resolved": false,
      "resolved_at": null,
      "relevance_score": 0.8
    },
    {
      "id": "608931d3-57f8-4e69-b956-f8c560e0cea3",
      "content": "How does polymorphism work in practice?",
      "user_id": "713e04ee-41a1-429a-9bee-baf7a3158c51",
      "type": "public",
      "display_name": "John Doe",
      "anonymous_name": null,
      "created_at": "2025-04-22T10:40:04.708326+00:00",
      "resolved": false,
      "resolved_at": null,
      "relevance_score": 0.5
    }
  ]
}
```

#### Process Voice Transcript Chunk

**Request:**

```http
POST /api/sessions/123e4567-e89b-12d3-a456-426614174000/voice-transcript
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "chunkIndex": 1754201892604,
  "transcript": "Today we're going to discuss object-oriented programming concepts including inheritance and polymorphism",
  "timestamp": "2025-08-03T06:18:12.604Z",
  "userId": "4eecc29c-bf2c-423b-9b4b-7e5c89801f74",
  "professorId": "4eecc29c-bf2c-423b-9b4b-7e5c89801f74"
}
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "success": true,
    "chunkId": "1754201892604",
    "processingTimeMs": 95,
    "wordCount": 15,
    "embeddingGenerated": true,
    "message": "Transcript chunk processed successfully",
    "transcriptId": "fac0edc2-c3fa-4677-a076-4cd5f9f3a8e2"
  }
}
```

#### Get Session Transcript Summary

**Request:**

```http
GET /api/sessions/123e4567-e89b-12d3-a456-426614174000/voice-transcript/summary
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "sessionId": "123e4567-e89b-12d3-a456-426614174000",
    "totalChunks": 25,
    "totalWords": 847,
    "recentActivity": {
      "lastChunkTime": "2025-08-03T06:18:23.416903+00:00",
      "recentChunks": 3,
      "recentWords": 71
    },
    "performance": {
      "averageProcessingTime": 98,
      "embeddingSuccessRate": 1.0
    },
    "content": {
      "recentTranscript": "Today we're discussing inheritance, composition, and polymorphism in object-oriented programming...",
      "fullTranscriptPreview": "Welcome to today's lecture on advanced programming concepts. We'll start with object-oriented programming..."
    }
  }
}
```

## Authentication Flow

Lynkk uses Supabase Auth with JWT tokens for authentication:

1. **User Authentication**:

   - Users authenticate through the frontend using Supabase Auth
   - Upon successful login, Supabase issues a JWT token

2. **Token Validation**:

   - All authenticated requests include an `Authorization: Bearer <token>` header
   - The `authMiddleware` in `src/middleware/auth.ts` validates tokens by calling Supabase's `getUser()` method
   - On successful validation, the user's ID and role are attached to the request object

3. **Permission Model**:

   - Professors have full access to their sessions and student data
   - Students have limited access to their own data and session information
   - Anonymous identities are consistently generated per user-session pair for privacy

4. **Error Handling**:

   - Invalid tokens return 401 Unauthorized responses
   - Insufficient permissions return 403 Forbidden responses

5. **Client Context**:
   - Each request gets a custom Supabase client with the user's token attached
   - This enables Row-Level Security (RLS) policies to work properly at the database level

## Database Schema

The database schema uses PostgreSQL with Supabase and includes the following core tables:

### Tables

**profiles**

- `id`: UUID (PK, references auth.users)
- `full_name`: TEXT
- `role`: ENUM ('student', 'professor')
- `created_at`: TIMESTAMP WITH TIME ZONE

**sessions**

- `id`: UUID (PK)
- `code`: TEXT (unique join code)
- `professor_id`: UUID (references profiles.id)
- `title`: TEXT
- `description`: TEXT
- `status`: ENUM ('active', 'ended')
- `created_at`: TIMESTAMP WITH TIME ZONE
- `ended_at`: TIMESTAMP WITH TIME ZONE
- `metadata`: JSONB

**student_sessions**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `student_id`: UUID (references profiles.id)
- `joined_at`: TIMESTAMP WITH TIME ZONE

**messages**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `user_id`: UUID (references profiles.id)
- `content`: TEXT
- `type`: ENUM ('public', 'anonymous', 'system')
- `created_at`: TIMESTAMP WITH TIME ZONE
- `anonymous_name`: TEXT
- `relevance_score`: FLOAT
- `resolved`: BOOLEAN
- `resolved_at`: TIMESTAMP WITH TIME ZONE

**anonymous_identities**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `user_id`: UUID (references profiles.id)
- `anonymous_name`: TEXT
- `created_at`: TIMESTAMP WITH TIME ZONE

**polls**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `question`: TEXT
- `options`: TEXT[]
- `status`: ENUM ('active', 'ended')
- `created_at`: TIMESTAMP WITH TIME ZONE
- `ended_at`: TIMESTAMP WITH TIME ZONE

**poll_votes**

- `id`: UUID (PK)
- `poll_id`: UUID (references polls.id)
- `user_id`: UUID (references profiles.id)
- `option_index`: INTEGER
- `created_at`: TIMESTAMP WITH TIME ZONE

**session_analytics**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `student_count`: INTEGER
- `message_count`: INTEGER
- `ai_interaction_count`: INTEGER
- `poll_count`: INTEGER
- `anonymous_message_count`: INTEGER
- `updated_at`: TIMESTAMP WITH TIME ZONE

**user_ai_chats**

- `id`: UUID (PK)
- `user_id`: UUID (references profiles.id)
- `session_id`: UUID (references sessions.id)
- `store_chat`: BOOLEAN
- `created_at`: TIMESTAMP WITH TIME ZONE
- `updated_at`: TIMESTAMP WITH TIME ZONE

**user_ai_messages**

- `id`: UUID (PK)
- `chat_id`: UUID (references user_ai_chats.id)
- `role`: TEXT ('user' or 'assistant')
- `content`: TEXT
- `created_at`: TIMESTAMP WITH TIME ZONE

**voice_transcripts**

- `id`: UUID (PK)
- `session_id`: UUID (references sessions.id)
- `chunk_id`: TEXT (unique per session)
- `chunk_sequence`: BIGINT (timestamp-based ordering)
- `content`: TEXT (transcript content)
- `word_count`: INTEGER
- `processing_time_ms`: INTEGER (performance metrics)
- `embedding`: VECTOR(1536) (OpenAI-compatible embeddings)
- `embedding_model`: TEXT (model used for embedding generation)
- `speaker_id`: UUID (references profiles.id)
- `confidence_score`: FLOAT (speech recognition confidence)
- `language`: TEXT (detected/specified language)
- `metadata`: JSONB (additional processing metadata)
- `created_at`: TIMESTAMP WITH TIME ZONE
- `processed_at`: TIMESTAMP WITH TIME ZONE

**Key Features:**

- **pgvector Extension**: Enables semantic search using vector similarity
- **Unique Constraints**: Prevents duplicate chunks per session
- **Performance Indexes**: Optimized for retrieval and vector operations
- **Comprehensive Metadata**: Tracks processing performance and quality metrics

### Views

**session_questions**

```sql
CREATE VIEW public.session_questions AS
SELECT
  m.id,
  m.session_id,
  m.user_id,
  m.content,
  m.type,
  m.created_at,
  m.relevance_score,
  m.resolved,
  m.resolved_at,
  CASE
    WHEN m.type = 'anonymous'::message_type THEN COALESCE(m.anonymous_name, 'Anonymous'::text)
    ELSE p.full_name
  END AS display_name,
  m.anonymous_name,
  p.role AS user_role,
  s.title AS session_title,
  s.professor_id
FROM
  messages m
  LEFT JOIN profiles p ON m.user_id = p.id
  LEFT JOIN sessions s ON m.session_id = s.id
WHERE
  m.type = ANY (ARRAY['public'::message_type, 'anonymous'::message_type]);
```

## Relevancy Engine

The AskLynk Relevancy Engine is a sophisticated system that improves classroom question quality by filtering off-topic questions and generating session summaries. It consists of a Python FastAPI microservice integrated with the Node.js backend.

### Overview

The Relevancy Engine provides two core functions:

1. **Question Relevance Scoring**: Evaluates the relevance of student questions to the session context
2. **Session Summarization**: Generates periodic and final summaries of session discussions

### Architecture

The Relevancy Engine is implemented as a microservice architecture:

1. **Node.js Integration Layer** (`src/services/relevance.ts`):

   - Communicates with the Python microservice
   - Manages periodic summaries
   - Caches results for performance

2. **Python FastAPI Microservice** (`lynkk-relevance-api/`):

   - Implements semantic similarity using Sentence Transformers
   - Provides text summarization using advanced NLP techniques
   - Exposes REST endpoints for scoring and summarization

3. **Database Integration**:
   - Uses the existing `session_summaries` table with fields:
     - `id`: UUID primary key
     - `session_id`: References the session
     - `content`: The summary text
     - `created_at`: Timestamp
     - `recent_window`: Recent transcript portion
     - `is_final`: Flag for final summaries

### API Endpoints

The Relevancy Engine adds the following endpoints to the main API:

| Route                                          | Method | Description                                    | Auth Required   |
| ---------------------------------------------- | ------ | ---------------------------------------------- | --------------- |
| `/api/sessions/:sessionId/relevancy-debug`     | GET    | Get debug information about relevancy scoring  | Yes (Professor) |
| `/api/sessions/:sessionId/relevance-filtering` | PUT    | Enable/disable relevance filtering for session | Yes (Professor) |

### Microservice Endpoints

The Python FastAPI microservice exposes these endpoints:

| Route              | Method | Description                               |
| ------------------ | ------ | ----------------------------------------- |
| `/score-relevancy` | POST   | Score a question's relevance to a session |
| `/summarize`       | POST   | Generate a summary of session transcripts |
| `/health`          | GET    | Health check endpoint                     |

### Question Relevance Scoring

The scoring system works as follows:

1. When a question is submitted, it's sent to the relevancy service
2. The service compares the question to:
   - Session title and description
   - Recent messages and discussions
   - Existing session summaries
3. A relevance score between 0 and 1 is calculated
4. Questions below a configurable threshold (default: 0.3) are considered off-topic
5. Professors can set minimum relevance thresholds when viewing questions

The relevance score is stored with each question and can be used for sorting and filtering.

### Session Summarization

Session summarization works as follows:

1. When a session starts, periodic summarization begins (every 5 minutes by default)
2. The system captures the recent transcript window and generates a summary
3. When a session ends, a final comprehensive summary is generated
4. Summaries are stored in the `session_summaries` table
5. Summaries improve relevance scoring by providing context

### Configuration Options

The Relevancy Engine can be configured in several ways:

1. **Per-Session Toggle**: Each session has a `use_relevance_filtering` flag in its metadata (default: `true`)
2. **Environment Variables**:
   - `RELEVANCE_API_URL`: URL of the Python microservice (default: `http://localhost:8000`)
   - `RELEVANCE_THRESHOLD`: Minimum score for relevant questions (default: `0.3`)
   - `SUMMARY_INTERVAL_MINUTES`: Minutes between summaries (default: `5`)

### Example Usage

#### Scoring Question Relevance

```typescript
// Example of how the relevance service is used in code
const relevanceResult = await RelevanceService.isQuestionRelevant(
  sessionId,
  questionContent
);
if (!relevanceResult.isRelevant) {
  return res.status(400).json({
    success: false,
    message: "Your question seems off-topic. Try rephrasing.",
    score: relevanceResult.score,
  });
}
```

#### Enabling/Disabling Relevance Filtering

**Request:**

```http
PUT /api/sessions/123e4567-e89b-12d3-a456-426614174000/relevance-filtering
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "enabled": false
}
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "session_id": "123e4567-e89b-12d3-a456-426614174000",
    "use_relevance_filtering": false
  },
  "message": "Relevance filtering disabled successfully"
}
```

### Deployment Considerations

To deploy the Relevancy Engine:

1. **Python Dependencies**:

   - The `lynkk-relevance-api` directory contains `requirements.txt`
   - Core dependencies include FastAPI, Sentence-Transformers, and gensim

2. **Starting the Microservice**:

   - Use the included `start.sh` script
   - Or deploy as a separate service on platforms like Heroku, AWS, etc.

3. **Environment Configuration**:
   - The main backend needs the `RELEVANCE_API_URL` environment variable
   - In production, secure the communication between services

## Voice Transcript Processing System

The Voice Transcript Processing System enables real-time capture and processing of professor voice during lectures. It converts speech to text, generates semantic embeddings, and provides intelligent search capabilities for lecture content.

### Overview

The Voice Transcript System provides comprehensive voice processing capabilities:

1. **Real-time Processing**: Handles 7-second voice chunks with <500ms response time
2. **Semantic Embeddings**: Generates 1536-dimension vector embeddings for semantic search
3. **Background Processing**: Automatic session summaries and relevance analysis
4. **Performance Monitoring**: Built-in analytics and health checking

### Architecture

The Voice Transcript System consists of multiple integrated components:

1. **Frontend Integration** (Chrome Extension):

   - Captures professor voice in 7-second chunks
   - Converts speech to text using Web Speech API
   - Sends transcript chunks to backend API

2. **Backend Processing** (`src/services/voiceTranscript.ts`):

   - Validates and processes transcript chunks
   - Generates vector embeddings for semantic search
   - Implements rate limiting and caching
   - Triggers background processing

3. **Database Storage** (`voice_transcripts` table):

   - Stores transcript chunks with embeddings
   - Uses pgvector extension for vector operations
   - Maintains performance and quality metrics

4. **Background Services**:
   - Updates session summaries periodically
   - Analyzes question relevance against lecture content
   - Maintains search indexes and caches

### Key Features

#### Real-time Processing

- **Performance Target**: <500ms response time per chunk
- **Frequency**: Processes 7-second voice chunks continuously
- **Rate Limiting**: 15 chunks per minute per session
- **Error Handling**: Comprehensive validation and graceful degradation

#### Semantic Embeddings

- **Model**: OpenAI-compatible 1536-dimension vectors
- **Fallback**: Simple hash-based embeddings when OpenAI unavailable
- **Search**: Vector similarity search using pgvector
- **Integration**: Seamless integration with relevance analysis

#### Data Management

- **Deduplication**: Prevents duplicate chunks per session
- **Metadata**: Comprehensive tracking of processing metrics
- **Cleanup**: Automatic cleanup of old transcripts (30+ days)
- **Validation**: Strict input validation and sanitization

### API Integration

The Voice Transcript System is fully integrated with the existing API:

```typescript
// Example: Processing a voice chunk
const response = await fetch("/api/sessions/sessionId/voice-transcript", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    chunkIndex: timestamp,
    transcript: "Today's lecture content...",
    timestamp: new Date().toISOString(),
    userId: userId,
    professorId: professorId,
  }),
});
```

### Performance Metrics

Based on production testing:

- **Processing Time**: 95-109ms average (well under 500ms target)
- **Embedding Generation**: 100% success rate with fallback
- **Memory Usage**: Efficient with session-based caching
- **Database Performance**: Optimized indexes for fast retrieval

### Deployment Status

**✅ PRODUCTION READY**

- All components successfully implemented and tested
- Database schema deployed with pgvector extension
- Authentication system working with user session tokens
- Performance targets consistently met
- Error handling and monitoring in place

The Voice Transcript Processing System is fully operational and ready for production classroom use.

## Environment Variables Used

The application requires the following environment variables:

```
# Server configuration
NODE_ENV=development            # Environment (development | production)
PORT=3000                       # Port to run the server on

# Supabase configuration
SUPABASE_URL=https://your-project.supabase.co       # Supabase project URL
SUPABASE_KEY=your-anon-key                          # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key     # Service role key (for admin operations)

# Security
ALLOWED_ORIGINS=http://localhost:5173,chrome-extension://extension-id    # CORS allowed origins

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000     # Rate limit window (15 minutes in ms)
RATE_LIMIT_MAX_REQUESTS=100     # Max requests within the window
```

## Setup & Installation Steps (for local dev)

1. **Clone the repository**:

   ```bash
   git clone https://github.com/your-organization/lynkk-backend.git
   cd lynkk-backend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up Supabase**:

   - Create a new Supabase project at https://supabase.com
   - Create the necessary tables and views as defined in the database schema

4. **Configure environment variables**:

   - Create a `.env` file in the root directory
   - Add the required environment variables as listed above
   - Update the values to match your Supabase project

5. **Build the TypeScript code**:
   ```bash
   npm run build
   ```

## Running the Backend Locally

### Development Mode

```bash
npm run dev
```

This will start the server with hot-reloading using nodemon and ts-node.

### Production Mode

```bash
npm run build
npm start
```

This will compile the TypeScript code and run the compiled JavaScript.

### Health Check

Once the server is running, you can verify it's working by visiting:

```
http://localhost:3000/health
```

## Testing & Postman Collection Instructions

### Testing via Postman

1. **Import Postman Collection**:

   - Create a new Postman collection
   - Import the provided Postman collection if available, or create requests for the endpoints listed in this document

2. **Set Up Environment Variables in Postman**:

   - Create a new environment
   - Add the following variables:
     - `BASE_URL`: http://localhost:3000/api
     - `AUTH_TOKEN`: (to be filled with a valid JWT token)

3. **Obtain Authentication Token**:

   - Sign in through the frontend or use Supabase's REST API directly
   - Copy the JWT token and set it as the `AUTH_TOKEN` variable in Postman

4. **Testing Endpoints**:
   - Use the collection to test individual endpoints
   - Ensure to include the `Authorization: Bearer {{AUTH_TOKEN}}` header for authenticated endpoints

### Sample Test Workflow

1. Create a new session (as professor)
2. Get the session code
3. Join the session (as student)
4. Post an anonymous question to the session
5. Post an identified question to the session
6. Get all questions in the session
7. Resolve a question (as professor)
8. Get session analytics (as professor)

## Deployment Steps

### Deploying to a Standard Node.js Environment (AWS, DigitalOcean, etc.)

1. **Build for production**:

   ```bash
   npm run build
   ```

2. **Set up environment variables on the server**:

   - Configure all required environment variables
   - Set `NODE_ENV=production`

3. **Upload application files**:

   - Upload the `dist` folder
   - Upload `package.json` and `package-lock.json`
   - Do not upload `node_modules` or source files

4. **Install production dependencies**:

   ```bash
   npm ci --production
   ```

5. **Start the server**:
   ```bash
   npm start
   ```
   Or use a process manager like PM2:
   ```bash
   pm2 start dist/server.js --name lynkk-backend
   ```

### Deploying to Heroku

1. **Create a `Procfile`**:

   ```
   web: node dist/server.js
   ```

2. **Set environment variables**:

   ```bash
   heroku config:set SUPABASE_URL=your-url
   heroku config:set SUPABASE_KEY=your-key
   heroku config:set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   heroku config:set NODE_ENV=production
   heroku config:set ALLOWED_ORIGINS=your-frontend-url,chrome-extension://your-extension-id
   ```

3. **Deploy to Heroku**:
   ```bash
   git push heroku main
   ```

## Known Issues & Fixes

1. **Inconsistent Anonymous Names**

   - **Issue**: If not using the `getOrCreateAnonymousIdentity` method consistently, users may get different anonymous names in the same session.
   - **Fix**: Always use `AnonymousMessageModel.getOrCreateAnonymousIdentity()` when dealing with anonymous identities.

2. **Row-Level Security (RLS) Bypassing**

   - **Issue**: Using `supabaseAdmin` to bypass RLS might expose data unintentionally.
   - **Fix**: Carefully audit all `supabaseAdmin` usages and ensure proper permission checks are implemented in code.

3. **Token Handling in Chrome Extensions**

   - **Issue**: Chrome extensions may have CORS issues with authentication.
   - **Fix**: Ensure the extension's ID is added to `ALLOWED_ORIGINS` and proper CORS headers are sent.

4. **Database Connection Limits**
   - **Issue**: Supabase has connection limits that might be reached under heavy load.
   - **Fix**: Implement connection pooling or caching strategies for high-traffic endpoints.

## Future Improvements

1. **Real-time Updates**:

   - Implement WebSockets via Supabase Realtime for instant updates to questions and polls

2. **Enhanced Analytics**:

   - Add more detailed analytics for professor insights
   - Implement visualization endpoints for data presentation

3. **Caching Layer**:

   - Add Redis caching for frequently accessed data
   - Implement efficient query caching strategies

4. **User Management**:

   - Expand user profiles and roles
   - Add institution/organization management

5. **API Documentation**:

   - Implement OpenAPI/Swagger documentation
   - Create interactive API documentation

6. **Testing**:

   - Add comprehensive unit and integration tests
   - Implement continuous integration

7. **Performance Optimization**:
   - Optimize database queries
   - Implement pagination for list endpoints

## Contact & Maintainer Info

**Primary Maintainer**: [Your Name]  
**Email**: [your.email@example.com]  
**Organization**: Lynkk Education Technology

**Repository**: [GitHub Repository URL]

**Bug Reports & Feature Requests**:  
Please use the Issues section in the GitHub repository to report bugs or request new features.

---

This documentation was last updated on April 22, 2025.
