# Cloud Doorway

A reverse proxy setup using Caddy and SSH tunneling. This will use minimal resources on the cloud host.

## Prerequisites

- A cloud host with Docker installed
- A DuckDNS account and domain
- SSH access to your cloud host
- A working jamola instance on your local host

## Local Setup

1. Having already run the main install script to configure some stuff:
```bash
./install.sh
```
2. Run this to add an ssh key to `.env` and create the `jamola-frontend-reverse-tunnel.service` for persistent tunneling, read on.:
```bash
./theproxy-install.sh
```
You should read these completely before you run them on your computer, even without sudo.

## Cloud Host Setup

1. First, configure the firewall on your cloud host:
```bash
# Remove Docker daemon ports
sudo ufw delete allow 2375/tcp
sudo ufw delete allow 2376/tcp
sudo ufw delete allow 2375/tcp v6
sudo ufw delete allow 2376/tcp v6

# Allow Caddy and SSH tunnel
sudo ufw allow 443/tcp
sudo ufw allow 2023/tcp
```

2. Deploy the proxy:
```bash
# Copy files to your cloud host (assuming it's named 'd')
scp -r theproxy/ d:

# SSH to host and start containers
ssh d
cd theproxy
docker compose up -d
```

3. Test the tunnel locally:
```bash
ssh -R 0.0.0.0:3000:localhost:9090 -p 2023 d
```

## Persistent Tunnel

For a persistent connection, install autossh and the service on your local machine:

```bash
# Install autossh
sudo apt-get install autossh

# Deploy the service file created by theproxy-install.sh
sudo mv jamola-frontend-reverse-tunnel.service /etc/systemd/system/

# Enable and start the service
sudo systemctl enable jamola-frontend-reverse-tunnel
sudo systemctl start jamola-frontend-reverse-tunnel
```

## Troubleshooting

- Check container logs: `docker compose logs -f`
- Verify SSH tunnel: `netstat -plant` on the cloud host
- Test Caddy proxy: curl ssh-tunnel:3000 from inside the Caddy container
- Check systemd service status: systemctl status jamola-frontend-reverse-tunnel
- View service logs: journalctl -u jamola-frontend-reverse-tunnel -f

## Environment Variables

The `.env` file should contain:
- `DUCKDNS_API_TOKEN`: Your DuckDNS API token
- `SSH_PUBLIC_KEY`: Your SSH public key (added by install.sh)