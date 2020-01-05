var ConsolarRemotePortal = require('./lib/ConsolarRemotePortal').ConsolarRemotePortal;
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-consolar', 'Consolar', ConsolarAccessory);
};

function ConsolarAccessory(log, config) {
  this.log = log;

  this._serialNumber = config.serialNumber;
  this._baseUrl = config.baseUrl;
  this._sessionCookieRequestUrl = config.sessionCookieRequestUrl;
  this._tempRequestUrl = config.tempRequestUrl;
  this._autoLoginCookieValue = config.autoLoginCookieValue;
  this._tempCacheRefreshIntervalMs = config.tempCacheRefreshIntervalMs;
  this._tempBackgroundRefreshIntervalMs = config.tempBackgroundRefreshIntervalMs;
  this._temps = config.temps;

  this._consolarRemotePortal = new ConsolarRemotePortal(log, this._baseUrl, this._sessionCookieRequestUrl,
    this._tempRequestUrl, this._autoLoginCookieValue, this._tempCacheRefreshIntervalMs);

  this._tempServices = [];
  for (var temp of this._temps) {
    var tempService = new Service.TemperatureSensor(temp.name, 'temp_' + temp.id);
    tempService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this._getTemp.bind(this, temp.id));
    this._tempServices.push(tempService);
    temp.service = tempService;
  }

  // Refresh temperatures in the background, if set to do so
  if (this._tempBackgroundRefreshIntervalMs && this._tempBackgroundRefreshIntervalMs > 0) {
    setInterval(function() {
      for (var temp of this._temps) {
        this._getTemp(temp.id, function (error, tempValue) {
          if (error === null)
            temp.service.updateCharacteristic(Characteristic.CurrentTemperature, tempValue);
        });
      }
    }.bind(this), this._tempBackgroundRefreshIntervalMs);
  }
}

ConsolarAccessory.prototype._getTemp = function (tempId, callback) {
  this.log('_getTemp called with tempId ' + tempId);
  this._consolarRemotePortal.getTemp(tempId, function (error, temp) {
    if (error === null) callback(null, Math.max(0, temp));
    else callback(error, temp);
  });
};

ConsolarAccessory.prototype.getServices = function () {
  var informationService = new Service.AccessoryInformation();
  informationService
    .setCharacteristic(Characteristic.Manufacturer, 'Consolar')
    .setCharacteristic(Characteristic.Model, 'Temperature Sensors')
    .setCharacteristic(Characteristic.SerialNumber, this._serialNumber);
  
  return [informationService].concat(this._tempServices);
};