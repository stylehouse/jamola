

## dns in your network

If browsing to your site from your own network takes you to your router's management website, it's probably because you are a LAN host sending http requests to the router, which it has a server of its own for. Only traffic from outside gets port forwarding. So I added to `/etc/hosts`:
```
127.0.0.1 localhost voulais.duckdns.org
```
And browse `https://voulais.duckdns.org:9443/`.

Apparently this can be done on a rooted Android as well. Or do your own DNS, host it elsewhere, or use it elsewhere. Your local art gallery may have free wifi reachable from a nice place.
