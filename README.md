# homebridge-platform-ring-video-doorbell
A [Ring Video Doorbell](https://ring.com/) platform plugin for [Homebridge](https://github.com/nfarina/homebridge).

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-platform-ring-video-doorbell

On Linux, you might see this output for the second command:

    npm ERR! pcap2@3.0.4 install: node-gyp rebuild
    npm ERR! Exit status 1
    npm ERR!

If so, please try

    % apt-get install libpcap-dev

and try

    % sudo npm install -g homebridge-platform-ring-video-doorbell

again!

# Configuration
Edit `~/.homebridge/config`, inside `"platforms": [ ... ]` add:

    { "platform"  : "ring-video-doorbell"
    , "name"      : "Doorbell"
    , "username"  : "user@example.com"
    , "password"  : "secret"

    // optional, here are the defaults
    , "options"   : { "retries": 15, "ttl": 5, "verboseP" : false }
    }

# Camera Integration
The current version of this plugin doesn't handle the camera available in the Ring Video doorbell;
however,
as noted by [@barkerja](https://github.com/barkerja),
you can use the [camera plugin](https://github.com/KhaosT/homebridge-camera-ffmpeg),
and place both accessories in the same "room".
HomeKit manage the two accessories as one "seamless" device.

# Many Thanks
Many thanks to [jeroenmoors](https://github.com/jeroenmoors) author of
[php-ring-api](https://github.com/jeroenmoors/php-ring-api).

Many thanks (also) to [davglass](https://github.com/davglass) author of
[doorbot](https://github.com/davglass/doorbot).
