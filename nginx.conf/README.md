# Nginx Configuration for Tunnel Server

This directory contains the nginx reverse proxy configuration for the tunnel server.

## 📋 Overview

The nginx configuration provides:
- HTTP to HTTPS redirection
- SSL/TLS termination with Let's Encrypt certificates
- Wildcard subdomain support
- WebSocket proxying
- Reverse proxy to the tunnel server backend

## 🚀 Setup Instructions

### 1. Copy the Example Configuration

```bash
cd nginx.conf
cp tunnel.conf.example tunnel.conf
```

### 2. Configure Your Settings

Edit `tunnel.conf` and replace the following placeholders:

| Placeholder | Description | Example |
|------------|-------------|---------|
| `YOUR_DOMAIN` | Your base domain name | `example.com` |
| `YOUR_PORT` | Backend server port | `3000` |
| `YOUR_LOG_NAME` | Log file prefix | `tunnel` |

### 3. SSL Certificates

#### Option A: Using Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain wildcard certificate (requires DNS verification)
sudo certbot certonly --manual --preferred-challenges dns \
  -d YOUR_DOMAIN -d *.YOUR_DOMAIN

# Or for single domain (HTTP-01 challenge)
sudo certbot --nginx -d YOUR_DOMAIN
```

#### Option B: Self-Signed Certificates (Development Only)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt
```

Then update the SSL certificate paths in `tunnel.conf` accordingly.

### 4. Deploy the Configuration

```bash
# Test nginx configuration
sudo nginx -t

# Copy to nginx sites-available
sudo cp tunnel.conf /etc/nginx/sites-available/tunnel.conf

# Enable the site
sudo ln -s /etc/nginx/sites-available/tunnel.conf /etc/nginx/sites-enabled/

# Reload nginx
sudo systemctl reload nginx
```

## ⚙️ Configuration Options

### Basic Settings

```nginx
server_name YOUR_DOMAIN *.YOUR_DOMAIN;
```
- Configures the domain and wildcard subdomains that nginx will handle

### SSL Settings

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
```
- Only allows secure TLS versions (1.2+)
- Uses strong cipher suites

### Proxy Settings

```nginx
proxy_pass https://localhost:YOUR_PORT;
```
- Forwards requests to your backend tunnel server
- Change protocol to `http://` if backend doesn't use SSL

### WebSocket Support

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```
- Required for WebSocket connections
- Essential for tunnel functionality

### Timeouts

```nginx
proxy_read_timeout 90;
```
- Adjust this value if you need longer connection timeouts
- Useful for long-running tunnel connections

## 🔒 Security Best Practices

1. **Keep tunnel.conf Private**
   - Never commit `tunnel.conf` to version control
   - It's already listed in `.gitignore`
   - Only commit `tunnel.conf.example`

2. **SSL Certificate Permissions**
   ```bash
   sudo chmod 644 /etc/letsencrypt/live/YOUR_DOMAIN/*.pem
   sudo chown root:root /etc/letsencrypt/live/YOUR_DOMAIN/*.pem
   ```

3. **Regular Updates**
   - Keep nginx updated: `sudo apt-get update && sudo apt-get upgrade nginx`
   - Renew SSL certificates: `sudo certbot renew`

4. **Firewall Configuration**
   ```bash
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   ```

## 📝 Logging

Logs are stored in:
- Access log: `/var/log/nginx/YOUR_LOG_NAME.access.log`
- Error log: `/var/log/nginx/YOUR_LOG_NAME.error.log`

### View Logs

```bash
# Tail access logs
sudo tail -f /var/log/nginx/YOUR_LOG_NAME.access.log

# Tail error logs
sudo tail -f /var/log/nginx/YOUR_LOG_NAME.error.log

# Search for errors
sudo grep "error" /var/log/nginx/YOUR_LOG_NAME.error.log
```

## 🐛 Troubleshooting

### Test Configuration

```bash
# Test nginx configuration syntax
sudo nginx -t
```

### Check nginx Status

```bash
sudo systemctl status nginx
```

### Restart nginx

```bash
sudo systemctl restart nginx
```

### Common Issues

1. **502 Bad Gateway**
   - Check if backend server is running
   - Verify `proxy_pass` port matches your backend

2. **SSL Certificate Errors**
   - Verify certificate paths exist
   - Check certificate permissions
   - Ensure certificates are not expired: `sudo certbot certificates`

3. **WebSocket Connection Failed**
   - Verify Upgrade headers are configured
   - Check firewall rules
   - Ensure backend supports WebSocket

## 🔄 Automatic SSL Renewal

Certbot automatically sets up certificate renewal when installed. Here's how to verify and customize it:

### Verify Automatic Renewal is Working

```bash
# Check if certbot timer is active (systemd-based systems)
sudo systemctl status certbot.timer

# Check if certbot renewal cron job exists (cron-based systems)
sudo cat /etc/cron.d/certbot

# Test renewal process (dry run - doesn't actually renew)
sudo certbot renew --dry-run
```

### How It Works

- **Systemd Timer** (Ubuntu 18.04+, Debian 10+): Runs twice daily
- **Cron Job** (older systems): Runs twice daily at random times
- Certificates are renewed when they have 30 days or less remaining
- Nginx is automatically reloaded after successful renewal

### Manual Renewal (if needed)

```bash
# Force renewal (even if not near expiration)
sudo certbot renew --force-renewal

# Renew and reload nginx
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

### Custom Renewal Hook

To run custom commands after renewal (e.g., notifications, logging), create a deploy hook:

```bash
# Create hook script
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Add this content:

```bash
#!/bin/bash
# Reload nginx after certificate renewal
systemctl reload nginx

# Optional: Send notification or log
echo "$(date): SSL certificate renewed" >> /var/log/ssl-renewal.log

# Optional: Restart your tunnel server if needed
# systemctl restart triotunnel-server
```

Make it executable:

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Monitor Renewal Status

```bash
# Check certificate expiration dates
sudo certbot certificates

# View renewal logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# Check when certificates will expire
sudo openssl x509 -in /etc/letsencrypt/live/YOUR_DOMAIN/cert.pem -text -noout | grep "Not After"
```

### Troubleshooting Automatic Renewal

If automatic renewal fails:

1. **Check timer/cron status:**
   ```bash
   sudo systemctl list-timers certbot.timer
   ```

2. **Manually trigger renewal:**
   ```bash
   sudo certbot renew --dry-run
   ```

3. **Check logs for errors:**
   ```bash
   sudo tail -50 /var/log/letsencrypt/letsencrypt.log
   ```

4. **Common issues:**
   - Port 80 or 443 blocked by firewall
   - DNS records not pointing to server
   - Nginx configuration errors preventing reload

### Email Notifications

Certbot sends email alerts when:
- Certificates are about to expire (if renewal fails)
- Renewal is successful

Update notification email:

```bash
sudo certbot update_account --email your-email@example.com
```

## 📚 Additional Resources

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [WebSocket Proxying](https://nginx.org/en/docs/http/websocket.html)

## 🤝 Contributing

When contributing configuration changes:
1. Only modify `tunnel.conf.example`
2. Never commit `tunnel.conf`
3. Document any new configuration options in this README
4. Test changes thoroughly before committing

## 📄 License

This configuration is part of the tunnel server project.
