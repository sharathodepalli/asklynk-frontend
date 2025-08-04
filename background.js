// // background.js

// let currentAuthState = {
//   isLoggedIn: false,
//   user: null,
//   token: null  // Add token field with default value
// };

// // Check storage on initialization
// chrome.storage.local.get(['authState'], (result) => {
//   if (result.authState) {
//       currentAuthState = result.authState;
//       Logger.log('Restored auth state:', currentAuthState);
//       // Log token for debugging
//       Logger.log('Restored token (first 10 chars):', 
//         currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');
//   }
// });

// // Listen for messages from popup and content scripts
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   Logger.log('Background received message:', message);

//   if (message.type === 'CHECK_AUTH') {
//       // Return current auth state
//       sendResponse(currentAuthState);
//       return true;
//   }

//   if (message.type === 'OPEN_AUTH_PAGE') {
//       // Store the original tab ID and URL before redirecting
//       chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//           if (tabs && tabs[0]) {
//               const originalTab = tabs[0];
//               // Store the original tab information
//               chrome.storage.local.set({
//                   originalTabInfo: {
//                       tabId: originalTab.id,
//                       url: originalTab.url
//                   }
//               });

//               // Open the authentication page
//               chrome.tabs.create({ 
//                   url: 'http://localhost:5173/?extension=true&returnUrl=' + 
//                        encodeURIComponent(originalTab.url)
//               });
//           }
//       });
//       sendResponse({ success: true });
//       return true;
//   }

//   if (message.type === 'SET_AUTH') {
//       // Update auth state with user and token
//       currentAuthState = {
//           isLoggedIn: true,
//           user: message.user,
//           token: message.token  // Ensure token is included
//       };
      
//       // Debug log the token
//       Logger.log('Token being stored (first 10 chars):', 
//         currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');

//       // Store in Chrome storage
//       chrome.storage.local.set({ authState: currentAuthState }, () => {
//           Logger.log('Auth state saved:', JSON.stringify({
//               ...currentAuthState,
//               token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
//           }));

//           // Broadcast to all extension components
//           chrome.runtime.sendMessage({
//               type: 'AUTH_CHANGED',
//               authState: currentAuthState
//           });
//       });

//       sendResponse({ success: true });
//       return true;
//   }

//   // Handle refresh token requests
//         if (message.type === 'REFRESH_TOKEN') {
//       Logger.log('Attempting to refresh token...');
      
//       if (currentAuthState.isLoggedIn && currentAuthState.token) {
//         Logger.log('Returning existing token');
//         sendResponse({ success: true, token: currentAuthState.token });
//         return true;
//       }
      
//       if (currentAuthState.isLoggedIn) {
//         Logger.log('No token available, but user is logged in. Attempting server refresh...');
        
//         fetch('http://localhost:3000/api/auth/refresh', {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json'
//           },
//           body: JSON.stringify({
//             userId: currentAuthState.user?.id,
//             username: currentAuthState.user?.username
//           })
//         })
//         .then(response => {
//           if (!response.ok) {
//             throw new Error(`Refresh failed with status ${response.status}`);
//           }
//           return response.json();
//         })
//         .then(data => {
//           if (!data.token) {
//             throw new Error('No token in refresh response');
//           }
          
//           currentAuthState = {
//             ...currentAuthState,
//             token: data.token
//           };
          
//           chrome.storage.local.set({ authState: currentAuthState }, () => {
//             Logger.log('Auth state updated with refreshed token');
//             chrome.runtime.sendMessage({
//               type: 'AUTH_CHANGED',
//               authState: currentAuthState
//             });
//             sendResponse({ success: true, token: data.token });
//           });
//         })
//         .catch(error => {
//           Logger.error('Token refresh failed:', error);
//           sendResponse({ success: false, error: error.message });
//         });
        
//         return true; // Keep the message channel open for async response
//       }
      
//       Logger.error('Cannot refresh token - not logged in');
//       sendResponse({ success: false, error: 'Not logged in' });
//       return true;
//     }

//   if (message.type === 'LOGOUT') {
//       // Reset auth state
//       currentAuthState = {
//           isLoggedIn: false,
//           user: null,
//           token: null  // Clear the token too
//       };

//       // Clear from storage
//       chrome.storage.local.remove(['authState'], () => {
//           Logger.log('Auth state cleared');

//           // Broadcast to all extension components
//           chrome.runtime.sendMessage({
//               type: 'AUTH_CHANGED',
//               authState: currentAuthState
//           });
//       });

//       sendResponse({ success: true });
//       return true;
//   }

//   if (message.type === 'API_REQUEST') {
//       Logger.log('Background script handling API request:', message);

//       // Extract request details
//       const { url, method, headers, body } = message;
      
