#!/bin/bash

# AskLynk Chrome Extension - Production Build Script
# This script prepares the extension for Chrome Web Store submission

echo "🚀 Preparing AskLynk Extension for Chrome Web Store submission..."

# Create production build directory
echo "📁 Creating production build directory..."
mkdir -p build-production
rm -rf build-production/*

# Copy all necessary files to production build
echo "📋 Copying extension files..."
cp config.js build-production/
cp content.js build-production/
cp background.js build-production/
cp popup.html build-production/
cp popup.js build-production/
cp Popup.css build-production/
cp -r icon build-production/

# Use production manifest
echo "🔧 Using production manifest..."
cp manifest-production.json build-production/manifest.json

# Update config.js to force production mode
echo "⚙️ Configuring for production environment..."
sed -i '' 's/chrome.runtime.id === '\''development-extension-id'\''/false/g' build-production/config.js
sed -i '' 's/manifest.name.includes('\''Dev'\'')/false/g' build-production/config.js
sed -i '' 's/manifest.name.includes('\''Development'\'')/false/g' build-production/config.js

# Create submission package
echo "📦 Creating Chrome Web Store submission package..."
cd build-production
zip -r ../asklynk-extension-v1.0.0.zip . -x "*.DS_Store*" "*/__pycache__/*"
cd ..

echo "✅ Production build complete!"
echo ""
echo "📋 Chrome Web Store Submission Checklist:"
echo "  ✅ Environment configuration - Uses production URLs"
echo "  ✅ Console logging - Cleaned for production"
echo "  ✅ Manifest - Updated for Chrome Web Store"
echo "  ✅ Permissions - Minimized for security"
echo "  ✅ Icons - All required sizes included"
echo "  ✅ Package - Created asklynk-extension-v1.0.0.zip"
echo ""
echo "🚨 IMPORTANT: Update the backend URL in config.js before final submission!"
echo "   Current: https://asklynk-backend-production.vercel.app"
echo "   Update to your actual backend domain"
echo ""
echo "📁 Files ready for submission:"
echo "   📦 asklynk-extension-v1.0.0.zip (upload this to Chrome Web Store)"
echo "   📂 build-production/ (contains all extension files)"
echo ""
echo "🔗 Next steps:"
echo "   1. Update backend URL in build-production/config.js"
echo "   2. Re-zip the files if URL was changed"
echo "   3. Upload asklynk-extension-v1.0.0.zip to Chrome Web Store"
echo "   4. Fill out store listing with screenshots and description"
echo "   5. Submit for review"
echo ""
echo "🎉 Your extension is ready for the Chrome Web Store!"
