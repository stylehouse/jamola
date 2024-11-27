# jamola

hifi internet telephony for musicians

# description

In-browser jam space. Uses WebRTC to stream everyone's microphones to each other at high bitrates.

# features

You can set a title for everyone. Doing so syncronises everyone's recordings, which are uploaded to the server.

# install

Have a look into `install.sh` which will ask for duckdns secrets, get LetsEncrypt ssl for you, and run it all.

Which implies how you might run `docker compose up` subsequently, or `upnpc -r 443 tcp 9443` or so to forward ports on an ongoing basis, perhaps you'd add this to `docker-compose.yaml` if it works. My consumer router wouldn't let me forward 80|443 via upnp, I had to log in with the default password and define a new service to have internal port = 9443 etc.

# development notes

## dns in your network

If browsing to your site from your own network takes you to your router's management website, it's probably because you are a LAN host sending http requests to the router, which it has a server of its own for. Only traffic from outside gets port forwarding. So I added to `/etc/hosts`:
```
127.0.0.1 localhost voulais.duckdns.org
```
And browse `https://voulais.duckdns.org:9443/`.

Apparently this can be done on a rooted Android as well. Or do your own DNS, host it elsewhere, or use it elsewhere. Your local art gallery may have free wifi reachable from a nice place.

## fake input devices

This didn't work for me:
```
pw-cli create-node adapter { factory.name=support.loopback node.name=FakeAudio }
aplay -D FakeAudio '/media/s/12117025 dp/Music/Highsoul/0 worldish/VA - Kenny Graham, Guy Warren/Guy Warren - 1959 - themes for african drums/02 waltzing drums.mp3'
```

Nor did:
```
sudo apt install sox
sox -n -r 44100 -c 1 tone.wav synth 10 sine 440
pactl load-module module-pipe-source source_name=tone_source file=tone.wav
```

## TODO

 - text chat
 - recording and saving, as many tracks? they might want aligning depending on who is timing-dominant wrt latency...
 - dockerise coturn server as well (how necessary is this?)
 - stabilise latency - to the beat or fraction of. feeling what it is.
 - input stream selector
 - on|off video, quality controls