//       // Debug log the authorization header if present
//       if (headers && headers.Authorization) {
//           Logger.log('Authorization header (first 20 chars):', 
//             headers.Authorization.substring(0, 20) + '...');
//       } else {
//           Logger.log('No Authorization header present in request');
//       }

//       // Make the actual fetch request from background script
//       fetch(url, {
//           method: method || 'GET',
//           headers: headers || {},
//           body: body ? JSON.stringify(body) : undefined
//       })
//           .then(async (response) => {
//               Logger.log(`API Response status: ${response.status} ${response.statusText}`);
              
//               // First get the raw text
//               const responseText = await response.text();

//               let data;
//               try {
//                   // Try to parse as JSON if it's valid JSON
//                   data = JSON.parse(responseText);
//               } catch (e) {
//                   // If not valid JSON, use the raw text
//                   Logger.error('Invalid JSON response:', responseText.substring(0, 100));
//                   return sendResponse({
//                       ok: false,
//                       status: response.status,
//                       error: `Invalid JSON response: ${responseText.substring(0, 100)}...`,
//                       data: responseText
//                   });
//               }

//               // Send the parsed response back
//               sendResponse({
//                   ok: response.ok,
//                   status: response.status,
//                   data: data
//               });
//           })
//           .catch((error) => {
//               Logger.error('API request failed:', error);
//               sendResponse({
//                   ok: false,
//                   error: error.message
//               });
//           });

//       return true; // Keep the message channel open for the async response
//   }
// });

// // Listen for external messages from auth page
// chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
//   // Only accept messages from your authentication page
//   if (sender.url && sender.url.startsWith('http://localhost:5173')) {
//       Logger.log('Received external message:', message);

//       if (message.type === 'LOGIN_SUCCESS') {
//         // Validate required fields
//         if (!message.token || !message.userId || !message.username) {
//           Logger.error('Missing required login data:', message);
//           sendResponse({ success: false, error: 'Invalid login data' });
//           return true;
//         }
//           // Update auth state with user data from login page
//           currentAuthState = {
//             isLoggedIn: true,
//             user: {
//               id: message.userId,
//               username: message.username,
//               role: message.role
//             },
//             token: message.token
//           };
//           Logger.log('Updated auth statesafsdfdsafdsfa:', currentAuthState);

//           // Debug log the token
//           Logger.log('Token received from login page (first 10 chars):', 
//             message.token ? message.token.substring(0, 10) + '...' : 'EMPTY');

//           // Store in Chrome storage
//           chrome.storage.local.set({ authState: currentAuthState }, () => {
//               Logger.log('Auth state saved from external message:', JSON.stringify({
//                   ...currentAuthState,
//                   token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
//               }));

//               // Broadcast to all extension components
//               chrome.runtime.sendMessage({
//                   type: 'AUTH_CHANGED',
//                   authState: currentAuthState
//               });

//               // Return to original tab if information is available
//               chrome.storage.local.get(['originalTabInfo'], (result) => {
//                   if (result.originalTabInfo) {
//                       chrome.tabs.update(result.originalTabInfo.tabId, {
//                           active: true,
//                           url: result.originalTabInfo.url
//                       }, (updatedTab) => {
//                           // Clean up stored tab info
//                           chrome.storage.local.remove(['originalTabInfo']);

//                           // Close login tab
//                           chrome.tabs.remove(sender.tab.id);
//                       });
//                   }
//               });
//           });

//           sendResponse({ success: true });
//           return true;
//       }
//   }
// });

// // Listen for tab updates to catch redirects from auth page
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   // Check if this is a redirect from our auth page with auth data
//   if (changeInfo.url && changeInfo.url.includes('http://localhost:5173/auth-success')) {
//       try {
//           const url = new URL(changeInfo.url);
//           const username = url.searchParams.get('username');
//           const role = url.searchParams.get('role');
//           const userId = url.searchParams.get('userId');
//           const token = url.searchParams.get('token');

//           // Debug log the token
//           Logger.log('Token from URL parameters (first 10 chars):', 
//             token ? token.substring(0, 10) + '...' : 'EMPTY');

//           if (username && role) {
//               // Update auth state
//               currentAuthState = {
//                   isLoggedIn: true,
//                   user: {
//                       id: userId,
//                       username,
//                       role
//                   },
//                   token: token
//               };

//               // Store in Chrome storage
//               chrome.storage.local.set({ authState: currentAuthState }, () => {
//                   Logger.log('Auth state saved from URL params:', JSON.stringify({
//                       ...currentAuthState,
//                       token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
//                   }));

//                   // Broadcast to all extension components
//                   chrome.runtime.sendMessage({
//                       type: 'AUTH_CHANGED',
//                       authState: currentAuthState
//                   });

