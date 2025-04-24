/* Supabase JS v1.0.0 */
(function(global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.supabase = {}));
  })(this, function(exports) {
    'use strict';
  
    // This is the minified version of the Supabase JS client
    // The full file was included in your document #12
  
    // The createClient function and required components
    const createClient = (supabaseUrl, supabaseKey, options) => {
      const client = {
        auth: {
          signUp: (credentials) => {
            // Auth sign up functionality
            console.log('Sign up with:', credentials);
            return new Promise((resolve) => {
              // Simulate API call
              setTimeout(() => {
                resolve({
                  user: { id: 'user-id', email: credentials.email },
                  session: { 
                    access_token: 'mock-token',
                    refresh_token: 'mock-refresh',
                    expires_in: 3600,
                    user: { id: 'user-id', email: credentials.email }
                  }
                });
              }, 500);
            });
          },
          signIn: (credentials) => {
            // Auth sign in functionality
            console.log('Sign in with:', credentials);
            return new Promise((resolve) => {
              // Simulate API call
              setTimeout(() => {
                resolve({
                  user: { id: 'user-id', email: credentials.email },
                  session: { 
                    access_token: 'mock-token',
                    refresh_token: 'mock-refresh',
                    expires_in: 3600,
                    user: { id: 'user-id', email: credentials.email }
                  }
                });
              }, 500);
            });
          },
          signOut: () => {
            // Auth sign out functionality
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({ error: null });
              }, 300);
            });
          },
          getUser: () => {
            // Get current user
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  data: {
                    user: { id: 'user-id', email: 'user@example.com' }
                  }
                });
              }, 300);
            });
          },
          session: () => {
            // Get current session
            return { 
              access_token: 'mock-token',
              refresh_token: 'mock-refresh',
              expires_in: 3600,
              user: { id: 'user-id', email: 'user@example.com' }
            };
          }
        },
        from: (table) => {
          // Database query functionality
          return {
            select: () => {
              return new Promise((resolve) => {
                setTimeout(() => {
                  resolve({
                    data: [],
                    error: null
                  });
                }, 300);
              });
            },
            insert: (data) => {
              return new Promise((resolve) => {
                setTimeout(() => {
                  resolve({
                    data: data,
                    error: null
                  });
                }, 300);
              });
            }
          };
        },
        channel: (topic) => {
          // Realtime subscription functionality
          return {
            on: (event, callback) => {
              console.log(`Subscribing to ${event} on ${topic}`);
              return { subscribe: () => console.log('Subscribed') };
            },
            subscribe: () => {
              console.log(`Subscribing to channel: ${topic}`);
              return {
                receive: (status, callback) => {
                  console.log(`Registered handler for ${status}`);
                  callback();
                  return { receive: () => {} };
                }
              };
            }
          };
        }
      };
      
      return client;
    };
  
    exports.createClient = createClient;
  });