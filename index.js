/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

// there is no known webhook/websocket to use for events, this results in very frequent polling under the push-sensor model...

var debug       = require('debug')('ring-video-doorbell')
  , homespun    = require('homespun-utilities')
  , pushsensor  = homespun.utilities.pushsensor
  , PushSensor  = pushsensor.Sensor
  , RingAPI     = require('doorbot')
  , sensorTypes = homespun.utilities.sensortypes
  , underscore  = require('underscore')
  , util        = require('util')


var Accessory
  , Service
  , Characteristic
  , CommunityTypes
  , UUIDGen

module.exports = function (homebridge) {
  Accessory      = homebridge.platformAccessory
  Service        = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  CommunityTypes = require('hap-nodejs-community-types')(homebridge)
  UUIDGen        = homebridge.hap.uuid

  pushsensor.init(homebridge)
  homebridge.registerPlatform('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', Ring, true)
}


var Ring = function (log, config, api) {
  if (!(this instanceof Ring)) return new Ring(log, config, api)

  if (!config) return

  this.log = log
  this.config = config
  this.api = api

  this.options = underscore.defaults(this.config.options || {}, { retries: 5, ttl: 5, verboseP: false })
  if (this.options.retries < 1) this.options.retries = 5
  if (this.options.ttl < 1) this.options.ttl = 5

  this.ringing = underscore.defaults(this.config.ringing || {}, { event: '', motion: false })
  this.ringing.press = { double         : Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS
                       , 'double-press' : Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS
                       , long           : Characteristic.ProgrammableSwitchEvent.LONG_PRESS
                       , 'long-press'   : Characteristic.ProgrammableSwitchEvent.LONG_PRESS
                       }[this.ringing.event.toLowerCase()] || Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS

  this.discoveries = {}
  this.ringbots = {}
  this.lastdings = []

  if (api) this.api.on('didFinishLaunching', this._didFinishLaunching.bind(this))
  else this._didFinishLaunching()
}

Ring.prototype._didFinishLaunching = function () {
  var self = this

  var refresh = function () {
    if (!self.doorbot) {
      self.cycles = 0
      self.doorbot = RingAPI({ email     : self.config.username
                             , password  : self.config.password
                             , retries   : self.options.retries
                             , userAgent : self.options.userAgent
                             })
    }

    self._refresh1(function (err) {
      if (err) {
        self.log.error('refresh1', { username: self.config.username, diagnostic: err.toString() })
        self.doorbot = null
        debug('reconnecting in 30s')
        return setTimeout(refresh, 30 * 1000)
      }

      self._refresh2(function (err) {
        if (err) {
          self.log.error('refresh2', { username: self.config.username, diagnostic: err.toString() })
          self.doorbot = null
          debug('reconnecting in 30s')
          return setTimeout(refresh, 30 * 1000)
        }

        setTimeout(refresh, self.options.ttl * 1000)
      })
    })
  }

  refresh()

  self.log('didFinishLaunching')
}

