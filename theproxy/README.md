# Cloud Doorway

A reverse proxy setup using Caddy and SSH tunneling. This will use minimal resources on the cloud host.

## Prerequisites

- A cloud host with Docker installed
- A DuckDNS account and domain
- SSH access to your cloud host
- A working jamola instance on your local host

## Local Setup

Consists of an ssh key pair that have been put in *.env*, and go into ssh-tunnel-* at either end.

Deploy theproxy's compose:
```bash
scp -r theproxy/ d:
```

## Cloud Host Setup

```bash
# SSH to host and start containers
ssh d
cd theproxy
docker compose up -d

# Remove Docker daemon ports
sudo ufw delete allow 2375/tcp
sudo ufw delete allow 2376/tcp
sudo ufw delete allow 2375/tcp v6
sudo ufw delete allow 2376/tcp v6

# Allow Caddy and SSH tunnel
sudo ufw allow 443/tcp
sudo ufw allow 2023/tcp
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