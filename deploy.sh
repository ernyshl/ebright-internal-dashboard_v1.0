#!/bin/bash

# Ebright Dashboard - Deployment Script
# Run this on your server (103.209.156.174)

echo "🚀 Starting deployment..."

# 1. Pull latest code from GitHub
cd /home/ebright-dashboard
git pull origin master

# 2. Build Docker images
echo "📦 Building Docker images..."
docker-compose down
docker-compose build --no-cache

# 3. Start services (backend + frontend + nginx)
echo "▶️ Starting services..."
docker-compose up -d

# 4. Check status
echo "✅ Checking services..."
docker-compose ps

# 5. Check health
echo "🏥 Health check..."
sleep 5
curl -s http://localhost:4000/health

echo ""
echo "🎉 Deployment complete!"
echo "📍 Access your dashboard at: http://103.209.156.174:3000"
echo "🔌 API available at: http://103.209.156.174:4000"
echo "🗄️  Database: Connected to existing postgres_leads on port 5433"
