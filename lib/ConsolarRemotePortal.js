var request = require('request');
var async = require('async');

var SESSION_COOKIE_NAME = 'ibb';
var AUTO_LOGIN_COOKIE_NAME = 'ibbAutologin';
var TEMP_REGEX = /<span id="originalwert_([0-9]+)">(-?[0-9]+\.[0-9])<\/span>/g;

module.exports = {
  ConsolarRemotePortal: ConsolarRemotePortal
};

function ConsolarRemotePortal(log, baseUrl, sessionCookieRequestUrl, tempRequestUrl, autoLoginCookieValue, tempCacheRefreshIntervalMs) {
  this.log = log;

  // Store config settings
  this._baseUrl = baseUrl;
  this._sessionCookieRequestUrl = sessionCookieRequestUrl;
  this._tempRequestUrl = tempRequestUrl;
  this._autoLoginCookieValue = autoLoginCookieValue;
  this._tempCacheRefreshIntervalMs = tempCacheRefreshIntervalMs;

  // Initialise cookie jar with authentication cookie for Consolar Remote Portal
  this._jar = request.jar();
  this._jar.setCookie(request.cookie(AUTO_LOGIN_COOKIE_NAME + '=' + this._autoLoginCookieValue), this._baseUrl);
  this._lastUpdated = null;
  this._latestStatus = null;
  this._readTempQueue = async.queue(function (task, callback) {
    if (this._lastUpdated === null || (Date.now() - this._lastUpdated) > this._tempCacheRefreshIntervalMs) {
      // Need to refresh
      this.log('CRP: Refreshing temps...');
      this._ensureSessionCookieExists(function (error) {
        if (error === null) {
          // Got session cookie, free to get latest status
          request({
            uri: this._tempRequestUrl,
            method: 'GET',
            jar: this._jar
          }, function (error, response, body) {
            this._latestStatus = this._parseTemps(body);
            if (this._latestStatus !== null && this._latestStatus[task.tempId] !== undefined) {
              this._lastUpdated = Date.now();
              callback(null, this._latestStatus[task.tempId]);
            } else {
              callback(new Error('Status not available'));
            }
          }.bind(this));
        } else {
          // Could not get session cookie, cannot continue
          callback(error);
        }
      }.bind(this));
    } else {
      // No need to refresh, use existing status
      if (this._latestStatus !== null && this._latestStatus[task.tempId] !== undefined) {
        callback(null, this._latestStatus[task.tempId]);
      } else {
        callback(new Error('Status not available'));
      }
    }
  }.bind(this), 1);
}

ConsolarRemotePortal.prototype._parseTemps = function (tempHtml) {
  var tempMatch, tempMatches = {};
  while ((tempMatch = TEMP_REGEX.exec(tempHtml))) {
    tempMatches[tempMatch[1]] = parseFloat(tempMatch[2]);
  }
  return tempMatches;
};

ConsolarRemotePortal.prototype._lookupCookie = function (cookies, key) {
  for (var cookie of cookies) {
    if (cookie.key === key)
      return cookie;
  }
  return null;
};

ConsolarRemotePortal.prototype._ensureSessionCookieExists = function (callback) {
  var sessionCookie = this._lookupCookie(this._jar.getCookies(this._baseUrl), SESSION_COOKIE_NAME);
  if (sessionCookie !== null) {
    // Found session cookie, OK to continue
    this.log('CRP: Reusing existing session cookie');
    callback(null);
  } else {
    this.log('CRP: Getting new session cookie');
    request({
      uri: this._sessionCookieRequestUrl,
      method: 'GET',
      jar: this._jar
    }, function () {
      // See if session cookie now exists
      sessionCookie = this._lookupCookie(this._jar.getCookies(this._baseUrl), SESSION_COOKIE_NAME);
      if (sessionCookie !== null)
        callback(null);
      else
        callback(new Error('Could not get session cookie'));
    }.bind(this));
  }
};

ConsolarRemotePortal.prototype.getTemp = function (tempId, callback) {
  this._readTempQueue.push({ tempId: tempId }, callback);
};