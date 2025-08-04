# AskLynk Chrome Extension

## 🎓 What is AskLynk?

AskLynk is an **AI-powered Chrome Extension** that transforms traditional classroom interactions by creating **intelligent, anonymous, and context-aware learning environments**. It bridges the gap between professors and students through real-time AI assistance, anonymous question systems, and interactive classroom tools.

## 🚀 Core Product Features

### 1. **Intelligent AI Assistant with Dual Modes**

- **Context-Aware AI**: When students are in active learning sessions, provides personalized responses based on lecture content, transcript data, and session context
- **General AI Assistant**: Standalone AI helper available anytime for general academic questions
- **Real-time Streaming**: ChatGPT-like streaming responses for natural conversation flow
- **Smart Routing**: Automatically detects user context and routes to appropriate AI endpoint

### 2. **Anonymous Question System**

- **Safe Learning Environment**: Students can ask questions without revealing identity
- **Persistent Anonymous Identities**: Consistent anonymous personas within each session
- **Real-time Question Feed**: Professors see questions instantly as they're submitted
- **Question Management**: Mark questions as resolved, filter by status

### 3. **Smart Voice Transcription & Context Building**

- **Continuous Voice Capture**: Never-stopping transcription system for live lectures
- **Intelligent Gap Handling**: Handles natural speech pauses, questions, and interruptions
- **Auto-restart Technology**: Exponential backoff recovery from any voice recognition interruptions
- **Context Embeddings**: Converts transcripts to semantic vectors for AI context awareness
- **Session Memory**: AI remembers lecture content for relevant, context-aware responses

### 4. **Interactive Classroom Tools**

- **Live Polls**: Create and manage real-time polls with instant results
- **Session Management**: Easy session creation for professors, simple joining for students
- **Real-time Updates**: All interactions update instantly across all participants
- **Cross-platform Support**: Works on Google Meet, Canvas, and other classroom platforms

### 5. **Role-Based Experience**

#### For Professors:

- Create and manage classroom sessions
- Monitor anonymous questions in real-time
- Access AI teaching assistant with session context
- Create interactive polls and view analytics
- Voice capture management with pause/resume controls

#### For Students:

- Join sessions with simple session codes
- Submit questions anonymously or with identity
- Access AI study assistant with lecture context
- Participate in live polls and discussions
- Get personalized AI help based on current session content

## 🏗️ Technical Architecture

### **Technology Stack**

- **Frontend**: Chrome Extension (Manifest V3), JavaScript, HTML, CSS
- **Authentication**: Supabase with JWT tokens
- **AI Integration**: Enhanced Backend API with streaming responses
- **Voice Processing**: Web Speech API with intelligent restart logic
- **Storage**: Chrome Storage API for session management
- **Real-time Updates**: Server-Sent Events (SSE) for streaming AI responses

### **System Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome        │    │   Enhanced       │    │   Supabase      │
│   Extension     │◄──►│   Backend API    │◄──►│   Database      │
│                 │    │                  │    │                 │
│ • Content Script│    │ • Session AI     │    │ • Authentication│
│ • Background    │    │ • General AI     │    │ • Session Data  │
│ • Popup UI      │    │ • Voice Process  │    │ • User Profiles │
│ • Voice Capture │    │ • Real-time SSE  │    │ • Transcripts   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🔧 What We Built & Implementation Details

### **AI Response System**

We implemented a sophisticated dual-AI system:

1. **Context-Aware AI** (`/api/enhanced/sessions/:sessionId/ask-stream`)

   - Uses session transcripts and embeddings for context
   - Provides personalized responses based on lecture content
   - Maintains conversation history within session scope
   - Streams responses in real-time for natural interaction

2. **General AI Assistant** (`/api/ai/general/ask-stream`)
   - Standalone AI for general academic questions
   - Available outside of active sessions
   - Broader knowledge base without session restrictions
   - Same streaming technology for consistent UX

### **Voice Transcription Engine**

Built an enterprise-grade voice capture system:

```javascript
// Smart Continuous Voice Recognition
- Exponential backoff restart (1s → 2s → 4s → 8s → max 30s)
- Activity monitoring without interruption
- Chunked processing (7-second intervals)
- Automatic silence handling
- Manual professor controls
- Background embedding generation
```

### **Anonymous Question Architecture**

Sophisticated anonymity system:

```javascript
// Anonymous Identity Management
- Consistent anonymous IDs per session
- Question threading and history
- Real-time updates via WebSocket simulation
- Professor question management interface
- Status tracking (new/resolved)
```

### **Session Management System**

Complete session lifecycle management:

- **Session Creation**: Professors generate unique session codes
- **Student Joining**: Simple code entry to join active sessions
- **Context Restoration**: Automatic session state recovery on page refresh
- **Role Detection**: Smart user role identification for appropriate UI
- **Session Persistence**: Maintains active session across browser tabs

### **Streaming Implementation**

Real-time AI response streaming:

```javascript
// Server-Sent Events Implementation
- EventSource-like streaming via fetch()
- Chunk-by-chunk text processing
- Progressive DOM updates
- Error handling and recovery
- Stream completion detection
```

## 🎯 Key Innovations

### 1. **Context-Aware Learning**

Unlike traditional AI assistants, AskLynk's AI understands the current lecture context through:

- Live transcript analysis
- Session-specific embeddings
- Conversation history within session scope
- Professor-approved knowledge boundaries

### 2. **Never-Stop Voice Recognition**

Revolutionary voice capture that:

- Never permanently stops due to silence
- Handles natural lecture interruptions
- Automatically recovers from any failure
- Provides professor control without technical complexity

### 3. **Smart AI Routing**

Intelligent system that:

