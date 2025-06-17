# Cloud Doorway

A minimal reverse proxy setup that securely exposes your local jamola server to the internet. Uses Caddy for HTTPS and SSH tunneling for the connection back to your local machine.

Have a look into `install.sh` which will ask for duckdns secrets, get LetsEncrypt ssl for you, and run it all.

Which implies how you might run `docker compose up` subsequently, or `upnpc -r 443 tcp 9443` or so to forward ports on an ongoing basis, perhaps you'd add this to `docker-compose.yaml` if it works. My consumer router wouldn't let me forward 80|443 via upnp, I had to log in with the default password > forwarding > define a new "service" type to have internal port = 9443, add a use of it pointing at my "device", which was in a list. YMMV


## How It Works

1. Local jamola instance runs on port 9090
2. SSH tunnel connects from local to cloud host (port 2023)
3. Tunnel forwards cloud port 3000 to local jamola
4. Caddy provides HTTPS and forwards to tunnel port 3000

## Prerequisites

- A cloud host with Docker installed (assumed to be 'host d' in /etc/hosts)
- A DuckDNS account and domain (configured during jamola install)
- SSH access to your cloud host

## Setup

The jamola installer has already:
- Set up your DuckDNS configuration
- Generated SSH keys
- Stored everything in .env

Now to set up the cloud proxy:

1. Copy files to cloud:
```bash
scp -r theproxy/ d:
```

2. SSH to host and start services:
```bash
ssh d
cd theproxy
docker compose up -d
```

3. Configure firewall:
```bash
# Remove Docker daemon ports
sudo ufw delete allow 2375/tcp
sudo ufw delete allow 2376/tcp
sudo ufw delete allow 2375/tcp v6
sudo ufw delete allow 2376/tcp v6

# Allow only needed ports
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 2023/tcp # SSH tunnel
```

## Environment Variables

Already configured in .env by the installer:
- `DUCKDNS_TOKEN`: Your DuckDNS token for SSL certificates
- `DUCKDNS_DOMAIN`: Your domain, eg voulais.duckdns.org
- `SSH_PRIVATE_KEY`: The SSH key for the tunnel client
- `SSH_PUBLIC_KEY`: The SSH key(s) for the tunnel server


## Troubleshooting

Check each component:

1. Local tunnel:
```bash
# Check tunnel logs
docker compose logs -f ssh-tunnel-source
# Verify tunnel container is running
docker compose ps ssh-tunnel-source
# Experience it yourself
ssh -p 2023 root@d
```

2. Cloud containers:
```bash
docker compose logs -f
docker exec -it theproxy-ssh-tunnel-destiny-1 bash
netstat -plant  # Check listening ports
```

3. Caddy proxy:
```bash
docker exec -it theproxy-caddy-1 bash
curl ssh-tunnel-destiny:3000  # Test internal connection
```
