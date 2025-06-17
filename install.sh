#!/bin/bash

set -euo pipefail
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎵 Installing Jamola - HiFi Internet Telephony for Musicians${NC}\n"
echo "Note- if you are not hosting your app via https (restricting it to localhost),"
echo "  you may abort and simply run: docker compose up"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    echo "Visit: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if miniupnpc is installed
if ! command -v upnpc &> /dev/null; then
    echo -e "${RED}miniupnpc is not installed.${NC}"
    echo "Installing miniupnpc..."
    if command -v apt &> /dev/null; then
        sudo apt install -y miniupnpc
    elif command -v yum &> /dev/null; then
        sudo yum install -y miniupnpc
    elif command -v brew &> /dev/null; then
        brew install miniupnpc
    else
        echo -e "${RED}Could not install miniupnpc automatically. Please install it manually.${NC}"
        exit 1
    fi
fi

# Get DuckDNS domain and token
echo -e "\n${GREEN}Setup DuckDNS configuration:${NC}"
read -p "Enter your DuckDNS subdomain (e.g., yourname.duckdns.org): " DUCKDNS_DOMAIN
read -p "Enter your DuckDNS token: " DUCKDNS_TOKEN
# Update docker-compose.yml with the domain
sed -E -i.bak "s/voulais(-dev)?.duckdns.org/${DUCKDNS_DOMAIN}/g" docker-compose.yaml
sed -i.bak "s/voulais.duckdns.org/${DUCKDNS_DOMAIN}/g" theproxy/docker-compose.yaml
# Create .env file
cat > .env << EOF
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
DUCKDNS_DOMAIN=${DUCKDNS_DOMAIN}
EOF





# Generate SSH keys for tunnel
echo -e "\n${GREEN}Just in case you want to run the public Caddy server elsewhere..."
ssh-keygen -t ed25519 -f tunnel_key -N ""
PRIVATE_KEY=$(cat tunnel_key)
PUBLIC_KEY=$(cat tunnel_key.pub)

# Add the user's SSH pubkey so they can debug
DEFAULT_KEY_PATH="/home/$DEFAULT_USER/.ssh/authorized_keys"
if [ -f "$DEFAULT_KEY_PATH" ]; then
    DEFAULT_KEY=$(cat "$DEFAULT_KEY_PATH")
    read -p "Use existing SSH key from $DEFAULT_KEY_PATH? [Y/n]: " USE_DEFAULT_KEY
    USE_DEFAULT_KEY=${USE_DEFAULT_KEY:-Y}
    
    if [[ $USE_DEFAULT_KEY =~ ^[Yy]$ ]]; then
        SSH_PUBLIC_KEY="$SSH_PUBLIC_KEY\n$DEFAULT_KEY"
    else
        read -r -p "Enter SSH public key: " SSH_PUBLIC_KEY
    fi
else
    read -r -p "Enter SSH public  key: " SSH_PUBLIC_KEY
fi
# Basic SSH key format validation
if [[ ! $SSH_PUBLIC_KEY =~ ^(ssh-rsa|ssh-dss|ecdsa-sha2-nistp|ssh-ed25519)[[:space:]] ]]; then
    echo -e "${RED}Warning: SSH key format not recognized. Please verify it's correct.${NC}"
    read -p "Continue anyway? [y/N]: " CONTINUE
    if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Add to .env file
cat >> .env << EOF
SSH_PRIVATE_KEY="${PRIVATE_KEY}"
SSH_PUBLIC_KEY="${PUBLIC_KEY}"
EOF
# Clean up key files
rm tunnel_key tunnel_key.pub





echo -e "\n${GREEN}Starting services...${NC}"
docker compose up -d

echo -e "\n${GREEN}Installation complete!${NC}"
echo -e "Your Jamola instance is now running at: https://${DUCKDNS_DOMAIN}"
echo -e "\nTo view logs: docker compose logs -f"
echo -e "To stop: docker compose down"
echo -e "See also theproxy/README.md to run the public Caddy server elsewhere."

