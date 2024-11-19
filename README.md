# jamola

hifi internet telephony for musicians

# description

In-browser jam space. Uses WebRTC to stream everyone's microphones to each other at high bitrates.

# install

Have a look into `install.sh` which will ask for duckdns secrets, get LetsEncrypt ssl for you, and run it all.

Which implies how you might run `docker compose up` subsequently, or `upnpc -r 443 tcp 9443` or so to forward ports on an ongoing basis. My consumer router wouldn't let me forward 80|443 via upnp, I had to log in with the default password and define a new service to have internal port = 9443 etc.

#