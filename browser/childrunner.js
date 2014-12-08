/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

// TODO(thedeeno): Consider renaming subsuite. IIRC, childRunner is entirely
// distinct from mocha suite, which tripped me up badly when trying to add
// plugin support. Perhaps something like 'batch', or 'bundle'. Something that
// has no mocha correlate. This may also eliminate the need for root/non-root
// suite distinctions.

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
function ChildRunner(url, parentScope) {
  var params = WCT.util.getParams(parentScope.location.search);
  delete params.cli_browser_id;
  params.bust = [Math.random()];

  this.url         = url + WCT.util.paramsToQuery(params);
  this.parentScope = parentScope;

  this.state = 'initializing';
}
WCT.ChildRunner = ChildRunner;

// ChildRunners get a pretty generous load timeout by default.
ChildRunner.loadTimeout = 30000;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track childRunners by URL.
ChildRunner._byUrl = {};

/**
 * @return {ChildRunner} The `ChildRunner` that was registered for this window.
 */
ChildRunner.current = function() {
  return ChildRunner.get(window);
};

/**
 * @param {!Window} target A window to find the ChildRunner of.
 * @param {boolean} traversal Whether this is a traversal from a child window.
 * @return {ChildRunner} The `ChildRunner` that was registered for `target`.
 */
ChildRunner.get = function(target, traversal) {
  var childRunner = ChildRunner._byUrl[target.location.href];
  if (childRunner) return childRunner;
  if (window.parent === window) {  // Top window.
    if (traversal) {
      console.warn('Subsuite loaded but was never registered. This most likely is due to wonky history behavior. Reloading...');
      window.location.reload();
    }
    return null;
  }
  // Otherwise, traverse.
  return window.parent.WCT.ChildRunner.get(target, true);
};

/**
 * Hangs a reference to the ChildRunner's iframe-local wct object
 *
 * TODO(thedeeno): This method is odd to document so the achitecture might need
 * a little rework here. Maybe another named concept? Seeing WCT everywhere is
 * pretty confusing. Also, I don't think we need the parentScope.WCT; to limit
 * confusion I didn't include it.
 *
 * @param {object} wct The ChildRunner's iframe-local wct object
 */
ChildRunner.prototype.prepare = function(wct) {
  this.share = wct.share;
};

/**
 * Loads and runs the subsuite.
 *
 * @param {function} done Node-style callback.
 */
ChildRunner.prototype.run = function(done) {
  WCT.util.debug('ChildRunner#run', this.url);
  this.state = 'loading';
  this.onRunComplete = done;

  this.iframe = document.createElement('iframe');
  this.iframe.src = this.url;
  this.iframe.classList.add('subsuite');

  var container = document.getElementById('subsuites');
  if (!container) {
    container = document.createElement('div');
    container.id = 'subsuites';
    document.body.appendChild(container);
  }
  container.appendChild(this.iframe);

  // let the iframe expand the URL for us.
  this.url = this.iframe.src;
  ChildRunner._byUrl[this.url] = this;

  this.timeoutId = setTimeout(
      this.loaded.bind(this, new Error('Timed out loading ' + this.url)), ChildRunner.loadTimeout);

  this.iframe.addEventListener('error',
      this.loaded.bind(this, new Error('Failed to load document ' + this.url)));

  this.iframe.contentWindow.addEventListener('DOMContentLoaded', this.loaded.bind(this, null));
};

/**
 * Called when the sub suite's iframe has loaded (or errored during load).
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.loaded = function(error) {
  WCT.util.debug('ChildRunner#loaded', this.url, error);
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/**
 * Called in mocha/run.js when all dependencies have loaded, and the child is
 * ready to start running tests
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.ready = function(error) {
  WCT.util.debug('ChildRunner#ready', this.url, error);
  if (this.timeoutId) {
    clearTimeout(this.timeoutId);
  }
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/** Called when the sub suite's tests are complete, so that it can clean up. */
ChildRunner.prototype.done = function done() {
  WCT.util.debug('ChildRunner#done', this.url, arguments);

  this.signalRunComplete();

  if (!this.iframe) return;
  this.iframe.parentNode.removeChild(this.iframe);
};

ChildRunner.prototype.signalRunComplete = function signalRunComplete(error) {
  if (!this.onRunComplete) return;
  this.state = 'complete';
  this.onRunComplete(error);
  this.onRunComplete = null;
};

})();
