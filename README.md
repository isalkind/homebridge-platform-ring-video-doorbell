# homebridge-platform-ring-video-doorbell
A [Ring Video Doorbell](https://ring.com/) platform plugin for [Homebridge](https://github.com/nfarina/homebridge).

# Installation
Run these commands:

    % sudo npm install -g homebridge
    % sudo npm install -g homebridge-platform-ring-video-doorbell

On Linux, you might see this output for the second command:

    npm ERR! pcap@2.0.0 install: node-gyp rebuild
    npm ERR! Exit status 1
    npm ERR!

If so, please try

    % apt-get install libpcap-dev

and try

    % sudo npm install -g homebridge-platform-ring-video-doorbell

again!

NB: If you install homebridge like this:

    sudo npm install -g --unsafe-perm homebridge

Then all subsequent installations must be like this:

    sudo npm install -g --unsafe-perm homebridge-platform-ring-video-doorbell

# Configuration
Edit `~/.homebridge/config.json`, inside `"platforms": [ ... ]` add:

    { "platform"  : "ring-video-doorbell"
    , "name"      : "Doorbell"
    , "username"  : "user@example.com"
    , "password"  : "secret"

    , "options"   : { "retries": 5, "ttl": 5, "verboseP" : false }
    , "ringing"   : { "event": "single", "motion": false, "contact": false }
    }

The `options` line contains defaults, so you may omit it.

The `ringing` line defines what events is generated when ringing occurs.
The value for `event` is one of:

- `"single"` (the default);

- `"double"` (the default previous to version `0.9.0`); or,

- `"long"`

The value for `motion` is either `true` or `false` (the default) and indicates whether the motion detector should trigger
when the doorbell rings.

The value for `contact` is either `true` or `false` (the default) and indicates whether a contact sensor should be present that
triggers to `OPEN` when the doorbell rings.

# HomeKit Appearance
Each doorbell appears as an accessory that is both a "programmable switch" and a "motion detector".

For example,
as shown in the [Eve App](https://www.evehome.com/en/eve-app):

<img src='01.png' width='224' height='488' />

In addition,
if you set the `ringing` option to set `contact` and `false`,
then a "contact sensor" is also present in the doorbell accessory,
in which `OPEN` indicates a ringing doorbell.

## "Motion Detector" Notifications
Homekit allows you to enable notifications when motion is detected (or contact sensors are updated), e.g.,

<img src='00.png' width='224' height='488' />

To enable notifications, you must use Apple's iOS Home app, e.g.,

<img src='02.png' width='224' height='488' />

Whenever motion is detected,
your reachable iOS devices will receive a notification, e.g.,

<img src='03.png' width='224' height='488' />

However,
for your doorbell to generate motion notifications,
you must use the [Ring App](https://itunes.apple.com/app/ring-doorbell/id926252661?mt=8) to enable "Motion Alerts", e.g.,

<img src='10.png' width='224' height='488' />

## "Programmable Switch" Actions
HomeKit allows you to creates rules that make use of the ringing of a doorbell.

For example,
going from "Scenes" to "Rules" in the Eve App:

<img src='04.png' width='224' height='488' />
<img src='05.png' width='224' height='488' />

Drill down to adding a "trigger" for the doorbell when it rings:

<img src='06.png' width='224' height='488' />
<img src='07.png' width='224' height='488' />

Optionally, the rule may be tailored to only fire when other "conditions" are met
(e.g., during a certain time of day):

<img src='08.png' width='224' height='488' />

Once those "conditions" are set,
you define a "scene" that tells HomeKit what to do when the "trigger" and "conditions" are met:

<img src='09.png' width='224' height='488' />

# Camera Integration
Possibly soon.

# Many Thanks
Many thanks to [jeroenmoors](https://github.com/jeroenmoors) author of
[php-ring-api](https://github.com/jeroenmoors/php-ring-api).

Many thanks (also) to [davglass](https://github.com/davglass) author of
[doorbot](https://github.com/davglass/doorbot).