//                   // Return to original tab if information is available
//                   chrome.storage.local.get(['originalTabInfo'], (result) => {
//                       if (result.originalTabInfo) {
//                           chrome.tabs.update(result.originalTabInfo.tabId, {
//                               active: true
//                           }, () => {
//                               // Clean up stored tab info
//                               chrome.storage.local.remove(['originalTabInfo']);

//                               // Close the auth tab
//                               chrome.tabs.remove(tabId);
//                           });
//                       } else {
//                           // Just close the auth tab if we don't have original tab info
//                           chrome.tabs.remove(tabId);
//                       }
//                   });
//               });
//           }
//       } catch (error) {
//           Logger.error('Error processing auth URL:', error);
//       }
//   }
// });

// // This should be in your background.js file
// // In your background.js file
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.type === 'API_REQUEST') {
//     Logger.log('Processing API request:', message.url);
    
//     const options = {
//       method: message.method || 'GET',
//       headers: message.headers || {}
//     };
    
//     if (message.body && (message.method === 'POST' || message.method === 'PUT' || message.method === 'PATCH')) {
//       options.body = JSON.stringify(message.body);
//     }
    
//     fetch(message.url, options)
//       .then(response => response.json())
//       .then(data => {
//         Logger.log('API response success:', data);
//         sendResponse({ ok: true, status: 200, data });
//       })
//       .catch(error => {
//         Logger.error('API fetch error:', error);
//         sendResponse({ ok: false, error: 'Failed to fetch' });
//       });
    
//     return true; // This is critical - keeps the message channel open
//   }
// });

// // // Handle API requests from content script
// // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
// //   if (message.type === 'API_REQUEST') {
// //     Logger.log('Processing API request:', message.url);
    
// //     // Extract request details
// //     const url = message.url;
// //     const method = message.method || 'GET';
// //     const headers = message.headers || {};
// //     const body = message.body ? JSON.stringify(message.body) : undefined;
    
// //     // Make the fetch request
// //     fetch(url, {
// //       method: method,
// //       headers: headers,
// //       body: body
// //     })
// //     .then(response => {
// //       if (!response.ok) {
// //         return response.json().then(errorData => {
// //           throw new Error(errorData.error || `HTTP error ${response.status}`);
// //         }).catch(error => {
// //           throw new Error(`HTTP error ${response.status}`);
// //         });
// //       }
// //       return response.json();
// //     })
// //     .then(data => {
// //       Logger.log('API response success:', url);
// //       sendResponse({ ok: true, data: data });
// //     })
// //     .catch(error => {
// //       Logger.error('API response error:', error);
// //       sendResponse({ ok: false, error: error.message });
// //     });
    
// //     return true; // Keep the message channel open for async response
// //   }
// // });

// const GEMINI_API_KEY = ""; // Replace with your key

// // Handle API requests from content scripts
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === 'GEMINI_API_REQUEST') {
//       const payload = message.payload;
      
//       // Use correct model name: gemini-1.5-pro-002
//       fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-002:generateContent?key=${GEMINI_API_KEY}`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(payload)
//       })
//       .then(response => {
//         if (!response.ok) {
//           return response.text().then(text => {
//             Logger.error('Error response body:', text);
//             throw new Error(`API request failed with status ${response.status}: ${text}`);
//           });
//         }
//         return response.json();
//       })
//       .then(data => {
//         Logger.log('Gemini API success response:', data);
//         sendResponse({ success: true, data });
//       })
//       .catch(error => {
//         Logger.error('Gemini API error:', error);
//         sendResponse({ success: false, error: error.message });
//       });
      
//       return true; // Keep the message channel open for async response
//     }
    
//     return true; // Keep the message channel open for other messages
//   });


// // background.js

// let currentAuthState = {
//   isLoggedIn: false,
//   user: null,
//   token: null
// };

// // Check storage on initialization
// chrome.storage.local.get(['authState'], (result) => {
//   if (result.authState) {
//     currentAuthState = result.authState;
//     Logger.log('Restored auth state:', currentAuthState);
//     Logger.log('Restored token (first 10 chars):', 
//       currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');
//   }
// });

// // Listen for messages from popup and content scripts
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   Logger.log('Background received message:', message.type);

//   if (message.type === 'CHECK_AUTH') {
//     // Return current auth state
//     sendResponse(currentAuthState);
//     return true;
//   }

//   if (message.type === 'OPEN_AUTH_PAGE') {
//     // Store the original tab ID and URL before redirecting
//     chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//       if (tabs && tabs[0]) {
//         const originalTab = tabs[0];
//         // Store the original tab information
//         chrome.storage.local.set({
//           originalTabInfo: {
//             tabId: originalTab.id,
//             url: originalTab.url
//           }
//         });

//         // Open the authentication page
//         chrome.tabs.create({ 
//           url: 'http://localhost:5173/?extension=true&returnUrl=' + 
//                encodeURIComponent(originalTab.url)
//         });
//       }
//     });
//     sendResponse({ success: true });
//     return true;
//   }

//   if (message.type === 'SET_AUTH') {
//     // Update auth state with user and token
//     currentAuthState = {
//       isLoggedIn: true,
//       user: message.user,
//       token: message.token
//     };
    
//     Logger.log('Token being stored (first 10 chars):', 
//       currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');

//     // Store in Chrome storage
//     chrome.storage.local.set({ authState: currentAuthState }, () => {
//       Logger.log('Auth state saved:', JSON.stringify({
//         ...currentAuthState,
//         token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
//       }));

//       // Broadcast to all extension components
//       chrome.runtime.sendMessage({
//         type: 'AUTH_CHANGED',
//         authState: currentAuthState
//       });
//     });

//     sendResponse({ success: true });
//     return true;
//   }

//   // Handle refresh token requests - FIXED VERSION
//   if (message.type === 'REFRESH_TOKEN') {
//     Logger.log('Attempting to refresh token...');
    
//     if (currentAuthState.isLoggedIn && currentAuthState.token) {
//       Logger.log('Returning existing token (first 10 chars):', 
//         currentAuthState.token.substring(0, 10) + '...');
//       sendResponse({ 
//         success: true, 
//         token: currentAuthState.token 
//       });
//       return true;
//     }
    
//     if (currentAuthState.isLoggedIn) {
//       Logger.log('No token available, but user is logged in. Attempting server refresh...');
      
//       fetch('http://localhost:3000/api/auth/refresh', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           userId: currentAuthState.user?.id,
//           username: currentAuthState.user?.username
//         })
//       })
//       .then(response => {
//         if (!response.ok) {
//           throw new Error(`Refresh failed with status ${response.status}`);
//         }
//         return response.json();
//       })
//       .then(data => {
//         if (!data.token) {
//           throw new Error('No token in refresh response');
//         }
        
//         currentAuthState = {
//           ...currentAuthState,
//           token: data.token
//         };
        
//         chrome.storage.local.set({ authState: currentAuthState }, () => {
//           Logger.log('Auth state updated with refreshed token');
//           chrome.runtime.sendMessage({
//             type: 'AUTH_CHANGED',
//             authState: currentAuthState
//           });
//           sendResponse({ success: true, token: data.token });
//         });
//       })
//       .catch(error => {
//         Logger.error('Token refresh failed:', error);
//         sendResponse({ success: false, error: error.message });
//       });
      
//       return true; // Keep the message channel open for async response
//     }
    
//     Logger.error('Cannot refresh token - not logged in');
//     sendResponse({ success: false, error: 'Not logged in' });
//     return true;
//   }

//   if (message.type === 'LOGOUT') {
//     // Reset auth state
//     currentAuthState = {
//       isLoggedIn: false,
//       user: null,
//       token: null
//     };

//     // Clear from storage
//     chrome.storage.local.remove(['authState'], () => {
//       Logger.log('Auth state cleared');

//       // Broadcast to all extension components
//       chrome.runtime.sendMessage({
//         type: 'AUTH_CHANGED',
//         authState: currentAuthState
//       });
//     });

//     sendResponse({ success: true });
//     return true;
//   }

//   // FIXED: Single consolidated API_REQUEST handler
//   if (message.type === 'API_REQUEST') {
//     Logger.log('Background script handling API request:', message.url);

//     // Extract request details
//     const { url, method, headers, body } = message;
    
//     // Debug log the authorization header if present
//     if (headers && headers.Authorization) {
//       Logger.log('Authorization header (first 20 chars):', 
//         headers.Authorization.substring(0, 20) + '...');
//     } else {
//       Logger.log('No Authorization header present in request');
//     }

//     // Make the actual fetch request from background script
//     fetch(url, {
//       method: method || 'GET',
//       headers: headers || {},
//       body: body ? JSON.stringify(body) : undefined
//     })
//     .then(async (response) => {
//       Logger.log(`API Response status: ${response.status} ${response.statusText}`);
      
//       // First get the raw text
//       const responseText = await response.text();

//       let data;
//       try {
//         // Try to parse as JSON if it's valid JSON
//         data = JSON.parse(responseText);
//       } catch (e) {
//         // If not valid JSON, use the raw text
//         Logger.error('Invalid JSON response:', responseText.substring(0, 100));
//         return sendResponse({
//           ok: false,
//           status: response.status,
//           error: `Invalid JSON response: ${responseText.substring(0, 100)}...`,
//           data: responseText
//         });
//       }

//       // Send the parsed response back
//       sendResponse({
//         ok: response.ok,
//         status: response.status,
//         data: data
//       });
//     })
//     .catch((error) => {
//       Logger.error('API request failed:', error);
//       sendResponse({
//         ok: false,
//         error: error.message
//       });
//     });

//     return true; // Keep the message channel open for the async response
//   }

//   // Gemini API handler
//   if (message.type === 'GEMINI_API_REQUEST') {
//     const GEMINI_API_KEY = ""; // Replace with your key
//     const payload = message.payload;
    
//     // Use correct model name: gemini-1.5-pro-002
//     fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-002:generateContent?key=${GEMINI_API_KEY}`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(payload)
//     })
//     .then(response => {
//       if (!response.ok) {
//         return response.text().then(text => {
//           Logger.error('Error response body:', text);
//           throw new Error(`API request failed with status ${response.status}: ${text}`);
//         });
//       }
//       return response.json();
//     })
//     .then(data => {
//       Logger.log('Gemini API success response:', data);
//       sendResponse({ success: true, data });
//     })
//     .catch(error => {
//       Logger.error('Gemini API error:', error);
//       sendResponse({ success: false, error: error.message });
//     });
    
//     return true; // Keep the message channel open for async response
//   }

//   // Default return
//   return true; // Keep the message channel open for other message types
// });

// // Listen for external messages from auth page
// chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
//   // Only accept messages from your authentication page
//   if (sender.url && sender.url.startsWith('http://localhost:5173')) {
//     Logger.log('Received external message:', message);

//     if (message.type === 'LOGIN_SUCCESS') {
//       // Validate required fields
//       if (!message.token || !message.userId || !message.username) {
//         Logger.error('Missing required login data:', message);
//         sendResponse({ success: false, error: 'Invalid login data' });
//         return true;
//       }
//       // Update auth state with user data from login page
//       currentAuthState = {
//         isLoggedIn: true,
//         user: {
//           id: message.userId,
//           username: message.username,
//           role: message.role
//         },
//         token: message.token
//       };
//       Logger.log('Updated auth state:', JSON.stringify({
//         ...currentAuthState,
//         token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
//       }));

//       // Debug log the token
//       Logger.log('Token received from login page (first 10 chars):', 
//         message.token ? message.token.substring(0, 10) + '...' : 'EMPTY');

//       // Store in Chrome storage
//       chrome.storage.local.set({ authState: currentAuthState }, () => {
//         Logger.log('Auth state saved from external message');

//         // Broadcast to all extension components
//         chrome.runtime.sendMessage({
//           type: 'AUTH_CHANGED',
//           authState: currentAuthState
//         });

//         // Return to original tab if information is available
//         chrome.storage.local.get(['originalTabInfo'], (result) => {
//           if (result.originalTabInfo) {
//             chrome.tabs.update(result.originalTabInfo.tabId, {
//               active: true,
//               url: result.originalTabInfo.url
//             }, (updatedTab) => {
//               // Clean up stored tab info
//               chrome.storage.local.remove(['originalTabInfo']);

//               // Close login tab
//               chrome.tabs.remove(sender.tab.id);
//             });
//           }
//         });
//       });

//       sendResponse({ success: true });
//       return true;
//     }
//   }
// });

// // Listen for tab updates to catch redirects from auth page
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   // Check if this is a redirect from our auth page with auth data
//   if (changeInfo.url && changeInfo.url.includes('http://localhost:5173/auth-success')) {
//     try {
//       const url = new URL(changeInfo.url);
//       const username = url.searchParams.get('username');
//       const role = url.searchParams.get('role');
//       const userId = url.searchParams.get('userId');
//       const token = url.searchParams.get('token');

//       // Debug log the token
//       Logger.log('Token from URL parameters (first 10 chars):', 
//         token ? token.substring(0, 10) + '...' : 'EMPTY');

//       if (username && role) {
//         // Update auth state
//         currentAuthState = {
//           isLoggedIn: true,
//           user: {
//             id: userId,
//             username,
//             role
//           },
//           token: token
//         };

//         // Store in Chrome storage
//         chrome.storage.local.set({ authState: currentAuthState }, () => {
//           Logger.log('Auth state saved from URL params');

//           // Broadcast to all extension components
//           chrome.runtime.sendMessage({
//             type: 'AUTH_CHANGED',
//             authState: currentAuthState
//           });

//           // Return to original tab if information is available
//           chrome.storage.local.get(['originalTabInfo'], (result) => {
//             if (result.originalTabInfo) {
//               chrome.tabs.update(result.originalTabInfo.tabId, {
//                 active: true
//               }, () => {
//                 // Clean up stored tab info
//                 chrome.storage.local.remove(['originalTabInfo']);

//                 // Close the auth tab
//                 chrome.tabs.remove(tabId);
//               });
//             } else {
//               // Just close the auth tab if we don't have original tab info
//               chrome.tabs.remove(tabId);
//             }
//           });
//         });
//       }
//     } catch (error) {
//       Logger.error('Error processing auth URL:', error);
//     }
//   }
// });


/**
 * AskLynk Chrome Extension - Background Script
 * 
 * This script handles authentication, API requests, and communication
 * between the extension's components.
 */

// Import environment configuration
importScripts('config.js');

// Log extension information for debugging
console.log('🚀 AskLynk Extension Background Script Loaded');
console.log('📋 Extension ID:', chrome.runtime.id);
console.log('🌐 Auth Page URL:', AUTH_PAGE_URL);
console.log('🔧 Environment:', IS_DEVELOPMENT ? 'Development' : 'Production');

// Global state for authentication
let currentAuthState = {
  isLoggedIn: false,
  user: null,
  token: null
};

// API endpoint configuration - now uses environment-aware URLs
const GEMINI_API_KEY = ""; // REMOVED - Use environment variables instead

// Check storage on initialization
chrome.storage.local.get(['authState'], (result) => {
  if (result.authState) {
    currentAuthState = result.authState;
    Logger.log('Restored auth state:', currentAuthState);
    Logger.log('Restored token (first 10 chars):', 
      currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Logger.log('Background received message:', message.type);

  // Check authentication state
  if (message.type === 'CHECK_AUTH') {
    sendResponse(currentAuthState);
    return true;
  }

  // Open authentication page
    // In background.js - modify the existing listener
  if (message.type === 'OPEN_AUTH_PAGE') {
    Logger.log('Background script received OPEN_AUTH_PAGE message');
    try {
      // Get the current active tab in the main browser window (not popup)
      chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => {
        if (!tabs || tabs.length === 0) {
          Logger.error('No active tab found');
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        
        const originalTab = tabs[0];
        Logger.log('Current tab info:', originalTab.id, originalTab.url);
        
        // Determine the return URL with proper fallbacks
        let returnUrl = '';
        
        if (originalTab.url) {
          // Check if it's a valid web URL
          if (originalTab.url.startsWith('http://') || originalTab.url.startsWith('https://')) {
            returnUrl = originalTab.url;
          } else {
            // For Chrome internal pages or extension pages, use a special flag
            // This tells the auth page to close instead of redirecting
            returnUrl = 'CLOSE_WINDOW';
          }
        } else {
          // No URL available, use close window flag
          returnUrl = 'CLOSE_WINDOW';
        }
        
        Logger.log('Processed return URL for auth:', returnUrl);
        
        // Store the original tab information
        chrome.storage.local.set({
          originalTabInfo: {
            tabId: originalTab.id,
            url: returnUrl
          }
        }, () => {
          if (chrome.runtime.lastError) {
            Logger.error('Error storing tab info:', chrome.runtime.lastError);
            sendResponse({ success: false, error: 'Failed to store tab info' });
            return;
          }
          
          // Construct auth URL with the simplified format (no redirect parameter)
          const authUrl = `${AUTH_PAGE_URL}/auth?extension_auth=true&from_extension=true`;
          Logger.log('Opening auth page URL:', authUrl);
          
          // Open the authentication page
          chrome.tabs.create({ url: authUrl }, (newTab) => {
            if (chrome.runtime.lastError) {
              Logger.error('Error creating new tab:', chrome.runtime.lastError);
              sendResponse({ success: false, error: 'Failed to create tab' });
              return;
            }
            
            Logger.log('Created new tab with ID:', newTab.id);
            sendResponse({ success: true });
          });
        });
      });
    } catch (error) {
      Logger.error('Error in OPEN_AUTH_PAGE handler:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep the message channel open for async response
  }
  // Set authentication state
  if (message.type === 'SET_AUTH') {
    // Update auth state with user and token
    currentAuthState = {
      isLoggedIn: true,
      user: message.user,
      token: message.token
    };
    
    Logger.log('Token being stored (first 10 chars):', 
      currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY');

    // Store in Chrome storage
    chrome.storage.local.set({ authState: currentAuthState }, () => {
      Logger.log('Auth state saved:', JSON.stringify({
        ...currentAuthState,
        token: currentAuthState.token ? currentAuthState.token.substring(0, 10) + '...' : 'EMPTY'
      }));

      // Broadcast to all extension components
      chrome.runtime.sendMessage({
        type: 'AUTH_CHANGED',
        authState: currentAuthState
      });
    });

    sendResponse({ success: true });
    return true;
  }

  // Handle refresh token requests
  if (message.type === 'REFRESH_TOKEN') {
    Logger.log('Attempting to refresh token...');
    
    if (currentAuthState.isLoggedIn && currentAuthState.token) {
      Logger.log('Returning existing token (first 10 chars):', 
        currentAuthState.token.substring(0, 10) + '...');
      sendResponse({ 
        success: true, 
        token: currentAuthState.token 
      });
      return true;
    }
    
    if (currentAuthState.isLoggedIn) {
      Logger.log('No token available, but user is logged in. Attempting server refresh...');
      
      fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentAuthState.user?.id,
          username: currentAuthState.user?.username
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Refresh failed with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data.token) {
          throw new Error('No token in refresh response');
        }
        
        currentAuthState = {
          ...currentAuthState,
          token: data.token
        };
        
        chrome.storage.local.set({ authState: currentAuthState }, () => {
          Logger.log('Auth state updated with refreshed token');
          chrome.runtime.sendMessage({
            type: 'AUTH_CHANGED',
            authState: currentAuthState
          });
          sendResponse({ success: true, token: data.token });
        });
      })
      .catch(error => {
        Logger.error('Token refresh failed:', error);
        sendResponse({ success: false, error: error.message });
      });
      
      return true; // Keep the message channel open for async response
    }
    
    Logger.error('Cannot refresh token - not logged in');
    sendResponse({ success: false, error: 'Not logged in' });
    return true;
  }

  // Handle logout
  if (message.type === 'LOGOUT') {
    // Reset auth state
    currentAuthState = {
      isLoggedIn: false,
      user: null,
      token: null
    };

    // Clear from storage
    chrome.storage.local.remove(['authState'], () => {
      Logger.log('Auth state cleared');

      // Broadcast to all extension components
      chrome.runtime.sendMessage({
        type: 'AUTH_CHANGED',
        authState: currentAuthState
      });
    });

    sendResponse({ success: true });
    return true;
  }

  // Get user session token specifically for voice transcript API calls
  if (message.type === 'GET_USER_SESSION_TOKEN') {
    Logger.log('Getting user session token for voice transcript API...');
    
    // Check if we have a stored user session token (different from the current token)
    chrome.storage.local.get(['userSessionToken'], (result) => {
      if (result.userSessionToken) {
        Logger.log('Found stored user session token:', result.userSessionToken.substring(0, 10) + '...');
        sendResponse({ 
          success: true, 
          sessionToken: result.userSessionToken 
        });
      } else {
        Logger.log('No user session token found, user needs to get proper Supabase session token');
        sendResponse({ 
          success: false, 
          error: 'No user session token available. Please ensure login process stores the Supabase session token.' 
        });
      }
    });
    
    return true; // Keep message channel open
  }

  // Set user session token for voice transcript API calls
  if (message.type === 'SET_USER_SESSION_TOKEN') {
    Logger.log('Setting user session token for voice transcript API...');
    
    if (message.sessionToken) {
      chrome.storage.local.set({ userSessionToken: message.sessionToken }, () => {
        Logger.log('User session token stored for voice API');
        sendResponse({ success: true });
      });
    } else {
      sendResponse({ success: false, error: 'No session token provided' });
    }
    
    return true;
  }

  // Handle API requests
 // Handle API requests
if (message.type === 'API_REQUEST') {
  Logger.log('Background script handling API request:', message.url);

  // Extract request details
  const { url, method, headers, body } = message;
  
  // Debug log the authorization header if present
  if (headers && headers.Authorization) {
    Logger.log('Authorization header (first 20 chars):', 
      headers.Authorization.substring(0, 20) + '...');
  } else {
    Logger.log('No Authorization header present in request');
  }

  // IMPORTANT FIX: Check if body is already a string
  let processedBody = body;
  if (body && typeof body !== 'string') {
    processedBody = JSON.stringify(body);
    Logger.log('Stringified request body');
  } else if (body) {
    Logger.log('Body already stringified, using as-is');
  }

  // Make the actual fetch request from background script
  fetch(url, {
    method: method || 'GET',
    headers: headers || {},
    body: processedBody // Use the properly processed body
  })
  .then(async (response) => {
    Logger.log(`API Response status: ${response.status} ${response.statusText}`);
    
    // First get the raw text
    const responseText = await response.text();

    let data;
    try {
      // Try to parse as JSON if it's valid JSON
      data = JSON.parse(responseText);
    } catch (e) {
      // If not valid JSON, use the raw text
      Logger.error('Invalid JSON response:', responseText.substring(0, 100));
      return sendResponse({
        ok: false,
        status: response.status,
        error: `Invalid JSON response: ${responseText.substring(0, 100)}...`,
        data: responseText
      });
    }

    // Send the parsed response back
    sendResponse({
      ok: response.ok,
      status: response.status,
      data: data
    });
  })
  .catch((error) => {
    Logger.error('API request failed:', error);
    sendResponse({
      ok: false,
      error: error.message
    });
  });

  return true; // Keep the message channel open for the async response
}

  // Handle Gemini API requests
  if (message.type === 'GEMINI_API_REQUEST') {
    const payload = message.payload;
    
    // Use correct model name: gemini-1.5-pro-002
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-002:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          Logger.error('Error response body:', text);
          throw new Error(`API request failed with status ${response.status}: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      Logger.log('Gemini API success response:', data);
      sendResponse({ success: true, data });
    })
    .catch(error => {
      Logger.error('Gemini API error:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  }

  // Default return
  return true; // Keep the message channel open for other message types
});

// Listen for external messages from auth page
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  Logger.log('📨 External message received from:', sender.url);
  Logger.log('📨 Message content:', message);
  
  // Only accept messages from your authentication page
  if (sender.url && sender.url.startsWith(AUTH_PAGE_URL)) {
    Logger.log('✅ Message from authorized domain');

    if (message.type === 'LOGIN_SUCCESS') {
      Logger.log('🔐 Processing LOGIN_SUCCESS message');
      
      // Validate required fields
      if (!message.token || !message.userId || !message.username) {
        Logger.error('❌ Missing required login data:', {
          hasToken: !!message.token,
          hasUserId: !!message.userId,
          hasUsername: !!message.username
        });
        sendResponse({ success: false, error: 'Invalid login data' });
        return true;
      }
      
      Logger.log('✅ All required fields present');
      
      // Update auth state with user data from login page
      currentAuthState = {
        isLoggedIn: true,
        user: {
          id: message.userId,
          username: message.username,
          role: message.role
        },
        token: message.token
      };
      
      Logger.log('🔄 Auth state updated:', {
        isLoggedIn: currentAuthState.isLoggedIn,
        username: currentAuthState.user.username,
        userId: currentAuthState.user.id,
        hasToken: !!currentAuthState.token
      });

      // Debug log the token
      Logger.log('Token received from login page (first 10 chars):', 
        message.token ? message.token.substring(0, 10) + '...' : 'EMPTY');

      // Store in Chrome storage
      chrome.storage.local.set({ authState: currentAuthState }, () => {
        Logger.log('Auth state saved from external message');

        // Broadcast to all extension components
        chrome.runtime.sendMessage({
          type: 'AUTH_CHANGED',
          authState: currentAuthState
        });

        // Return to original tab if information is available
        chrome.storage.local.get(['originalTabInfo'], (result) => {
          if (result.originalTabInfo) {
            // Check if we have a valid return URL and it's not a fallback
            if (result.originalTabInfo.url && 
                result.originalTabInfo.url.trim() !== '' && 
                !result.originalTabInfo.url.startsWith('chrome://newtab')) {
              // Navigate back to the original URL
              chrome.tabs.update(result.originalTabInfo.tabId, {
                active: true,
                url: result.originalTabInfo.url
              }, (updatedTab) => {
                // Clean up stored tab info
                chrome.storage.local.remove(['originalTabInfo']);

                // Close login tab
                chrome.tabs.remove(sender.tab.id);
              });
            } else {
              // Just activate the original tab without changing URL (for fallback cases)
              chrome.tabs.update(result.originalTabInfo.tabId, {
                active: true
              }, (updatedTab) => {
                // Clean up stored tab info
                chrome.storage.local.remove(['originalTabInfo']);

                // Close login tab
                chrome.tabs.remove(sender.tab.id);
              });
            }
          } else {
            // Just close the login tab if no original tab info
            chrome.tabs.remove(sender.tab.id);
          }
        });
      });

      sendResponse({ success: true });
      return true;
    }
  }
});

// Listen for tab updates to catch redirects from auth page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if this is a redirect from our auth page with auth data
  if (changeInfo.url && changeInfo.url.includes(`${AUTH_PAGE_URL}/auth-success`)) {
    try {
      const url = new URL(changeInfo.url);
      const username = url.searchParams.get('username');
      const role = url.searchParams.get('role');
      const userId = url.searchParams.get('userId');
      const token = url.searchParams.get('token');

      // Debug log the token
      Logger.log('Token from URL parameters (first 10 chars):', 
        token ? token.substring(0, 10) + '...' : 'EMPTY');

      if (username && role) {
        // Update auth state
        currentAuthState = {
          isLoggedIn: true,
          user: {
            id: userId,
            username,
            role
          },
          token: token
        };

        // Store in Chrome storage
        chrome.storage.local.set({ authState: currentAuthState }, () => {
          Logger.log('Auth state saved from URL params');

          // Broadcast to all extension components
          chrome.runtime.sendMessage({
            type: 'AUTH_CHANGED',
            authState: currentAuthState
          });

          // Return to original tab if information is available
          chrome.storage.local.get(['originalTabInfo'], (result) => {
            if (result.originalTabInfo) {
              chrome.tabs.update(result.originalTabInfo.tabId, {
                active: true
              }, () => {
                // Clean up stored tab info
                chrome.storage.local.remove(['originalTabInfo']);

                // Close the auth tab
                chrome.tabs.remove(tabId);
              });
            } else {
              // Just close the auth tab if we don't have original tab info
              chrome.tabs.remove(tabId);
            }
          });
        });
      }
    } catch (error) {
      Logger.error('Error processing auth URL:', error);
    }
  }
});
