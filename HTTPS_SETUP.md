# HTTPS Configuration Guide

## 🔒 Making Your Dashboard HTTPS

This guide shows how to secure your Docker deployment with HTTPS.

## 🚀 Quick HTTPS Setup (Recommended)

### Option 1: Let's Encrypt (Free & Automatic)

**1. Install Certbot on your server:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python-certbot-nginx
```

**2. Get SSL Certificate:**
```bash
# Stop nginx if running
sudo systemctl stop nginx

# Get certificate (replace with your domain)
sudo certbot certonly --standalone -d yourdomain.com

# Or for nginx (if using external nginx)
sudo certbot --nginx -d yourdomain.com
```

**3. Update Docker Configuration:**

Modify your `docker-compose.yml` to use SSL:

```yaml
# Add SSL volume mount to nginx service
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    - ./ssl:/etc/nginx/ssl  # Mount SSL certificates
    - /etc/letsencrypt:/etc/letsencrypt  # Let's Encrypt certs
  environment:
    - CERT_PATH=/etc/letsencrypt/live/yourdomain.com
```

**4. Update nginx.conf for SSL:**

```nginx
# In your nginx/nginx.conf, add SSL server block:

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rest of your configuration...
    location / {
        proxy_pass http://frontend;
        # ... existing config
    }

    location /api {
        proxy_pass http://backend;
        # ... existing config
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**5. Renew Certificates Automatically:**
```bash
# Add to crontab for auto-renewal
sudo crontab -e

# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

---

## 🛠️ Option 2: Self-Signed Certificate (Development/Testing)

**1. Generate Self-Signed Certificate:**
```bash
# Create SSL directory
mkdir -p ssl

# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes

# When prompted, enter your details (localhost for testing)
```

**2. Update docker-compose.yml:**
```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    - ./ssl:/etc/nginx/ssl
```

**3. Update nginx.conf:**
```nginx
server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # ... rest of config
}
```

**4. Access with HTTPS:**
- URL: `https://your-server-ip`
- Browser will show security warning (expected for self-signed)

---

## 🌐 Option 3: Cloud Provider SSL

### AWS (ACM + ALB):
- Use AWS Certificate Manager
- Configure Application Load Balancer with SSL
- Point ALB to your Docker containers

### DigitalOcean:
- Use DO Load Balancer with SSL
- Or use DO Managed Databases + App Platform

### Google Cloud:
- Use Google Managed SSL
- Configure HTTPS Load Balancer

---

## 🔧 Environment Configuration

**Update your environment files for HTTPS:**

```bash
# backend/.env
CORS_ORIGIN=https://yourdomain.com

# frontend/.env
VITE_API_BASE_URL=https://yourdomain.com/api
```

---

## 🧪 Testing HTTPS

**1. Test SSL Certificate:**
```bash
# Check certificate validity
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# SSL Labs test
# Visit: https://www.ssllabs.com/ssltest/
```

**2. Test Application:**
```bash
# Test API over HTTPS
curl -k https://yourdomain.com/api/health

# Test frontend
curl -k https://yourdomain.com
```

---

## 🚨 Security Best Practices

### SSL/TLS Configuration:
- Use TLS 1.2 or higher
- Disable weak ciphers
- Enable HSTS header
- Regular certificate renewal

### Additional Security:
```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### Firewall Configuration:
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
```

---

## 🔄 HTTPS Migration Checklist

- [ ] Domain configured and pointing to server
- [ ] SSL certificate obtained (Let's Encrypt recommended)
- [ ] nginx configuration updated for SSL
- [ ] Docker containers rebuilt and restarted
- [ ] Environment variables updated for HTTPS URLs
- [ ] HTTP to HTTPS redirect configured
- [ ] Security headers added
- [ ] Firewall configured for ports 80/443
- [ ] SSL certificate auto-renewal set up
- [ ] Application tested end-to-end over HTTPS

---

## 🆘 Troubleshooting

**Certificate not trusted:**
- Use Let's Encrypt instead of self-signed
- Check certificate validity dates

**Mixed content errors:**
- Update all internal links to use HTTPS
- Check for hardcoded HTTP URLs in code

**SSL handshake failures:**
- Verify certificate and key file paths
- Check nginx SSL configuration
- Test with `openssl s_client`

**Port 443 already in use:**
```bash
sudo netstat -tulpn | grep :443
sudo systemctl stop apache2  # or other web server
```

---

*HTTPS provides encrypted communication and builds user trust. Let's Encrypt offers free certificates with automatic renewal.*