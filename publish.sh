#!/usr/bin/env bash

# Publish script for proxy-auto-ts library

echo "🚀 Preparing to publish proxy-auto-ts library..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist

# Build the library
echo "🔨 Building library..."
bun run build:lib

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Check if dist directory exists and has files
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
    echo "❌ No build output found in dist directory!"
    exit 1
fi

echo "✅ Build successful!"
echo "📁 Build contents:"
ls -la dist/

echo ""
echo "📦 Library is ready for publishing!"
echo ""
echo "To publish to npm:"
echo "  npm publish"
echo ""
echo "To publish as scoped package:"
echo "  npm publish --access public"
echo ""
echo "📚 Documentation:"
echo "  - README.md has been updated with comprehensive API docs"
echo "  - TypeScript definitions are generated in dist/"
echo "  - Examples are available in src/examples.ts"
echo ""
echo "🎯 Library features:"
echo "  ✅ TypeScript support with full type definitions"
echo "  ✅ ESM module format"
echo "  ✅ Comprehensive API documentation"
echo "  ✅ Example usage code"
echo "  ✅ MIT License"
echo "  ✅ Proxy validation and rotation"
echo "  ✅ Performance optimization"
echo "  ✅ Configurable settings"