Ring.prototype._addAccessory = function (device) {
  var self = this

  var accessory = new Accessory(device.name, device.uuid)

  accessory.on('identify', function (paired, callback) {
    self.log(accessory.displayName, ': identify request')
    callback()
  })

  if (device.attachAccessory.bind(device)(accessory)) self.api.updatePlatformAccessories([ accessory ])

  if (!self.discoveries[accessory.UUID]) {
    self.api.registerPlatformAccessories('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', [ accessory ])
    self.log('addAccessory', underscore.pick(device, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
  }
}

Ring.prototype.configurationRequestHandler = function (context, request, callback) {/* jshint unused: false */
  this.log('configuration request', { context: context, request: request })
}

Ring.prototype.configureAccessory = function (accessory) {
  var self = this

  accessory.on('identify', function (paired, callback) {
    self.log(accessory.displayName, ': identify request')
    callback()
  })

  self.discoveries[accessory.UUID] = accessory
  self.log('configureAccessory', underscore.pick(accessory, [ 'UUID', 'displayName' ]))
}

/*
{ "doorbots"                     :
  { "id"                         : ...
  , "description"                : "Front Gate"
  , "device_id"                  : "..."
  , "time_zone"                  : "America\/Chicago"
  , "subscribed"                 : true
  , "subscribed_motions"         : true
  , "battery_life"               : 0
  , "external_connection"        : false
  , "firmware_version"           : "Up to Date"
  , "kind"                       : "jbox_v1"
  , "latitude"                   :  39.833333
  , "longitude"                  : -98.585522
  , "address"                    : ".... .... .., Lebanon, KS 66952 USA"
  , "settings"                   : { ... }
  , "features"                   : { ... }
  , "owned"                      : true
  , "alerts"                     :
    { "connection"               : "offline"
    , "battery"                  : "low"
    }
  , "owner"                      :
    { "id"                       : ...
    , "first_name"               : "..."
    , "last_name"                : "..."
    , "email"                    : "user@example.com"
    }
  }
, "authorized_doorbots"          : [ ... ]
, "chimes"                       : [ ... ]
, "stickup_cams"                 : [ ... ]
, "base_stations"                : [ ... ]
}
 */

var kinds =
{ chime     : [ ]
, chime_pro : [ ]
, jbox_v1   : [ 'ringing',    'motion_detected' ]
, hp_cam_v1 : [ 'floodlight', 'motion_detected' ]
, lpd_v1    : [ 'ringing',    'motion_detected' ]
/*
, dpd_v3    : [ ]
, dpd_v4    : [ ]
, hp_cam_v2 : [ 'floodlight', 'motion_detected' ]
, lpd_v2    : [ 'ringing', 'motion_detected' ]
, stickup_cam_v3 : [ ]
, stickup_cam_v4 : [ ]
 */
}

var prototypes =
{ camera    : [ 'battery_level', 'battery_low', 'floodlight', 'motion_detected' ]
, chime     : [ 'ringing' ]
, doorbell  : [ 'battery_level', 'battery_low', 'ringing', 'motion_detected' ]
}

Ring.prototype._refresh1 = function (callback) {
  var self = this

  if (self.cycles++ % 10) return callback()

  if (self.cycles === 1) debug('connecting')
  self.doorbot.devices(function (err, result) {
    var entries
      , serialNumbers = []

    if (err) return callback(err)

    if (self.cycles === 1) {
      entries = ''
      underscore.keys(result || {}).forEach(function (key) {
        entries += ' ' + key + '=' + result[key].length
      })
      debug('connected', entries.length ? entries.trimLeft() : 'nothing reported!?!')
    }

    var handle_device = function (proto, kind, service) {
      var capabilities, properties
        , deviceId = service.id
        , device = self.ringbots[deviceId]
        , types = prototypes[kind]

      if (!device) {
        if (!service.kind) service.kind = ''
        if (!kinds[service.kind]) self.log.warn(kind, { err: 'no entry for ' + service.kind})
        if ((!service.battery_life) || (service.battery_life >= 100)) {
          types = underscore.difference(types, [ 'battery_level', 'battery_low'])
        }
        console.log('\n!!! name=' + service.description + ' kind=' + kind + ' model=' + service.kind +
                    ' types=' + JSON.stringify(types) +
                    ' notices=' + JSON.stringify(underscore.pick(service, [ 'alerts', 'battery_life' ])))
        if (!proto) return

        capabilities = underscore.pick(sensorTypes, types)
        properties = { name             : service.description
                     , manufacturer     : 'Bot Home Automation, Inc.'
                     , model            : service.kind
                     , serialNumber     : service.id.toString()
                     , firmwareRevision : service.firmware_version
                     , hardwareRevision : ''
                     }

        device = new proto(self, service.id.toString(), { capabilities: capabilities, properties: properties })
        self.ringbots[deviceId] = device
/*
        self.doorbot.vod({ id: deviceId }, function (err, result) {
          console.log('vod: errP=' + (err && err.toString()) + ' result=' + JSON.stringify(result, null, 2))
        })
 */
      }

      device.readings = { battery_level : service.battery_life
                        , battery_low   : (service.alerts) && (service.alerts.battery == 'low')
                                              ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
                                              : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                        , reachability  : (service.alerts) && (service.alerts.connection !== 'offline')
                        , floodlight    : !service.led_status ? undefined : service.led_status !== 'off'
                        }
// not necessary given the pushsensor's _update logic, but useful for debugging
      device.readings = underscore.pick(device.readings, underscore.keys(device.capabilities))
      debug(device.name, { readings: device.readings })
      device._update.bind(device)(device.readings, true)

      serialNumbers.push(service.id.toString())
    }

    if (!result) return callback()

    if (result.doorbots) result.doorbots.forEach(function (service) { handle_device(Doorbot, 'doorbell', service) })
    if (result.authorized_doorbots) result.authorized_doorbots.forEach(function (service) {
      handle_device(Doorbot, 'doorbell', service)
    })
    if (result.chimes) result.chimes.forEach(function (service) { handle_device(undefined, 'chime', service) })
    if (result.stickup_cams) result.stickup_cams.forEach(function (service) { handle_device(Camera, 'camera', service) })
    if (result.base_stations) result.base_stations.forEach(function (service) { handle_device(undefined, 'station', service) })

    underscore.keys(self.ringbots).forEach(function (deviceId) {
      var device = self.ringbots[deviceId]
        , accessory = device.accessory

      if (serialNumbers.indexOf(device.serialNumber) !== -1) return

      if (accessory) {
        self.api.registerPlatformAccessories('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', [ accessory ])
        self.log('removeAccessory', underscore.pick(device, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
      }

      delete self.ringbots[deviceId]
    })

    callback()
  })
}

/*
[
  { "id"                     : ...
  , "id_str"                 : "..."
  , "state"                  : "ringing"
  , "protocol"               : "sip"
  , "doorbot_id"             : ...
  , "doorbot_description"    : "Front Gate"
  , "device_kind"            : "doorbell"
  , "motion"                 : false
  , "snapshot_url"           : ""
  , "kind"                   : "ding"
  , "sip_server_ip"          : "a.b.c.d
  , "sip_server_port"        : "15063"
  , "sip_server_tls"         : "false"
  , "sip_session_id"         : "..."
  , "sip_from"               : "sip:...@ring.com"
  , "sip_to"                 : "sip:...@a.b.c.d:15063;transport=tcp"
  , "audio_jitter_buffer_ms" : 0
  , "video_jitter_buffer_ms" : 0
  , "sip_endpoints"          : null
  , "expires_in"             : 171
  , "now"                    : 1483114179.70994
  , "optimization_level"     : 3
  , "sip_token"              : "...
  , "sip_ding_id"            : "..."
  }
]
 */

Ring.prototype._refresh2 = function (callback) {
  var self = this

  self.doorbot.dings(function (err, result) {
    if (err) return callback(err)

    if (!util.isArray(result)) return callback(new Error('not an Array: ' + typeof result))

    underscore.keys(self.ringbots).forEach(function (deviceId) {
      var readings = self.ringbots[deviceId].readings
      
      delete readings.motion_detected
      delete readings.ringing
    })

    var newdings = []
    result.forEach(function (event) {
      var device = self.ringbots[event.doorbot_id]

      newdings.push(event.id_str)
      if (!device) return self.log.error('dings/active: no device', event)

      if (((event.kind !== 'ding') && (event.kind !== 'motion'))
              || (self.lastdings.indexOf(event.id_str) !== -1)) return

      if ((event.kind === 'motion') || (event.motion)) device.readings.motion_detected = true
      if (event.kind === 'ding') {
        device.readings.ringing = self.ringing.press
        if (self.ringing.motion) device.readings.motion_detected = true
      }
    })
    self.lastdings = newdings

    underscore.keys(self.ringbots).forEach(function (deviceId) {
      var device = self.ringbots[deviceId]

      debug(device.name, { readings: device.readings })
      device._update.bind(device)(device.readings, true)
    })

    callback()
  })
}


var Doorbot = function (platform, deviceId, service) {
  if (!(this instanceof Doorbot)) return new Doorbot(platform, deviceId, service)

  PushSensor.call(this, platform, deviceId, service)
}
util.inherits(Doorbot, PushSensor)

/* perhaps later...
var Chime = function (platform, deviceId, service) {
  if (!(this instanceof Chime)) return new Chime(platform, deviceId, service)

  PushSensor.call(this, platform, deviceId, service)
}
util.inherits(Chime, PushSensor)
 */

var Camera = function (platform, deviceId, service) {
  var self = this

  if (!(this instanceof Camera)) return new Camera(platform, deviceId, service)

  var floodlight

  PushSensor.call(this, platform, deviceId, service)
  
  floodlight = self.getAccessoryService(Service.Lightbulb)
  if (!floodlight) return self.log.warn('Camera', { err: 'could not find Service.Lightbulb' })

  debug('setting callback for on/off')
  floodlight.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
    if (self.readings.floodlight == value) return callback()

    if (!self.platform.doorbot) {
      var err = new Error('not connected for updating floodlight')

      self.log.error('setValue', { deviceId: deviceId, diagnostic: err.toString() })
      return callback(err)
    }

    debug ('set value to ' + JSON.stringify(value) + ', currently ' + JSON.stringify(self.readings.floodlight))
    self.readings.floodlight = value
    self.platform.doorbot[value ? 'lightOn' : 'lightOff']({ id: deviceId },
                                                 function (err, response, result) {/* jshint unused: false */
      debug('result from doorbot ' + (value ? 'lightOn' : 'lightOff') + ': errP=' + (!!err))
      if (err) {
        self.log.error('setValue', { deviceId: deviceId, diagnostic: err.toString() })
      } else {
        self._update.bind(self)({ floodlight: value })
      }
       
      callback()
    })
    debug('setting value to ' + JSON.stringify(value))
  })
  debug ('callback for on/off is now set')
}
util.inherits(Camera, PushSensor)
