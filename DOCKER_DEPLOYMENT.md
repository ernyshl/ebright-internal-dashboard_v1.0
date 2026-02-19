# Ebright Internal Dashboard - Docker Setup

## 🐳 Docker Deployment Guide

This guide explains how to dockerize and deploy the dashboard on your cloud server.

## 📋 Prerequisites

- Docker and Docker Compose installed on your server
- PostgreSQL database (either Docker container or external)
- Domain/subdomain pointing to your server

## 🏗️ Docker Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │   React App     │    │   Express API   │
│   (Port 80/443) │◄──►│   (Port 80)     │◄──►│   (Port 4000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                    │
         └────────────────────────┘                    │
                                                      ▼
                                               ┌─────────────────┐
                                               │  PostgreSQL     │
                                               │  (Port 5432)    │
                                               └─────────────────┘
```

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/EbrightOD/ebright-internal-dashboard_v1.0.git
cd ebright-internal-dashboard_v1.0
```

### 2. Configure Environment
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit backend/.env with your database credentials
nano backend/.env
```

### 3. Build and Run
```bash
# Build and start all services
docker-compose up -d --build

# Check if services are running
docker-compose ps
```

### 4. Access Your Application
- **Dashboard**: http://your-server-ip
- **API**: http://your-server-ip/api

## 📁 File Structure

```
ebright-internal-dashboard_v1.0/
├── docker-compose.yml          # Main orchestration
├── nginx/
│   └── nginx.conf             # Reverse proxy config
├── backend/
│   ├── Dockerfile             # Backend container
│   └── .env                   # Backend environment
├── frontend/
│   ├── Dockerfile             # Frontend container
│   └── .env                   # Frontend environment
└── README.md
```

## 🔧 Configuration Files

### docker-compose.yml
```yaml
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: ebrightleads_db
      POSTGRES_USER: your_db_user
      POSTGRES_PASSWORD: your_db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  # Backend API
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
    env_file:
      - ./backend/.env
    depends_on:
      - db
    networks:
      - app-network

  # Frontend App
  frontend:
    build: ./frontend
    networks:
      - app-network

  # Nginx Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"  # If using SSL
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - backend
      - frontend
    networks:
      - app-network

volumes:
  postgres_data:

networks:
  app-network:
    driver: bridge
```

### backend/Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 4000

CMD ["npm", "start"]
```

### frontend/Dockerfile
```dockerfile
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### nginx/nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    upstream backend {
        server backend:4000;
    }

    server {
        listen 80;
        server_name localhost;

        # Frontend (React app)
        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
            try_files $uri $uri/ /index.html;
        }

        # Backend API
        location /api {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    }
}
```

## 🔒 Security Considerations

### Environment Variables
- Store sensitive data in `.env` files (not in Docker images)
- Use Docker secrets for production deployments
- Never commit `.env` files to version control

### Database Security
- Use strong passwords
- Restrict database access to internal network only
- Enable SSL/TLS for database connections
- Regular backup strategy

### SSL/HTTPS (Recommended)
```bash
# Install certbot for Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 📊 Monitoring & Maintenance

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Update Deployment
```bash
# Pull latest changes
git pull origin master

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Backup Database
```bash
# Backup
docker exec -t ebright-db pg_dump -U your_user -d ebrightleads_db > backup.sql

# Restore
docker exec -i ebright-db psql -U your_user -d ebrightleads_db < backup.sql
```

## 🚨 Troubleshooting

### Common Issues

**Port 80 already in use:**
```bash
sudo netstat -tulpn | grep :80
sudo systemctl stop apache2  # or nginx
```

**Database connection failed:**
- Check database credentials in `backend/.env`
- Ensure database container is running: `docker-compose ps`
- Check database logs: `docker-compose logs db`

**Frontend not loading:**
- Check if build completed: `docker-compose logs frontend`
- Verify nginx configuration
- Check browser console for errors

## 📈 Performance Optimization

- Use Docker layer caching for faster builds
- Implement Redis for session storage (optional)
- Set up database connection pooling
- Configure nginx caching for static assets
- Use CDN for static files in production

## 🎯 Production Checklist

- [ ] Domain configured and pointing to server
- [ ] SSL certificate installed
- [ ] Database backups configured
- [ ] Monitoring/logging set up
- [ ] Firewall configured (only necessary ports open)
- [ ] Regular security updates scheduled
- [ ] Environment variables properly configured
- [ ] Database migrations run
- [ ] Application tested end-to-end

---

*This Docker setup provides a production-ready deployment for your internal dashboard.*