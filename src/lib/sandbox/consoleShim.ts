/**
 * JavaScript snippet injected into sandboxed iframes to capture
 * console output and forward it to the parent via postMessage.
 */
export const CONSOLE_SHIM_SCRIPT = `
(function() {
  var MAX = 100;
  var count = 0;
  var origConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };

  function send(level, args) {
    if (count >= MAX) return;
    count++;
    var serialized = [];
    for (var i = 0; i < args.length; i++) {
      try {
        serialized.push(typeof args[i] === 'string' ? args[i] : JSON.stringify(args[i], null, 2));
      } catch (e) {
        serialized.push(String(args[i]));
      }
    }
    window.parent.postMessage({
      type: 'sandbox-console',
      level: level,
      args: serialized,
    }, '*');
  }

  console.log = function() { send('log', arguments); origConsole.log.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origConsole.warn.apply(console, arguments); };
  console.error = function() { send('error', arguments); origConsole.error.apply(console, arguments); };
  console.info = function() { send('info', arguments); origConsole.info.apply(console, arguments); };

  window.onerror = function(msg, src, line, col, err) {
    send('error', [msg + (line ? ' (line ' + line + ')' : '')]);
  };

  window.addEventListener('unhandledrejection', function(e) {
    send('error', ['Unhandled promise rejection: ' + (e.reason || e)]);
  });
})();
`