- Detects user session status automatically
- Routes to appropriate AI endpoint (context-aware vs general)
- Provides seamless experience without user configuration
- Maintains conversation context appropriately

### 4. **Anonymous Safety Net**

Comprehensive anonymity system:

- Persistent anonymous identities within sessions
- No cross-session identity leakage
- Real-time interaction without identity exposure
- Professor oversight without student identification

## 📋 Installation & Usage

### **For Developers**

1. **Clone the repository**

   ```bash
   git clone https://github.com/sharathodepalli/asklynk-frontend.git
   cd asklynk-frontend
   ```

2. **Development Setup**

   ```bash
   # The extension is ready to load - no build process required
   # All source files are in the root directory
   ```

3. **Load Extension in Chrome**

   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project root directory

4. **Configuration**

   - Backend URLs are configured in `config.js`
   - Production build uses `manifest-production.json`
   - Development mode uses standard `manifest.json`

5. **Testing**
   - Test on Google Meet or Canvas LMS
   - Use provided test functions in browser console
   - Check browser console for debug logs

### **For Production**

1. Install from Chrome Web Store (when published)
2. Sign up/Login through extension popup
3. Professors: Create sessions, students: Join with session codes
4. Access AI assistant and anonymous questions during class

## �️ Development & Contribution

### **Project Structure**

```
asklynk-frontend/
├── content.js              # Main content script with all functionality
├── background.js           # Service worker for background tasks
├── popup.html/jsx/js       # Extension popup interface
├── config.js               # Environment configuration
├── manifest.json           # Development manifest
├── manifest-production.json # Production manifest
├── supabase.js            # Database integration
├── build-production/       # Production build artifacts
├── documentation/          # Complete project documentation
└── icon/                  # Extension icons and assets
```

### **Key Development Files**

- **content.js**: Core functionality, UI components, API integration
- **background.js**: Authentication, message passing, service worker
- **config.js**: Environment-aware configuration management
- **popup.jsx**: React-based popup interface

### **Contributing**

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Follow the existing code style and patterns
5. Update documentation if needed
6. Submit a pull request

## �🔄 Integration Points

### **Backend API Endpoints**

````

- `POST /api/enhanced/sessions/:sessionId/ask-stream` - Context-aware AI
- `POST /api/ai/general/ask-stream` - General AI assistant
- `POST /api/sessions` - Session management
- `POST /api/sessions/:sessionId/voice-transcript` - Voice processing
- `GET /api/sessions/:sessionId/messages` - Question retrieval

### **Supported Platforms**

- Google Meet (primary integration)
- Canvas LMS
- Other web-based classroom platforms (via content script injection)

## 🧪 Testing & Quality Assurance

### **Built-in Testing Functions**
```javascript
// Available in browser console for testing
window.testAskLynk = {
  testAIIntegration: () => testEnhancedBackendIntegration(),
  testVoiceCapture: () => testVoiceRecognitionSystem(),
  testSessionManagement: () => testSessionFlow(),
  testAuthentication: () => testAuthentication(),
  testGeneralAI: () => testGeneralAI()
};
````

### **Manual Testing Checklist**

- ✅ Authentication flow (login/logout)
- ✅ Session creation and joining
- ✅ AI assistant responses (both modes)
- ✅ Anonymous question submission
- ✅ Voice transcription accuracy
- ✅ Real-time updates and synchronization

## 🚦 Current Status

### **Completed Features**

✅ Dual AI system with smart routing  
✅ Real-time streaming responses  
✅ Never-stop voice transcription  
✅ Anonymous question system  
✅ Session management  
✅ Role-based UI  
✅ Cross-platform content injection  
✅ Authentication integration

### **Production Readiness**

```

✅ **Environment configuration** - Production URLs configured
✅ **Chrome Web Store compliance** - All requirements met
✅ **Production builds** - Ready for deployment
✅ **Error handling** - Comprehensive error management
✅ **Core functionality** - Complete and tested
✅ **Documentation** - Comprehensive docs available
🚀 **Ready for Chrome Web Store submission**

## 🎓 Educational Impact

AskLynk transforms classroom dynamics by:

- **Increasing Participation**: Anonymous questions encourage shy students
- **Improving Comprehension**: AI provides instant, context-aware help
- **Enhancing Accessibility**: Voice transcription aids hearing-impaired students
- **Streamlining Interaction**: Seamless integration with existing classroom tools
- **Building Confidence**: Safe environment for academic exploration

## 📈 Future Enhancements

- Multi-language support for global classrooms
- Advanced analytics for professors
- Integration with LMS gradebooks
- Mobile app companion
- Advanced AI models for specialized subjects

## 📚 Documentation

For comprehensive documentation, please visit the **[documentation folder](./documentation/)**:

- **[📋 Complete Documentation Index](./documentation/README.md)** - Navigation hub for all documentation
- **[🎯 Feature Specification](./documentation/FEATURE_SPECIFICATION.md)** - Detailed feature specifications
- **[🌐 Website Development Specification](./documentation/WEBSITE_DEVELOPMENT_SPECIFICATION.md)** - Complete web version development guide
- **[🔌 API Documentation](./documentation/api-documentation.md)** - Complete API reference
- **[🚀 Deployment Guide](./documentation/DEPLOYMENT_GUIDE.md)** - Deployment instructions
- **[🌐 Chrome Web Store Guide](./documentation/CHROME_WEB_STORE_GUIDE.md)** - Publishing guide
- **[🏗️ Frontend Documentation](./documentation/frontend-docs.md)** - Architecture details
- **[🔒 Privacy Policy](./documentation/PRIVACY_POLICY.md)** - Privacy compliance

---

**AskLynk represents the future of AI-enhanced education**, combining cutting-edge technology with practical classroom needs to create more inclusive, interactive, and intelligent learning environments.
```
