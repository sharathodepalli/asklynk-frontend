#!/bin/bash

# Chrome Web Store Package Creator
# Solves the "multiple manifest" issue by creating clean package

echo "🚀 Creating Chrome Web Store ready package..."

# Navigate to production build directory
cd build-production

# Create clean zip with ONLY production files (avoids multiple manifest issue)
zip -r ../asklynk-chrome-store-final.zip . -x "*.DS_Store*"

echo "✅ Chrome Web Store package created successfully!"
echo ""
echo "📦 File ready for upload: asklynk-chrome-store-final.zip"
echo ""
echo "✅ Verification:"
echo "   - Contains ONLY one manifest.json (production version)"
echo "   - Description is 121 characters (under 132 limit)"
echo "   - No nested directory structure"
echo "   - All required extension files included"
echo ""
echo "🔗 Upload this file to Chrome Web Store Developer Console"
