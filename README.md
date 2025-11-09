# localtunnel-server

localtunnel exposes securely your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

This repository contains the server component of localtunnel. If you are looking for the CLI localtunnel app, see [localtunnel CLI](https://github.com/balaji8385/localtunnel-server.git).

---

## Overview

You can easily set up and run your own server. To run your own localtunnel server, ensure the following:

- You can set up DNS entries for your `domain.tld` and `*.domain.tld` (or `sub.domain.tld` and `*.sub.domain.tld`).
- The server can accept incoming TCP connections for any non-root TCP port (i.e., ports over 1000).

The above are important because the client will request a subdomain under a particular domain, and the server will listen on any OS-assigned TCP port for client connections.

---

## Setup

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/balaji8385/localtunnel-server.git
   cd localtunnel-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

   By default, the server will run on port `3000`. You can configure the port and other options using environment variables (see below).

---

### Environment Variables

You can configure the server using the following environment variables:

| Variable                | Description                                           | Default       |
|------------------------|-------------------------------------------------------|---------------|
| `PORT`                 | Port on which the server will run                    | `3000`        |
| `ADDRESS`              | Address to bind the server to                        | `0.0.0.0`     |
| `DOMAIN`               | The domain for subdomains (e.g., `example.com`)       | None          |
| `SECURE`               | Enable HTTPS for web interface (recommended)          | `false`       |
| `HTTPS_KEY`            | Path to HTTPS private key file for web interface     | None          |
| `HTTPS_CERT`           | Path to HTTPS certificate file for web interface     | None          |
| `TLS_KEY`              | Path to TLS private key file for client tunnels      | None          |
| `TLS_CERT`             | Path to TLS certificate file for client tunnels      | None          |
| `SECURE_CLIENT_TUNNEL` | Enable TLS for client tunnels (recommended)           | `false`       |
| `JWT_SHARED_SECRET`    | Shared secret for JWT authentication to call APIs     | None          |
| `MAX_SOCKETS`          | Maximum number of simultaneous client tunnels        | `10`          |
| `RANGE`                | Port range for tunnels (e.g., `4000:4100`)           | None          |

You can create a `.env` file in the root directory to set these variables for local development.

Example `.env` file:
```env
# HTTPS Configuration (Recommended for production)
SECURE=true
HTTPS_KEY="../key.pem"
HTTPS_CERT="../cert.pem"

# TLS Configuration for Client Tunnels (Recommended for production)
TLS_KEY="../key.pem"
TLS_CERT="../cert.pem"
SECURE_CLIENT_TUNNEL=true

# Server Configuration
PORT=3000
ADDRESS=0.0.0.0
DOMAIN=example.com

# Tunnel Configuration
MAX_SOCKETS=10
RANGE="4000:4100"

# Authentication
JWT_SHARED_SECRET=your-secret-key
```

**Note:** The port range specified in `RANGE` must be allowed through your firewall for tunnel connections to work properly.

---

### REST API

#### **POST** `/api/tunnels`
Create a new tunnel. A localtunnel client posts to this endpoint to request a new tunnel with a specific name or a randomly assigned name.

#### **GET** `/api/status`
Retrieve general server information, including the number of active tunnels and memory usage.

---

## Using Your Server

Once the server is running, you can use your domain with the `lt` client:

```bash
lt --host http://example.com --port 9000
```

You will be assigned a URL similar to `heavy-puma-9.example.com`.

If your server is behind a reverse proxy (e.g., Nginx) and listens on port 80, you do not need to specify the port in the `lt` client.

---

## Docker Deployment

You can deploy your own localtunnel server using Docker.

### Build the Docker Image

1. Build the Docker image:
   ```bash
   docker build -t localtunnel-server .
   ```

2. Run the Docker container:
   ```bash
   docker run -d \
       --restart always \
       --name localtunnel \
       --net host \
       -p 3000:3000 \
       -e PORT=3000 \
       -e DOMAIN=example.com \
       -e SECURE=true \
       -e JWT_SHARED_SECRET=your-secret-key \
       localtunnel-server
   ```

---

### Using Prebuilt Docker Image

You can also use the prebuilt Docker image:

```bash
docker run -d \
    --restart always \
    --name localtunnel \
    -p 3000:3000 \
    -e PORT=3000 \
    -e DOMAIN=example.com \
    -e SECURE=true \
    -e JWT_SHARED_SECRET=your-secret-key \
    your-dockerhub-username/localtunnel-server:latest
```

---

## SSL & Nginx Reverse Proxy Setup

For production deployments, it's highly recommended to use Nginx as a reverse proxy with SSL/TLS encryption. This provides:

- **HTTPS Support** with Let's Encrypt certificates
- **Wildcard Subdomain** handling for dynamic tunnel subdomains
- **WebSocket Proxying** for tunnel connections
- **Automatic Certificate Renewal**
- **Enhanced Security** and performance

### Quick Start

1. **Navigate to the nginx configuration directory:**
   ```bash
   cd localtunnel-server/nginx.conf
   ```

2. **Copy the example configuration:**
   ```bash
   cp tunnel.conf.example tunnel.conf
   ```

3. **Edit with your settings:**
   ```bash
   nano tunnel.conf
   # Replace: YOUR_DOMAIN, YOUR_PORT, YOUR_LOG_NAME
   ```

4. **Follow the complete setup guide:**
   
   **[See detailed SSL & Nginx Setup Guide](./localtunnel-server/nginx.conf/README.md)**

The guide includes:
- Step-by-step SSL certificate setup (Let's Encrypt & self-signed)
- Complete nginx configuration with explanations
- Automatic certificate renewal setup
- Security best practices
- Troubleshooting common issues
- Logging and monitoring

### Basic Example

Here's a minimal Nginx configuration for quick reference:

```nginx
server {
    listen 80;
    server_name example.com *.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com *.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For a production-ready configuration with all security headers, SSL optimizations, and detailed instructions, refer to the [complete documentation](./localtunnel-server/nginx.conf/README.md).

---

### ☕ Support My Work
If you find my projects helpful, consider supporting me:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/balaji8385)
