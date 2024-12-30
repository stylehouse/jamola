#!/bin/bash

set -euo pipefail
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎵 Installing Jamola - HiFi Internet Telephony for Musicians${NC}\n"

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
sed -i.bak "s/voulais.duckdns.org/${DUCKDNS_DOMAIN}/g" docker-compose.yml

# Create .env file
cat > .env << EOF
DUCKDNS_API_TOKEN=${DUCKDNS_TOKEN}
EOF

echo -e "\n${GREEN}Starting services...${NC}"
docker compose up -d

echo -e "\n${GREEN}Installation complete!${NC}"
echo -e "Your Jamola instance is now running at: https://${DUCKDNS_DOMAIN}"
echo -e "\nTo view logs: docker compose logs -f"
echo -e "To stop: docker compose down"

