#!/bin/bash

set -euo pipefail
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚪 Setting up Cloud Doorway${NC}\n"

# Get the current user as default
DEFAULT_USER=$(whoami)

# Prompt for the user to run the tunnel service
read -p "Enter username for running the tunnel service [$DEFAULT_USER]: " TUNNEL_USER
TUNNEL_USER=${TUNNEL_USER:-$DEFAULT_USER}

# Create jamola-frontend-reverse-tunnel.service in the project directory
cat > jamola-frontend-reverse-tunnel.service << EOT
[Unit]
Description=AutoSSH tunnel to cloud proxy
After=network-online.target
Wants=network-online.target

[Service]
Environment="AUTOSSH_GATETIME=0"
ExecStart=/usr/bin/autossh -M 0 -N -R 0.0.0.0:3000:localhost:9090 -p 2023 d -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3"
RestartSec=5
Restart=always
User=$TUNNEL_USER

[Install]
WantedBy=multi-user.target
EOT


# Get SSH public key
DEFAULT_KEY_PATH="/home/$DEFAULT_USER/.ssh/authorized_keys"
if [ -f "$DEFAULT_KEY_PATH" ]; then
    DEFAULT_KEY=$(cat "$DEFAULT_KEY_PATH")
    read -p "Use existing SSH key from $DEFAULT_KEY_PATH? [Y/n]: " USE_DEFAULT_KEY
    USE_DEFAULT_KEY=${USE_DEFAULT_KEY:-Y}
    
    if [[ $USE_DEFAULT_KEY =~ ^[Yy]$ ]]; then
        SSH_PUBLIC_KEY="$DEFAULT_KEY"
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

# Update or create .env file with SSH key
if [ -f .env ]; then
    # Remove existing SSH_PUBLIC_KEY if present
    sed -i '/SSH_PUBLIC_KEY=/d' .env
fi
echo "SSH_PUBLIC_KEY='${SSH_PUBLIC_KEY}'" >> .env


echo -e "\n${GREEN}Setup complete!${NC}"
echo -e "Created jamola-frontend-reverse-tunnel.service with user: $TUNNEL_USER"
echo -e "\nTo complete setup on your cloud host, follow the instructions in theproxy/README.md"