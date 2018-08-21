/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

// there is no known webhook/websocket to use for events, this results in very frequent polling under the push-sensor model...

var homespun    = require('homespun-discovery')
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

  this.discoveries = {}
  this.ringbots = {}

  if (api) this.api.on('didFinishLaunching', this._didFinishLaunching.bind(this))
  else this._didFinishLaunching()
}

Ring.prototype._didFinishLaunching = function () {
  var self = this

  var refresh = function () {
    var ring = RingAPI({ email     : self.config.username
                       , password  : self.config.password
                       , retries   : self.options.retries
                       , userAgent : self.options.userAgent
                       })

    self.doorbot = ring
    self._refresh1(function (err) {
      if (err) {
        self.log.error('refresh1', underscore.extend({ username: self.config.username }, err))
        return setTimeout(refresh, 30 * 1000)
      }

      self._refresh2(function (err) {
        if (err) {
          self.log.error('refresh2', underscore.extend({ username: self.config.username }, err))
          return setTimeout(refresh, 30 * 1000)
        }

        return setTimeout(refresh, self.options.ttl * 1000)
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
  , "latitude"                   : 39.8333333
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

var kinds = {
  chime     : [ ]
, chime_pro : [ ]
, jbox_v1   : [ 'ringing', 'motion_detected' ]
, hp_cam_v1 : [ 'floodlight', 'motion_detected' ]
, lpd_v1    : [ 'ringing', 'motion_detected' ]
}

var prototypes = {
  camera    : [ 'battery_level', 'battery_low', 'floodlight', 'motion_detected' ]
, chime     : [ 'ringing' ]
, doorbell  : [ 'battery_level', 'battery_low', 'ringing', 'motion_detected' ]
}

Ring.prototype._refresh1 = function (callback) {
  var self = this

  self.doorbot.devices(function (err, result) {
    var serialNumbers = []

    if (err) return callback(err)

    var handle_device = function(proto, kind, service) {
      var capabilities, properties, types
        , deviceId = service.id
        , device = self.ringbots[deviceId]

      if (!device) {
        if (!service.kind) service.kind = ''
        types = kinds[service.kind]
        if (!types) {
          self.log.warn(kind, { err: 'no entry for ' + service.kind})
          types = [ ]
        }
        if (types.length === 0) types = prototypes[kind]
        console.log('\n!!! name=' + service.description + ' kind=' + kind + ' model=' + service.kind +
                    ' types=' + JSON.stringify(types) +
                    ' notices=' + JSON.stringify(underscore.pick(service, [ 'alerts', 'battery_life' ])))
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
      }

      device.readings = { battery_level : service.battery_life
                        , battery_low   : (service.alerts) && (service.alerts.battery == 'low')
                                              ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
                                              : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                        , reachability  : (service.alerts) && (service.alerts.connection !== 'offline')
                        , floodlight    : !service.led_status ? undefined : service.led_status !== 'off'
                        }
      device._update.bind(device)(device.readings, true)

      serialNumbers.push(service.id.toString())
    }

    if (!result) return callback()

    if (result.doorbots) result.doorbots.forEach(function (service) { handle_device(Doorbot, 'doorbell', service) })
    if (result.chimes) result.chimes.forEach(function (service) { handle_device(Chime, 'chime', service) })
    if (result.stickup_cams) result.stickup_cams.forEach(function (service) { handle_device(Camera, 'camera', service) })

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
  {
    "id"                     : ...,
    "id_str"                 : "...",
    "state"                  : "ringing",
    "protocol"               : "sip",
    "doorbot_id"             : ...,
    "doorbot_description"    : "Front Gate",
    "device_kind"            : "doorbell",
    "motion"                 : false,
    "snapshot_url"           : "",
    "kind"                   : "ding",
    "sip_server_ip"          : "a.b.c.d"
    "sip_server_port"        : "15063",
    "sip_server_tls"         : "false",
    "sip_session_id"         : "...",
    "sip_from"               : "sip:...@ring.com",
    "sip_to"                 : "sip:...@a.b.c.d:15063;transport=tcp",
    "audio_jitter_buffer_ms" : 0,
    "video_jitter_buffer_ms" : 0,
    "sip_endpoints"          : null,
    "expires_in"             : 171,
    "now"                    : 1483114179.70994,
    "optimization_level"     : 3,
    "sip_token"              : "..."
    "sip_ding_id"            : "..."
  }
]
 */

Ring.prototype._refresh2 = function (callback) {
  var self = this

  self.doorbot.dings(function (err, result) {
    if (err) return callback(err)
    console.log('\n!!! dings=' + JSON.stringify(result, null, 2))

    if (!util.isArray(result)) return callback(new Error('not an Array: ' + typeof result))

    underscore.keys(self.ringbots).forEach(function (deviceId) {
      underscore.extend(self.ringbots[deviceId].readings, { motion_detected: false, ringing: false })
    })

    result.forEach(function (event) {
      var device

      if (event.state !== 'ringing') return

      device = self.ringbots[event.doorbot_id]
      if (!device) return self.log.error('dings/active: no device', event)

      underscore.extend(device.readings, { motion_detected : (event.kind === 'motion') || (event.motion)
                                         , ringing         : event.kind === 'ding' })
    })
    underscore.keys(self.ringbots).forEach(function (deviceId) {
      var device = self.ringbots[deviceId]

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

var Chime = function (platform, deviceId, service) {
  if (!(this instanceof Chime)) return new Chime(platform, deviceId, service)

  PushSensor.call(this, platform, deviceId, service)
}
util.inherits(Chime, PushSensor)

var Camera = function (platform, deviceId, service) {
  var self = this

  if (!(this instanceof Camera)) return new Camera(platform, deviceId, service)

  var floodlight

  PushSensor.call(this, platform, deviceId, service)
  
  floodlight = self.getAccessoryService(Service.Lightbulb)
  if (!floodlight) return self.log.warn('Camera', { err: 'could not find Service.Lightbulb' })

  console.log('\n!!! setting callback for on/off')
  floodlight.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
    console.log('\n!!! readings=' + JSON.stringify(self.readings, null, 2))
    console.log('\n!!! set value to ' + JSON.stringify(value))
    if (self.readings.floodlight == value) return callback()

    self.readings.floodlight = value
    platform.doorbot[value ? 'lightOn' : 'lightOff']({ id: deviceId },
                                                     function (err, response, result) {/* jshint unused: false */
      console.log('\n!!! result from doorbot.' + (value ? 'lightOn' : 'lightOff') + ': errP=' + (!!err))
      if (err) {
        self.log.error('setValue', underscore.extend({ deviceId: deviceId }, err))
      } else {
        self._update.bind(self)({ floodlight: value })
      }
       
      callback()
    })
    console.log('\n!!! setting value to ' + JSON.stringify(value))
  })
  console.log('\n!!! callback for on/off is now set')
}
util.inherits(Camera, PushSensor)
