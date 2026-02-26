#!/bin/bash

# SSL Certificate Management Script
# Usage: ./ssl-setup.sh [domain] [email]

set -e

DOMAIN=${1:-"dashboard.ebright.my"}
EMAIL=${2:-"admin@ebright.my"}

echo "🔒 Setting up SSL for $DOMAIN"

# Install certbot if not installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing Certbot..."
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# Stop nginx if running (for standalone mode)
if systemctl is-active --quiet nginx; then
    echo "🛑 Stopping nginx for certificate generation..."
    sudo systemctl stop nginx
fi

# Get SSL certificate
echo "📜 Obtaining SSL certificate..."
sudo certbot certonly --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# Set up auto-renewal
echo "🔄 Setting up auto-renewal..."
sudo crontab -l | grep -q certbot || (
    sudo crontab -l 2>/dev/null
    echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'"
) | sudo crontab -

# Create renewal hook script
sudo tee /etc/letsencrypt/renewal-hooks/post/nginx-reload.sh > /dev/null <<EOF
#!/bin/bash
# Reload nginx after certificate renewal
systemctl reload nginx
echo "Nginx reloaded after SSL certificate renewal"
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/post/nginx-reload.sh

echo "✅ SSL setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update nginx.conf with your domain name"
echo "2. Update docker-compose.yml to mount SSL certificates"
echo "3. Run: docker-compose down && docker-compose up -d"
echo ""
echo "🔍 Test your SSL: https://$DOMAIN"
echo "🔍 SSL Labs test: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"