# jamola

hifi internet telephony for musicians

# description

In-browser jam space with recording. Self hosted (in docker compose) multiplayer webapp. Uses WebRTC to stream everyone's microphones to each other at high bitrates.

# features

You can set a title for everyone, which makes everyone's uploads to the server more coherent.

The server is a svelte+vite+nodejs webserver behind a forwarding Caddy webserver, the easiest way to attain https.

# requirements

- docker-compose
- a duckdns account
- upnpc or other port forward access for your router (device between local and inter networks)

# install

Have a look into `install.sh` which will ask for duckdns secrets, get LetsEncrypt ssl for you, and run it all.

Which implies how you might run `docker compose up` subsequently, or `upnpc -r 443 tcp 9443` or so to forward ports on an ongoing basis, perhaps you'd add this to `docker-compose.yaml` if it works. My consumer router wouldn't let me forward 80|443 via upnp, I had to log in with the default password > forwarding > define a new "service" type to have internal port = 9443, add a use of it pointing at my "device", which was in a list. YMMV

# contributing

Yes please. Open to chats about what's up.

# community

Pending arrival. Hopefully it'll be big.

# notes

It's a svelte dev server.

## dns in your network

If browsing to your site from your own network takes you to your router's management website, it's probably because you are a LAN host sending http requests to the router, which it has a server of its own for. Only traffic from outside gets port forwarding. So I added to `/etc/hosts`:
```
127.0.0.1 localhost voulais.duckdns.org
```
And browse `https://voulais.duckdns.org:9443/`.

Apparently this can be done on a rooted Android as well. Or do your own DNS, host it elsewhere, or use it elsewhere. Your local art gallery may have free wifi reachable from a nice place.

## fake input devices

Would be nice to test with. I usually use "Monitor of EasyEffects Sink" which handles feedback well. 

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

### Having gain knobs and meters.

User should start playing loudly and adjust their levels
                                to frame that intensity.

Also I think we could learn something from EasyEffects.
I recommend it.
I particularly use a Limiter
 for accidental mega-loud-machine-noise-surges
     from glitching software,
and AutoGain
 to standardise the volume of things in general,
 which also manages surfing feedback very well.

 Laptop power supplies running your stereo
  will also switch off if over-amped
 during noise surges.

So something about taking care of your ears.

### other

 - text chat
 - recording and saving, as many tracks? they might want aligning depending on who is timing-dominant wrt latency...
 - dockerise coturn server as well (how necessary is this?)
 - stabilise latency - to the beat or fraction of. feeling what it is.
 - on|off video, quality controls

