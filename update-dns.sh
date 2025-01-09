#!/bin/busybox ash
# the above will handle signals while sleeping better
set -e
# dont keep sleeping if docker wants to exit
trap "exit 0" SIGTERM

update_dns() {
    IP=$(curl -s 'https://api.ipify.org?format=json' | jq -r '.ip')
    RESPONSE=$(curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${IP}")
    
    if [ "$RESPONSE" = "OK" ]; then
        echo "$(date): Successfully updated DNS record for ${DUCKDNS_DOMAIN} to ${IP}"
    else
        echo "$(date): Failed to update DNS record. Response: ${RESPONSE}"
        return 1
    fi
}

# Initial update
update_dns

# Then update every 12 hours
while true; do
    sleep 43200  # 12 hours in seconds
    update_dns
done