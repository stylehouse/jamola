# jamola

hifi internet telephony for musicians

# description

In-browser jam space with recording. Self hosted (in docker compose) multiplayer webapp. Uses WebRTC to stream everyone's microphones to each other at high bitrates.

# features

You can set a title for everyone, which makes everyone's uploads to the server more coherent.

The server is a svelte+vite+nodejs webserver, which you can plumb to the web:

## setup

First time,

```bash
# get such a container
docker compose build
# populate your ./node_modules, mounted in the container under /app
docker run --rm -v .:/app jamola-app:latest npm install"
```

Thence,

```bash
docker compose up
```

If your docker0 interface isnt 172.17.0.1 (so _leproxy_ can reverse to it), edit *docker-compose.yml* and related things until it works.

## hosting

- with eg a duckdns account, for a name, and any of:
- _theflatrouter/_ describes hosting at home
- _theproxy/_ at the cloud
- my project _leproxy_ can public-https-ify local http services (at the cloud)
- some user-friendly vpn solution based on WireGuard (examples?)

For any _the*/_ you'd want to know what *netstat -plant* is already, and then go and read `install.sh`.

_leproxy_ doesn't involve hacking text files but needs somewhere public to reverse ports from.

# contributing

Yes please. Open to chats about what's up.

# community

Pending arrival. Hopefully it'll be big.

# notes

It's a svelte dev server.

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

I would have another Linux somewhere, select "Monitor of ..." as microphone, and run:
```
mplayer -loop 0 *.flac
```
I ended up using that other computer for testing, here are some commands:
```
ssh v x11vnc -display :0 -localhost -forever -shared -rfbauth .local/share/vnc/passwd
ssh -L 5900:localhost:5900 v
vncviewer localhost
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

